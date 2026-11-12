"use client";

import { Button } from "@ui-sdk/react/button";
import { Popover, PopoverClose, PopoverContent, PopoverTitle, PopoverTrigger } from "@ui-sdk/react/popover";
import { Textarea } from "@ui-sdk/react/textarea";
import { memo } from "react";
import { checkTranslation, type Glossary, type Issue } from "@/lib/checks";
import { cellId, currentValue, isEdited, type ColumnId, type Drafts } from "@/lib/labels";
import type { LabelRow } from "@/lib/storyblok/types";

export type Reviews = Record<string, Issue[]>;

const caches = new WeakMap<object, Map<number, Record<string, unknown>>>();
const EMPTY = {};

// Hands each row only its own drafts and reviews, so typing in one cell doesn't re-render hundreds of rows.
export function pickByRow<T>(all: Record<string, T>, entryId: number): Record<string, T> {
  let byRow = caches.get(all);
  if (!byRow) {
    byRow = new Map();
    for (const [id, value] of Object.entries(all)) {
      const rowId = Number(id.split(":")[0]);
      byRow.set(rowId, { ...byRow.get(rowId), [id]: value });
    }
    caches.set(all, byRow);
  }
  return (byRow.get(entryId) ?? EMPTY) as Record<string, T>;
}

export function cellIssues(
  row: LabelRow,
  column: ColumnId,
  code: string,
  drafts: Drafts,
  reviews: Reviews,
  glossary: Glossary | null,
  maxLengthRatio: number,
): Issue[] {
  if (column === "default") return [];
  const checks = checkTranslation(
    currentValue(row, "default", drafts),
    currentValue(row, column, drafts),
    code,
    glossary,
    maxLengthRatio,
  );
  return [...checks, ...(reviews[cellId(row.id, column)] ?? [])];
}

type Props = {
  row: LabelRow;
  columns: ColumnId[];
  codes: Record<string, string>;
  drafts: Drafts;
  reviews: Reviews;
  glossary: Glossary | null;
  maxLengthRatio: number;
  languageName: (c: ColumnId) => string;
  onChange: (row: LabelRow, column: ColumnId, value: string) => void;
  onTranslate: (row: LabelRow, dimensionId: number) => Promise<unknown>;
};

export const LabelRowView = memo(function LabelRowView({
  row,
  columns,
  codes,
  drafts,
  reviews,
  glossary,
  maxLengthRatio,
  languageName,
  onChange,
  onTranslate,
}: Props) {
  return (
    <tr data-edited={isEdited(row, columns, drafts) || undefined}>
      <th scope="row" className="key">
        <code>{row.key}</code>
      </th>
      {columns.map((column) => {
        const value = currentValue(row, column, drafts);
        const issues = cellIssues(row, column, codes[String(column)], drafts, reviews, glossary, maxLengthRatio);
        const label = `${row.key}, ${languageName(column)}`;
        return (
          <td
            key={column}
            data-edited={cellId(row.id, column) in drafts || undefined}
            data-missing={value.trim() === "" || undefined}
            data-issues={issues.length || undefined}
          >
            <Textarea
              autoResize
              rows={1}
              aria-label={label}
              placeholder={column === "default" ? "Missing" : `Missing · ${row.value}`}
              value={value}
              onValueChange={(v) => onChange(row, column, v)}
            />
            {column !== "default" && (
              <div className="cell-actions">
                {issues.length > 0 && (
                  <Popover>
                    <PopoverTrigger className="cell-issues" aria-label={`${issues.length} possible problems in ${label}`}>
                      <WarningIcon />
                    </PopoverTrigger>
                    <PopoverContent className="issues-popover">
                      <PopoverTitle>Possible problems</PopoverTitle>
                      <ul>
                        {issues.map((issue, i) => (
                          <li key={`${issue.kind}-${i}`} data-kind={issue.kind}>
                            <span>{issue.message}</span>
                            {issue.suggestion && (
                              <>
                                <q>{issue.suggestion}</q>
                                <PopoverClose
                                  data-variant="solid"
                                  onClick={() => onChange(row, column, issue.suggestion!)}
                                >
                                  Apply suggestion
                                </PopoverClose>
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    </PopoverContent>
                  </Popover>
                )}
                <Button
                  className="translate-cell"
                  aria-label={`Translate ${row.key} into ${languageName(column)}`}
                  disabled={!row.value.trim()}
                  onClick={() => onTranslate(row, column)}
                  pendingAnnouncement="Translating"
                >
                  <SparkleIcon />
                </Button>
              </div>
            )}
          </td>
        );
      })}
    </tr>
  );
});

export function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" strokeLinejoin="round" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" strokeLinejoin="round" />
    </svg>
  );
}

export function WarningIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 3 2 20h20L12 3z" strokeLinejoin="round" />
      <path d="M12 10v4M12 17v.5" strokeLinecap="round" />
    </svg>
  );
}

export function ReviewIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-4.5-4.5M8.5 11l2 2 3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="19" cy="12" r="1.75" />
    </svg>
  );
}
