"use client";

import { confirm } from "@ui-sdk/react/alert-dialog";
import { Button } from "@ui-sdk/react/button";
import { Input, InputClear, InputGroup } from "@ui-sdk/react/input";
import { Listbox, ListboxItem } from "@ui-sdk/react/listbox";
import { Meter, MeterIndicator, MeterTrack, MeterValue } from "@ui-sdk/react/meter";
import { Menu, MenuContent, MenuGroup, MenuGroupLabel, MenuItem, MenuSeparator, MenuTrigger } from "@ui-sdk/react/menu";
import { OverlayHost } from "@ui-sdk/react/overlays";
import { Progress, ProgressIndicator, ProgressLabel, ProgressTrack, ProgressValue } from "@ui-sdk/react/progress";
import {
  SegmentedControl,
  SegmentedControlIndicator,
  SegmentedControlItem,
} from "@ui-sdk/react/segmented-control";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/react/select";
import { useShortcut, useShortcutHint } from "@ui-sdk/react/shortcuts";
import { Toast, ToastAction, ToastClose, ToastDescription, ToastRegion, ToastTitle, toast } from "@ui-sdk/react/toast";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { bulkSave, review, saveChange, saveSpaceSettings, setUpGlossary, translate } from "@/app/actions";
import { AiInstructions } from "@/components/ai-instructions";
import { SettingsDialog } from "@/components/settings-dialog";
import type { PluginSettings } from "@/lib/settings";
import { cellIssues, LabelRowView, MoreIcon, pickByRow, ReviewIcon, SparkleIcon, type Reviews } from "@/components/label-row";
import { glossaryFor, type Glossary } from "@/lib/checks";
import { signInUrl } from "@/lib/storyblok/urls";
import {
  applySaved,
  cellId,
  columnsOf,
  currentValue,
  filterRows,
  isMissing,
  namespaceStats,
  savedValue,
  toChanges,
  type ColumnId,
  type Drafts,
  type StatusFilter,
} from "@/lib/labels";
import type { SessionRef } from "@/lib/storyblok/session";
import type { CellChange, Datasource, LabelRow } from "@/lib/storyblok/types";

const REQUEST_INTERVAL_MS = 350;
const TRANSLATE_BATCH = 40;
// From this many changes in one language, a single import request beats one update per entry.
const BULK_THRESHOLD = 10;
// With many languages, start with a few columns; people pick the rest.
const DEFAULT_VISIBLE_LANGUAGES = 2;

// Resolves once at least `ms` have passed since it was created, to stay under Storyblok's rate limit.
function pace(ms: number) {
  const started = Date.now();
  return () => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms - (Date.now() - started))));
}

type Props = {
  session: SessionRef;
  onSave: typeof saveChange;
  onBulkSave: typeof bulkSave;
  onTranslate: typeof translate;
  onReview: typeof review;
  onSetUpGlossary: typeof setUpGlossary;
  onSaveSettings: typeof saveSpaceSettings;
  glossary: Glossary | null;
  settings: PluginSettings;
  settingsError: string | null;
  // Every datasource with dimensions, for the Settings dialog (not filtered by the settings).
  allDatasources: Datasource[];
  datasources: Datasource[];
  datasource: Datasource;
  initialRows: LabelRow[];
};

export function LabelEditor({
  session,
  onSave,
  onBulkSave,
  onTranslate,
  onReview,
  onSetUpGlossary,
  onSaveSettings,
  glossary,
  settings,
  settingsError,
  allDatasources,
  datasources,
  datasource,
  initialRows,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const storageKey = `drafts:${session.spaceId}:${datasource.id}`;
  const [rows, setRows] = useState(initialRows);
  const [drafts, setDrafts] = useState<Drafts>({});
  const [reviews, setReviews] = useState<Reviews>({});
  const [query, setQuery] = useState("");
  const [namespace, setNamespace] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const allColumns = useMemo(() => columnsOf(datasource), [datasource]);
  const [visible, setVisible] = useState(() =>
    datasource.dimensions.slice(0, DEFAULT_VISIBLE_LANGUAGES).map((d) => String(d.id)),
  );
  const visibleKey = `languages:${session.spaceId}:${datasource.id}`;
  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(null);

  const known = new Set(datasource.dimensions.map((d) => String(d.id)));
  const columns: ColumnId[] = ["default", ...visible.filter((id) => known.has(id)).map(Number)];
  const languageName = useCallback(
    (column: ColumnId) =>
      column === "default"
        ? `${settings.sourceLanguage.name} (default)`
        : (datasource.dimensions.find((d) => d.id === column)?.name ?? String(column)),
    [datasource, settings],
  );
  const codes = useMemo(
    () => Object.fromEntries(datasource.dimensions.map((d) => [String(d.id), d.entry_value])),
    [datasource],
  );
  const dimensionColumns = useMemo(() => datasource.dimensions.map((d) => d.id), [datasource]);

  const deferredQuery = useDeferredValue(query);
  const editedCount = Object.keys(drafts).length;
  const saveHint = useShortcutHint("mod+s");

  const rowsWithIssues = useMemo(
    () =>
      new Set(
        rows
          .filter((row) =>
            dimensionColumns.some(
              (c) => cellIssues(row, c, codes[String(c)], drafts, reviews, glossary, settings.maxLengthRatio).length,
            ),
          )
          .map((row) => row.id),
      ),
    [rows, dimensionColumns, codes, drafts, reviews, glossary, settings.maxLengthRatio],
  );
  const filtered = useMemo(
    () =>
      filterRows(rows, {
        columns: allColumns,
        drafts,
        namespace,
        query: deferredQuery,
        status,
        hasIssues: (row) => rowsWithIssues.has(row.id),
      }),
    [rows, allColumns, drafts, namespace, deferredQuery, status, rowsWithIssues],
  );
  const namespaces = useMemo(() => namespaceStats(rows, allColumns, drafts), [rows, allColumns, drafts]);
  const completion = useMemo(() => {
    const result: Record<string, number> = {};
    for (const column of allColumns) {
      const filled = rows.filter((r) => currentValue(r, column, drafts).trim() !== "").length;
      result[String(column)] = rows.length ? Math.round((filled / rows.length) * 100) : 100;
    }
    return result;
  }, [rows, allColumns, drafts]);
  const missingTotal = useMemo(() => rows.filter((r) => isMissing(r, allColumns, drafts)).length, [rows, allColumns, drafts]);

  useEffect(() => {
    try {
      const stored = JSON.parse(sessionStorage.getItem(storageKey) ?? "{}") as Drafts;
      // sessionStorage only exists after hydration, so restoring drafts has to happen in an effect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (Object.keys(stored).length) setDrafts(stored);
    } catch {}
  }, [storageKey]);

  useEffect(() => {
    try {
      if (editedCount) sessionStorage.setItem(storageKey, JSON.stringify(drafts));
      else sessionStorage.removeItem(storageKey);
    } catch {}
  }, [storageKey, drafts, editedCount]);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(visibleKey) ?? "null") as string[] | null;
      const known = stored?.filter((id) => datasource.dimensions.some((d) => String(d.id) === id));
      // localStorage only exists after hydration, so restoring the choice has to happen in an effect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (known?.length) setVisible(known);
    } catch {}
  }, [visibleKey, datasource]);

  // The picker reports its selection in list order, so keep the order people arranged and append new picks.
  function pickLanguages(selected: string[]) {
    chooseLanguages([...visible.filter((id) => selected.includes(id)), ...selected.filter((id) => !visible.includes(id))]);
  }

  function moveColumn(id: number, to: "left" | "right" | "first") {
    const key = String(id);
    const order = visible.filter((v) => v !== key);
    const at = visible.indexOf(key);
    const index = to === "first" ? 0 : Math.max(0, Math.min(order.length, at + (to === "left" ? -1 : 1)));
    order.splice(index, 0, key);
    chooseLanguages(order);
  }

  function chooseLanguages(next: string[]) {
    setVisible(next);
    try {
      localStorage.setItem(visibleKey, JSON.stringify(next));
    } catch {}
  }

  useEffect(() => {
    if (!editedCount) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [editedCount]);

  const setCell = useCallback((row: LabelRow, column: ColumnId, value: string) => {
    const id = cellId(row.id, column);
    setReviews((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setDrafts((prev) => {
      const next = { ...prev };
      if (value === savedValue(row, column)) delete next[id];
      else next[id] = value;
      return next;
    });
  }, []);

  const latest = useRef({ rows, drafts });
  useEffect(() => {
    latest.current = { rows, drafts };
  });

  // Built from saved translations while translating (stable, so batches share the prompt cache)
  // and from the current drafts while reviewing (so the review sees what's on screen).
  function aiRequest(dimensionId: number, current: boolean) {
    const dimension = datasource.dimensions.find((d) => d.id === dimensionId)!;
    const { rows, drafts } = latest.current;
    return {
      settings,
      language: { name: dimension.name, code: dimension.entry_value },
      glossary: glossaryFor(glossary, dimension.entry_value),
      context: rows.map((row) => ({
        key: row.key,
        source: currentValue(row, "default", drafts),
        existing: current ? currentValue(row, dimensionId, drafts) : (row.translations[dimensionId] ?? ""),
      })),
    };
  }

  // Results land as drafts, so people review AI translations before anything is saved to Storyblok.
  async function translateRows(dimensionId: number, targets: LabelRow[], onBatch?: (done: number) => void) {
    const dimension = datasource.dimensions.find((d) => d.id === dimensionId);
    if (!dimension || !targets.length) return 0;
    const base = aiRequest(dimensionId, false);
    let translated = 0;

    for (let i = 0; i < targets.length; i += TRANSLATE_BATCH) {
      const batch = targets.slice(i, i + TRANSLATE_BATCH);
      const result = await onTranslate(session, { ...base, keys: batch.map((r) => r.key) });
      if (!result.ok) {
        toast.error(`Couldn't translate into ${dimension.name}`, {
          description: result.error,
          ...(result.signedOut && { action: { label: "Sign in", href: signInUrl } }),
        });
        break;
      }
      for (const row of batch) {
        const text = result.data[row.key];
        if (text !== undefined) setCell(row, dimensionId, text);
      }
      translated += Object.keys(result.data).length;
      onBatch?.(Math.min(i + TRANSLATE_BATCH, targets.length));
    }
    return translated;
  }

  const translateRowsRef = useRef(translateRows);
  useEffect(() => {
    translateRowsRef.current = translateRows;
  });
  const translateCell = useCallback(
    (row: LabelRow, dimensionId: number) => translateRowsRef.current(dimensionId, [row]),
    [],
  );

  async function translateMissing(dimensionId: number) {
    if (progress) return;
    const name = languageName(dimensionId);
    const targets = filtered.filter((row) => currentValue(row, dimensionId, drafts).trim() === "" && row.value.trim());
    if (!targets.length) {
      toast.info(`Nothing to translate into ${name}`, { description: "Every label in this view already has a value." });
      return;
    }
    setProgress({ label: `Translating into ${name}`, done: 0, total: targets.length });
    const count = await translateRows(dimensionId, targets, (done) =>
      setProgress({ label: `Translating into ${name}`, done, total: targets.length }),
    );
    setProgress(null);
    if (count) {
      toast.success(`Translated ${count} ${count === 1 ? "label" : "labels"} into ${name}`, {
        description: "Review them, then save to write them to Storyblok.",
      });
    }
  }

  async function reviewLanguage(dimensionId: number) {
    if (progress) return;
    const name = languageName(dimensionId);
    const targets = filtered.filter((row) => currentValue(row, dimensionId, drafts).trim() !== "");
    if (!targets.length) {
      toast.info(`Nothing to review in ${name}`, { description: "No label in this view has a translation yet." });
      return;
    }
    const base = aiRequest(dimensionId, true);
    const byKey = new Map(targets.map((row) => [row.key, row]));
    let found = 0;
    setProgress({ label: `Reviewing ${name}`, done: 0, total: targets.length });
    for (let i = 0; i < targets.length; i += TRANSLATE_BATCH) {
      const batch = targets.slice(i, i + TRANSLATE_BATCH);
      const result = await onReview(session, { ...base, keys: batch.map((r) => r.key) });
      if (!result.ok) {
        toast.error(`Couldn't review ${name}`, {
          description: result.error,
          ...(result.signedOut && { action: { label: "Sign in", href: signInUrl } }),
        });
        break;
      }
      setReviews((prev) => {
        const next = { ...prev };
        for (const row of batch) delete next[cellId(row.id, dimensionId)];
        for (const f of result.data) {
          const row = byKey.get(f.key);
          if (row) next[cellId(row.id, dimensionId)] = [{ kind: "review", message: f.problem, suggestion: f.suggestion }];
        }
        return next;
      });
      found += result.data.length;
      setProgress({ label: `Reviewing ${name}`, done: Math.min(i + TRANSLATE_BATCH, targets.length), total: targets.length });
    }
    setProgress(null);
    toast.success(found ? `Found ${found} possible ${found === 1 ? "problem" : "problems"} in ${name}` : `No problems found in ${name}`, {
      description: found ? "Cells with a warning sign show the details and a suggested fix." : undefined,
    });
    if (found) setStatus("issues");
  }

  async function createGlossary() {
    const result = await onSetUpGlossary(session, datasource.dimensions);
    if (!result.ok) {
      toast.error("Couldn't create the glossary", { description: result.error });
      return;
    }
    toast.success("Glossary created", {
      description: "Add terms and style rules in Storyblok under Datasources → Translation glossary.",
    });
    router.refresh();
  }

  function markSaved(change: CellChange) {
    const id = cellId(change.entryId, change.dimensionId ?? "default");
    setRows((prev) => applySaved(prev, change));
    setDrafts((prev) => {
      if (prev[id] !== change.value) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function sessionExpired() {
    setProgress(null);
    toast.error("Your Storyblok session expired", {
      description: "Your unsaved changes are kept in this tab. Sign in again, then save.",
      action: { label: "Sign in", href: signInUrl },
    });
  }

  async function save() {
    const changes = toChanges(rows, drafts);
    if (!changes.length || progress) return;
    const total = changes.length;
    let done = 0;
    let failed = 0;

    const byColumn = new Map<number | null, CellChange[]>();
    for (const change of changes) byColumn.set(change.dimensionId, [...(byColumn.get(change.dimensionId) ?? []), change]);
    const single: CellChange[] = [];

    // toChanges puts the default language first, so translations are imported on top of the new English values.
    for (const [dimensionId, list] of byColumn) {
      if (list.length < BULK_THRESHOLD) {
        single.push(...list);
        continue;
      }
      setProgress({ label: `Importing ${languageName(dimensionId ?? "default")}`, done, total });
      const result = await onBulkSave(session, {
        datasourceId: datasource.id,
        dimensionId,
        changes: list.map((c) => ({ entryId: c.entryId, value: c.value })),
      });
      if (!result.ok && result.signedOut) return sessionExpired();
      if (!result.ok) {
        single.push(...list);
        continue;
      }
      for (const change of list) {
        if (result.failed.includes(change.key)) failed++;
        else markSaved(change);
      }
      done += list.length;
    }

    for (const change of single) {
      const paced = pace(REQUEST_INTERVAL_MS);
      setProgress({ label: "Saving", done, total });
      const result = await onSave(session, change);
      if (!result.ok && result.signedOut) return sessionExpired();
      if (result.ok) markSaved(change);
      else failed++;
      done++;
      await paced();
    }

    setProgress(null);
    if (failed) {
      toast.error(`${failed} of ${total} changes weren't saved`, {
        description: "They're still marked as edited. Save again to retry.",
      });
    } else {
      toast.success(`Saved ${total} ${total === 1 ? "change" : "changes"}`);
    }
  }

  useShortcut("mod+s", save, { description: "Save changes" });

  async function switchDatasource(slug: string | null) {
    if (!slug || slug === datasource.slug) return;
    if (
      editedCount &&
      !(await confirm({
        title: "Discard unsaved changes?",
        description: `You have ${editedCount} unsaved ${editedCount === 1 ? "change" : "changes"} in ${datasource.name}.`,
        confirmLabel: "Discard and switch",
      }))
    ) {
      return;
    }
    if (editedCount) sessionStorage.removeItem(storageKey);
    const next = new URLSearchParams(searchParams?.toString());
    next.set("datasource", slug);
    router.push(`?${next}`);
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <h1>Translations</h1>
          <p>
            {rows.length} keys · {allColumns.length} languages
          </p>
        </div>

        <Select value={datasource.slug} onValueChange={switchDatasource}>
          <SelectLabel>Datasource</SelectLabel>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {datasources.map((d) => (
              <SelectItem key={d.id} value={d.slug}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ai-tools">
          {glossary ? (
            <span className="glossary-status">
              Glossary: {glossary.terms.length} {glossary.terms.length === 1 ? "term" : "terms"}
            </span>
          ) : (
            <Button className="secondary" onClick={createGlossary} pendingAnnouncement="Creating the glossary">
              Set up glossary
            </Button>
          )}
          <AiInstructions
            dimensions={datasource.dimensions}
            glossary={glossary}
            settings={settings}
            labelCount={rows.length}
          />
          <SettingsDialog
            settings={settings}
            error={settingsError}
            dimensions={datasource.dimensions}
            datasources={allDatasources}
            onSave={(next) => onSaveSettings(session, next)}
          />
        </div>

        <Button
          className="save"
          data-variant="solid"
          onClick={save}
          disabled={!editedCount || !!progress}
          aria-keyshortcuts={saveHint.ariaKeyshortcuts}
          pendingAnnouncement="Saving"
        >
          Save {editedCount > 0 && `(${editedCount})`}
          <kbd aria-hidden="true">{saveHint.text}</kbd>
        </Button>
      </header>

      {progress && (
        <Progress value={(progress.done / progress.total) * 100} className="save-progress">
          <ProgressLabel>
            {progress.label}: {progress.done} of {progress.total}
          </ProgressLabel>
          <ProgressValue />
          <ProgressTrack>
            <ProgressIndicator />
          </ProgressTrack>
        </Progress>
      )}

      <div className="body">
        <nav className="sidebar card" aria-label="Namespaces">
          <h2>Namespaces</h2>
          <Listbox aria-label="Namespace" value={namespace} onValueChange={(v) => setNamespace((v as string) ?? "all")}>
            <ListboxItem value="all">
              <span>All labels</span>
              <span className="badge">{rows.length}</span>
            </ListboxItem>
            {namespaces.map(([ns, s]) => (
              <ListboxItem key={ns} value={ns}>
                <span>{ns}</span>
                <span className="badge" data-missing={s.missing > 0 || undefined}>
                  {s.missing > 0 ? `${s.missing} missing` : s.total}
                </span>
              </ListboxItem>
            ))}
          </Listbox>
        </nav>

        <main className="content card">
          <div className="toolbar">
            <InputGroup className="search">
              <Input
                type="search"
                aria-label="Search keys and text"
                placeholder="Search keys and text…"
                value={query}
                onValueChange={setQuery}
              />
              <InputClear aria-label="Clear search" />
            </InputGroup>

            <SegmentedControl aria-label="Show" value={status} onValueChange={(v) => setStatus((v ?? "all") as StatusFilter)}>
              <SegmentedControlIndicator />
              <SegmentedControlItem value="all">All</SegmentedControlItem>
              <SegmentedControlItem value="missing">Missing ({missingTotal})</SegmentedControlItem>
              <SegmentedControlItem value="edited">Edited ({editedCount})</SegmentedControlItem>
              <SegmentedControlItem value="issues">Issues ({rowsWithIssues.size})</SegmentedControlItem>
            </SegmentedControl>

            <Select
              multiple
              value={visible}
              onValueChange={(v) => pickLanguages(v as string[])}
              items={datasource.dimensions.map((d) => ({ value: String(d.id), label: d.name }))}
            >
              <SelectLabel className="visually-hidden">Visible languages</SelectLabel>
              <SelectTrigger className="language-picker">
                <SelectValue>
                  {() => `Languages: ${visible.length} of ${datasource.dimensions.length}`}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="language-list">
                {datasource.dimensions.map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>
                    {d.name}
                    <span className="language-code">{d.entry_value}</span>
                    <SelectItemIndicator />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="table-wrap">
            <table className="label-table" style={{ "--language-columns": columns.length } as React.CSSProperties}>
              <thead>
                <tr>
                  <th scope="col">Key</th>
                  {columns.map((c) => (
                    <th key={c} scope="col">
                      <div className="column-head">
                        <span className="column-name">{languageName(c)}</span>
                        {c !== "default" && (
                          <Menu>
                            <MenuTrigger className="column-menu" disabled={!!progress}>
                              <MoreIcon />
                              <span className="visually-hidden">Actions for {languageName(c)}</span>
                            </MenuTrigger>
                            <MenuContent>
                              <MenuGroup>
                                <MenuGroupLabel>AI</MenuGroupLabel>
                                <MenuItem value="translate" onSelect={() => void translateMissing(c)}>
                                  <SparkleIcon />
                                  Translate missing into {languageName(c)}
                                </MenuItem>
                                <MenuItem value="review" onSelect={() => void reviewLanguage(c)}>
                                  <ReviewIcon />
                                  Review {languageName(c)} with AI
                                </MenuItem>
                              </MenuGroup>
                              <MenuSeparator />
                              <MenuGroup>
                                <MenuGroupLabel>Column</MenuGroupLabel>
                                <MenuItem value="first" disabled={columns[1] === c} onSelect={() => moveColumn(c, "first")}>
                                  Move {languageName(c)} to the front
                                </MenuItem>
                                <MenuItem value="left" disabled={columns[1] === c} onSelect={() => moveColumn(c, "left")}>
                                  Move {languageName(c)} left
                                </MenuItem>
                                <MenuItem
                                  value="right"
                                  disabled={columns[columns.length - 1] === c}
                                  onSelect={() => moveColumn(c, "right")}
                                >
                                  Move {languageName(c)} right
                                </MenuItem>
                              </MenuGroup>
                            </MenuContent>
                          </Menu>
                        )}
                      </div>
                      <Meter value={completion[String(c)] ?? 0} aria-label={`${languageName(c)} translated`}>
                        <MeterTrack>
                          <MeterIndicator />
                        </MeterTrack>
                        <MeterValue />
                      </Meter>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <LabelRowView
                    key={row.id}
                    row={row}
                    columns={columns}
                    codes={codes}
                    drafts={pickByRow(drafts, row.id)}
                    reviews={pickByRow(reviews, row.id)}
                    glossary={glossary}
                    maxLengthRatio={settings.maxLengthRatio}
                    languageName={languageName}
                    onChange={setCell}
                    onTranslate={translateCell}
                  />
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <p className="empty">No labels match these filters.</p>}
          </div>
        </main>
      </div>

      <ToastRegion>
        {() => (
          <Toast>
            <ToastTitle />
            <ToastDescription />
            <ToastAction />
            <ToastClose aria-label="Dismiss" />
          </Toast>
        )}
      </ToastRegion>
      <OverlayHost />
    </div>
  );
}
