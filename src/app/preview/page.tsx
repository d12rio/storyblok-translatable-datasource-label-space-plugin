import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LoadingLabels } from "@/components/loading-labels";
import {
  previewBulkSave,
  previewLoadSettings,
  previewReview,
  previewSaveSettings,
  previewSave,
  previewSetUpGlossary,
  previewSetUpLabels,
  previewTranslate,
} from "@/app/preview/actions";
import { LabelEditor } from "@/components/label-editor";
import { SetupLabels } from "@/components/setup-labels";
import { GLOSSARY_SLUG, glossaryFromRows } from "@/lib/checks";
import type { Datasource, DatasourceEntry, LabelRow } from "@/lib/storyblok/types";

// Development-only: renders the editor with read-only CDN data and a fake save, no Storyblok login needed.
const CDN = "https://api.storyblok.com/v2/cdn";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function PreviewPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<LoadingLabels />}>
      <Preview searchParams={searchParams} />
    </Suspense>
  );
}

async function cdn<T>(path: string, params: Record<string, string>) {
  const query = new URLSearchParams({ ...params, token: process.env.STORYBLOK_PREVIEW_TOKEN ?? "" });
  const res = await fetch(`${CDN}${path}?${query}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`CDN ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

async function Preview({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  if (process.env.NODE_ENV !== "development" || !process.env.STORYBLOK_PREVIEW_TOKEN) notFound();

  const all = (await cdn<{ datasources: Datasource[] }>("/datasources", { per_page: "1000" })).datasources;
  if (params.loading) return <LoadingLabels />;
  const settings = await previewLoadSettings();
  if (params.setup) {
    return <SetupLabels session={{ spaceId: 0, userId: 0 }} sourceLanguage={settings.sourceLanguage.name} onSetUp={previewSetUpLabels} />;
  }
  const allDatasources = all.filter((d) => d.dimensions.length > 0);
  const chosen = allDatasources.filter((d) => settings.datasources.includes(d.slug));
  const datasources = chosen.length ? chosen : allDatasources;
  const datasource =
    datasources.find((d) => d.slug === params.datasource) ?? datasources.find((d) => d.slug === "labels")!;

  const [rows, glossary] = await Promise.all([loadRows(datasource), loadGlossary(all)]);

  return (
    <LabelEditor
      key={datasource.id}
      session={{ spaceId: 0, userId: 0 }}
      onSave={previewSave}
      onBulkSave={previewBulkSave}
      onTranslate={previewTranslate}
      onReview={previewReview}
      onSetUpGlossary={previewSetUpGlossary}
      onSaveSettings={previewSaveSettings}
      glossary={glossary}
      settings={settings}
      settingsError={null}
      allDatasources={allDatasources}
      datasources={datasources}
      datasource={datasource}
      initialRows={rows}
    />
  );
}

async function loadRows(datasource: Datasource): Promise<LabelRow[]> {
  const entries = (dimension?: string) =>
    cdn<{ datasource_entries: DatasourceEntry[] }>("/datasource_entries", {
      datasource: datasource.slug,
      per_page: "1000",
      ...(dimension && { dimension }),
    }).then((r) => r.datasource_entries);

  const [base, ...perDimension] = await Promise.all([
    entries(),
    ...datasource.dimensions.map((d) => entries(d.entry_value)),
  ]);
  const rows: LabelRow[] = base.map((e) => ({ id: e.id, key: e.name, value: e.value, translations: {} }));
  const byId = new Map(rows.map((r) => [r.id, r]));
  datasource.dimensions.forEach((d, i) => {
    for (const e of perDimension[i]) {
      if (e.dimension_value) byId.get(e.id)!.translations[d.id] = e.dimension_value;
    }
  });
  return rows;
}

async function loadGlossary(datasources: Datasource[]) {
  const datasource = datasources.find((d) => d.slug === GLOSSARY_SLUG);
  return datasource ? glossaryFromRows(datasource, await loadRows(datasource)) : null;
}
