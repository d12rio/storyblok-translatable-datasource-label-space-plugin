"use server";

import type { ActionError, BulkSaveRequest, BulkSaveResult, SaveResult } from "@/app/actions";
import type { SessionRef } from "@/lib/storyblok/session";
import type { CellChange, Dimension } from "@/lib/storyblok/types";
import { reviewLabels, translateLabels, type AiRequest, type ReviewFinding } from "@/lib/translate";
import { runAi, type AiResult } from "@/lib/translate-result";
import { DEFAULT_SETTINGS, normalizeSettings, type PluginSettings } from "@/lib/settings";
import type { LabelsSetup } from "@/lib/starter";

// Development-only stand-ins: AI features run for real, writes to Storyblok are only logged.
const previewOnly: ActionError = { ok: false, error: "Preview only" };
const isDev = process.env.NODE_ENV === "development";

export async function previewSave(_ref: SessionRef, change: CellChange): Promise<SaveResult> {
  if (!isDev) return previewOnly;
  console.log("[preview] would save", change);
  return { ok: true };
}

export async function previewBulkSave(_ref: SessionRef, request: BulkSaveRequest): Promise<BulkSaveResult> {
  if (!isDev) return previewOnly;
  console.log(`[preview] would import ${request.changes.length} changes into dimension ${request.dimensionId ?? "default"}`);
  return { ok: true, imported: request.changes.length, fixed: 0, failed: [] };
}

export async function previewTranslate(_ref: SessionRef, request: AiRequest): Promise<AiResult<Record<string, string>>> {
  if (!isDev) return previewOnly;
  return runAi(() => translateLabels(request));
}

export async function previewReview(_ref: SessionRef, request: AiRequest): Promise<AiResult<ReviewFinding[]>> {
  if (!isDev) return previewOnly;
  return runAi(() => reviewLabels(request));
}

export async function previewSetUpGlossary(_ref: SessionRef, dimensions: Dimension[]): Promise<{ ok: true } | ActionError> {
  if (!isDev) return previewOnly;
  console.log("[preview] would create the glossary datasource with", dimensions.map((d) => d.entry_value));
  return { ok: false, error: "The preview can't create datasources. Open the plugin in Storyblok to set up the glossary." };
}

let previewSettings: PluginSettings = DEFAULT_SETTINGS;

export async function previewLoadSettings(): Promise<PluginSettings> {
  return previewSettings;
}

export async function previewSaveSettings(_ref: SessionRef, settings: PluginSettings): Promise<{ ok: true } | ActionError> {
  if (!isDev) return previewOnly;
  previewSettings = normalizeSettings(settings);
  console.log("[preview] would save settings", previewSettings);
  return { ok: true };
}

export async function previewSetUpLabels(_ref: SessionRef, setup: LabelsSetup): Promise<{ ok: true; slug: string } | ActionError> {
  if (!isDev) return previewOnly;
  console.log("[preview] would create datasource", setup);
  return { ok: false, error: "The preview can't create datasources. Open the plugin in Storyblok to set one up." };
}
