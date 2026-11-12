"use server";

import {
  bulkSaveColumn,
  createGlossary,
  createLabelsDatasource,
  saveCell,
  saveSettings,
  type BulkChange,
  type BulkResult,
} from "@/lib/storyblok/mapi";
import type { LabelsSetup } from "@/lib/starter";
import type { PluginSettings } from "@/lib/settings";
import { getAppSession, type SessionRef } from "@/lib/storyblok/session";
import type { CellChange, Dimension } from "@/lib/storyblok/types";
import { reviewLabels, translateLabels, type AiRequest, type ReviewFinding } from "@/lib/translate";
import { runAi, type AiResult } from "@/lib/translate-result";

export type ActionError = { ok: false; error: string; signedOut?: boolean };
const signedOut: ActionError = { ok: false, error: "Your Storyblok session expired.", signedOut: true };
const failure = (error: unknown): ActionError => ({ ok: false, error: error instanceof Error ? error.message : String(error) });

export type SaveResult = { ok: true } | ActionError;

export async function saveChange(ref: SessionRef, change: CellChange): Promise<SaveResult> {
  const session = await getAppSession(ref);
  if (!session) return signedOut;
  try {
    await saveCell(session, change);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export type BulkSaveRequest = { datasourceId: number; dimensionId: number | null; changes: BulkChange[] };
export type BulkSaveResult = ({ ok: true } & BulkResult) | ActionError;

export async function bulkSave(ref: SessionRef, request: BulkSaveRequest): Promise<BulkSaveResult> {
  const session = await getAppSession(ref);
  if (!session) return signedOut;
  try {
    return { ok: true, ...(await bulkSaveColumn(session, request.datasourceId, request.dimensionId, request.changes)) };
  } catch (error) {
    return failure(error);
  }
}

// The session check keeps the AI endpoints (and the API key's budget) limited to signed-in Storyblok editors.
export async function translate(ref: SessionRef, request: AiRequest): Promise<AiResult<Record<string, string>>> {
  if (!(await getAppSession(ref))) return signedOut;
  return runAi(() => translateLabels(request));
}

export async function review(ref: SessionRef, request: AiRequest): Promise<AiResult<ReviewFinding[]>> {
  if (!(await getAppSession(ref))) return signedOut;
  return runAi(() => reviewLabels(request));
}

export async function setUpGlossary(ref: SessionRef, dimensions: Dimension[]): Promise<{ ok: true } | ActionError> {
  const session = await getAppSession(ref);
  if (!session) return signedOut;
  try {
    await createGlossary(session, dimensions);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function saveSpaceSettings(ref: SessionRef, settings: PluginSettings): Promise<{ ok: true } | ActionError> {
  const session = await getAppSession(ref);
  if (!session) return signedOut;
  try {
    await saveSettings(session, settings);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function setUpLabels(ref: SessionRef, setup: LabelsSetup): Promise<{ ok: true; slug: string } | ActionError> {
  const session = await getAppSession(ref);
  if (!session) return signedOut;
  const slug = setup.slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
  if (!setup.name.trim() || !slug) return { ok: false, error: "Give the datasource a name and a slug." };
  if (!setup.languages.length) return { ok: false, error: "Pick at least one language to translate into." };
  try {
    return { ok: true, slug: await createLabelsDatasource(session, { ...setup, name: setup.name.trim(), slug }) };
  } catch (error) {
    return failure(error);
  }
}
