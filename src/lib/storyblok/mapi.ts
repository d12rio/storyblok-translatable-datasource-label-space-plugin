import "server-only";
import type { AppSession } from "@storyblok/app-extension-auth";
import { getManagementBaseUrl } from "@storyblok/region-helper";
import { GLOSSARY_SLUG, glossaryFromRows, type Glossary } from "../checks";
import { normalizeSettings, type PluginSettings } from "../settings";
import { STARTER_LABELS, type LabelsSetup } from "../starter";
import type { CellChange, Datasource, DatasourceEntry, Dimension, LabelRow } from "./types";

type MapiSession = Pick<AppSession, "accessToken" | "spaceId" | "region">;

const PER_PAGE = 1000;
const MAX_RETRIES = 5;

async function mapi(session: MapiSession, path: string, init?: RequestInit) {
  const url = `${getManagementBaseUrl(session.region)}/v1/spaces/${session.spaceId}${path}`;

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      ...init,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
    // No Retry-After header is documented, so back off exponentially on 429.
    if (res.status === 429 && attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 2 ** attempt * 500));
      continue;
    }
    if (!res.ok) {
      throw new Error(`Storyblok ${init?.method ?? "GET"} ${path} failed: ${res.status} ${await res.text()}`);
    }
    return res;
  }
}

export async function listDatasources(session: MapiSession): Promise<Datasource[]> {
  const res = await mapi(session, `/datasources?per_page=${PER_PAGE}`);
  const { datasources } = (await res.json()) as { datasources: Datasource[] };
  return datasources.map(({ id, name, slug, dimensions }) => ({
    id,
    name,
    slug,
    dimensions: dimensions.map(({ id, name, entry_value }) => ({ id, name, entry_value })),
  }));
}

async function listEntries(session: MapiSession, datasourceId: number, dimensionId?: number) {
  const entries: DatasourceEntry[] = [];
  for (let page = 1; ; page++) {
    const params = new URLSearchParams({
      datasource_id: String(datasourceId),
      per_page: String(PER_PAGE),
      page: String(page),
    });
    if (dimensionId) params.set("dimension", String(dimensionId));
    const res = await mapi(session, `/datasource_entries?${params}`);
    const body = (await res.json()) as { datasource_entries: DatasourceEntry[] };
    entries.push(...body.datasource_entries);
    const total = Number(res.headers.get("total") ?? entries.length);
    if (entries.length >= total || body.datasource_entries.length < PER_PAGE) return entries;
  }
}

// The API returns one dimension per request, so we fetch each language and merge by entry id.
export async function loadLabelRows(session: MapiSession, datasource: Datasource): Promise<LabelRow[]> {
  const [base, ...perDimension] = await Promise.all([
    listEntries(session, datasource.id),
    ...datasource.dimensions.map((d) => listEntries(session, datasource.id, d.id)),
  ]);

  const rows = new Map<number, LabelRow>(
    base.map((e) => [e.id, { id: e.id, key: e.name, value: e.value, translations: {} }]),
  );
  datasource.dimensions.forEach((dimension, i) => {
    for (const entry of perDimension[i]) {
      const row = rows.get(entry.id);
      if (row && entry.dimension_value) row.translations[dimension.id] = entry.dimension_value;
    }
  });
  return [...rows.values()];
}

// PUT replaces the entry, so always send the English default along with a dimension value.
export async function saveCell(session: MapiSession, change: CellChange) {
  const body = change.dimensionId
    ? {
        datasource_entry: { name: change.key, value: change.defaultValue, dimension_value: change.value },
        dimension_id: change.dimensionId,
      }
    : { datasource_entry: { name: change.key, value: change.value } };
  await mapi(session, `/datasource_entries/${change.entryId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export type BulkChange = { entryId: number; value: string };
export type BulkResult = { imported: number; fixed: number; failed: string[] };

const csvField = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s);
const toCsv = (rows: [string, string][]) => ["name,value", ...rows.map((r) => r.map(csvField).join(","))].join("\n");

const columnValue = (e: DatasourceEntry, dimensionId: number | null) =>
  (dimensionId ? e.dimension_value : e.value) ?? "";

// Writes one whole column (the default language or one dimension) with a single import request,
// then reads it back and repairs any entry that didn't come out as intended with a normal update.
export async function bulkSaveColumn(
  session: MapiSession,
  datasourceId: number,
  dimensionId: number | null,
  changes: BulkChange[],
): Promise<BulkResult> {
  const before = await listEntries(session, datasourceId, dimensionId ?? undefined);
  const desired = new Map(before.map((e) => [e.id, columnValue(e, dimensionId)]));
  for (const change of changes) desired.set(change.entryId, change.value);

  // Untranslated entries stay out of a dimension import, so they keep falling back to the default.
  const csvRows = before
    .filter((e) => !dimensionId || desired.get(e.id)!.trim() !== "")
    .map((e): [string, string] => [e.name, desired.get(e.id)!]);
  await mapi(session, "/datasource_entries/import", {
    method: "POST",
    body: JSON.stringify({ datasource_id: datasourceId, csv: toCsv(csvRows), ...(dimensionId && { dimension: dimensionId }) }),
  });

  const after = new Map((await listEntries(session, datasourceId, dimensionId ?? undefined)).map((e) => [e.id, e]));
  const failed: string[] = [];
  let fixed = 0;

  for (const entry of before) {
    const now = after.get(entry.id);
    if (!now) {
      failed.push(entry.name);
      continue;
    }
    const want = desired.get(entry.id)!;
    const defaultChanged = dimensionId !== null && now.value !== entry.value;
    if (columnValue(now, dimensionId) === want && !defaultChanged) continue;
    try {
      await saveCell(session, {
        entryId: entry.id,
        key: entry.name,
        dimensionId,
        value: want,
        defaultValue: entry.value,
      });
      fixed++;
    } catch {
      failed.push(entry.name);
    }
  }

  return { imported: changes.length, fixed, failed };
}

// The glossary is just another datasource: one entry per term, one dimension per language.
export async function loadGlossary(session: MapiSession, datasources: Datasource[]): Promise<Glossary | null> {
  const datasource = datasources.find((d) => d.slug === GLOSSARY_SLUG);
  if (!datasource) return null;
  const rows = await loadLabelRows(session, datasource);
  return glossaryFromRows(datasource, rows);
}

export async function createGlossary(session: MapiSession, dimensions: Dimension[]) {
  const res = await mapi(session, "/datasources", {
    method: "POST",
    body: JSON.stringify({
      datasource: {
        name: "Translation glossary",
        slug: GLOSSARY_SLUG,
        dimensions_attributes: dimensions.map((d) => ({ name: d.name, entry_value: d.entry_value })),
      },
    }),
  });
  const { datasource } = (await res.json()) as { datasource: { id: number } };
  await mapi(session, "/datasource_entries", {
    method: "POST",
    body: JSON.stringify({ datasource_entry: { name: "Storyblok", value: "Storyblok", datasource_id: datasource.id } }),
  });
}

// Space-level settings live on this plugin's app provision. We find it by slug in the space's list,
// which also gives us the app id the update needs.
async function findProvision(session: MapiSession) {
  const slug = process.env.STORYBLOK_SPACE_PLUGIN_SLUG;
  if (!slug) throw new Error("Missing environment variable STORYBLOK_SPACE_PLUGIN_SLUG. See .env.example.");
  const res = await mapi(session, "/app_provisions");
  const { app_provisions } = (await res.json()) as {
    app_provisions: { app_id: number | string; slug: string; space_level_settings?: unknown }[];
  };
  const provision = app_provisions.find((p) => p.slug === slug);
  if (!provision) throw new Error(`The plugin "${slug}" isn't installed in this space.`);
  return provision;
}

export async function loadSettings(session: MapiSession): Promise<PluginSettings> {
  return normalizeSettings((await findProvision(session)).space_level_settings);
}

export async function saveSettings(session: MapiSession, settings: PluginSettings) {
  const { app_id } = await findProvision(session);
  await mapi(session, `/app_provisions/${app_id}`, {
    method: "PUT",
    body: JSON.stringify({ app_provision: { space_level_settings: normalizeSettings(settings) } }),
  });
}

// Creates a datasource with one dimension per language, plus optional starter labels.
// Entries go one by one through the documented create endpoint, paced for the rate limit.
export async function createLabelsDatasource(session: MapiSession, setup: LabelsSetup) {
  const res = await mapi(session, "/datasources", {
    method: "POST",
    body: JSON.stringify({
      datasource: {
        name: setup.name,
        slug: setup.slug,
        dimensions_attributes: setup.languages.map((l) => ({ name: l.name, entry_value: l.code })),
      },
    }),
  });
  const { datasource } = (await res.json()) as { datasource: { id: number; slug: string } };
  if (setup.withStarterLabels) {
    for (const [name, value] of STARTER_LABELS) {
      const started = Date.now();
      await mapi(session, "/datasource_entries", {
        method: "POST",
        body: JSON.stringify({ datasource_entry: { name, value, datasource_id: datasource.id } }),
      });
      await new Promise((r) => setTimeout(r, Math.max(0, 300 - (Date.now() - started))));
    }
  }
  return datasource.slug;
}
