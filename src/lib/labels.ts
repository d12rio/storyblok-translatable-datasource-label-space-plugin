import type { CellChange, Datasource, LabelRow } from "./storyblok/types";

export type ColumnId = "default" | number;
export type Drafts = Record<string, string>;
export type StatusFilter = "all" | "missing" | "edited" | "issues";

export const cellId = (entryId: number, column: ColumnId) => `${entryId}:${column}`;

export const savedValue = (row: LabelRow, column: ColumnId) =>
  column === "default" ? row.value : (row.translations[column] ?? "");

export const currentValue = (row: LabelRow, column: ColumnId, drafts: Drafts) =>
  drafts[cellId(row.id, column)] ?? savedValue(row, column);

export const namespaceOf = (key: string) => (key.includes(".") ? key.split(".")[0] : "(none)");

export function columnsOf(datasource: Datasource): ColumnId[] {
  return ["default", ...datasource.dimensions.map((d) => d.id)];
}

export function isMissing(row: LabelRow, columns: ColumnId[], drafts: Drafts) {
  return columns.some((c) => currentValue(row, c, drafts).trim() === "");
}

export function isEdited(row: LabelRow, columns: ColumnId[], drafts: Drafts) {
  return columns.some((c) => cellId(row.id, c) in drafts);
}

export function filterRows(
  rows: LabelRow[],
  { columns, drafts, namespace, query, status, hasIssues }: {
    columns: ColumnId[];
    drafts: Drafts;
    namespace: string;
    query: string;
    status: StatusFilter;
    hasIssues: (row: LabelRow) => boolean;
  },
) {
  const q = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (namespace !== "all" && namespaceOf(row.key) !== namespace) return false;
    if (status === "missing" && !isMissing(row, columns, drafts)) return false;
    if (status === "edited" && !isEdited(row, columns, drafts)) return false;
    if (status === "issues" && !hasIssues(row)) return false;
    if (!q) return true;
    return (
      row.key.toLowerCase().includes(q) ||
      columns.some((c) => currentValue(row, c, drafts).toLowerCase().includes(q))
    );
  });
}

export function namespaceStats(rows: LabelRow[], columns: ColumnId[], drafts: Drafts) {
  const stats = new Map<string, { total: number; missing: number }>();
  for (const row of rows) {
    const ns = namespaceOf(row.key);
    const s = stats.get(ns) ?? { total: 0, missing: 0 };
    s.total++;
    if (isMissing(row, columns, drafts)) s.missing++;
    stats.set(ns, s);
  }
  return [...stats.entries()].sort(([a], [b]) => a.localeCompare(b));
}

// Default values go first, so the English value sent along with each translation is already the new one.
export function toChanges(rows: LabelRow[], drafts: Drafts): CellChange[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return Object.entries(drafts)
    .map(([id, value]) => {
      const [entryId, column] = id.split(":");
      const row = byId.get(Number(entryId))!;
      return {
        entryId: row.id,
        key: row.key,
        dimensionId: column === "default" ? null : Number(column),
        value,
        defaultValue: currentValue(row, "default", drafts),
      };
    })
    .sort((a, b) => Number(a.dimensionId !== null) - Number(b.dimensionId !== null));
}

export function applySaved(rows: LabelRow[], change: CellChange): LabelRow[] {
  return rows.map((row) => {
    if (row.id !== change.entryId) return row;
    return change.dimensionId === null
      ? { ...row, value: change.value }
      : { ...row, translations: { ...row.translations, [change.dimensionId]: change.value } };
  });
}
