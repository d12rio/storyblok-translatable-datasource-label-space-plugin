import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { buildInstructions, labelsContext, type GlossaryTerm, type LabelContext, type Language, type PromptKind } from "./prompts";
import type { PluginSettings } from "./settings";

export type AiRequest = {
  settings: PluginSettings;
  language: Language;
  // Every label in the datasource, so the model keeps terminology consistent.
  context: LabelContext[];
  keys: string[];
  glossary: GlossaryTerm[];
};

export type ReviewFinding = { key: string; problem: string; suggestion: string };

const MODEL = "claude-haiku-5-5";

// Created on first use, so the app still starts when no API key is configured.
let client: Anthropic | undefined;

function system(kind: PromptKind, request: AiRequest) {
  return [
    { type: "text" as const, text: buildInstructions(kind, request.settings, request.language, request.glossary) },
    {
      type: "text" as const,
      text: labelsContext(request.settings.sourceLanguage, request.language, request.context),
      // Batches for the same language share this prefix, so later requests read it from the cache.
      cache_control: { type: "ephemeral" as const },
    },
  ];
}

async function ask<T extends z.ZodType>(kind: PromptKind, request: AiRequest, prompt: string, schema: T) {
  client ??= new Anthropic();
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: system(kind, request),
    output_config: { effort: "low", format: zodOutputFormat(schema) },
    messages: [{ role: "user", content: prompt }],
  });
  if (response.stop_reason === "refusal") throw new Error("The model declined this request.");
  if (response.stop_reason === "max_tokens") throw new Error("The answer was cut off. Try fewer labels at once.");
  if (!response.parsed_output) throw new Error("The model returned no usable answer.");
  return response.parsed_output as z.infer<T>;
}

function itemsFor(request: AiRequest, withTranslation: boolean) {
  const byKey = new Map(request.context.map((c) => [c.key, c]));
  return request.keys
    .map((key) => byKey.get(key))
    .filter((c): c is LabelContext => !!c && !!c.source.trim() && (!withTranslation || !!c.existing.trim()))
    .map((c) => ({
      key: c.key,
      [request.settings.sourceLanguage.code]: c.source,
      ...(withTranslation && { [request.language.code]: c.existing }),
    }));
}

const Translations = z.object({ translations: z.array(z.object({ key: z.string(), text: z.string() })) });

export async function translateLabels(request: AiRequest): Promise<Record<string, string>> {
  // Re-translating a filled cell must not see its old text, or the model just returns it.
  const keys = new Set(request.keys);
  request = { ...request, context: request.context.map((c) => (keys.has(c.key) ? { ...c, existing: "" } : c)) };
  const items = itemsFor(request, false);
  if (!items.length) return {};
  const { translations } = await ask(
    "translate",
    request,
    `Translate these labels into ${request.language.name}. Return one entry per key.\n${JSON.stringify(items, null, 1)}`,
    Translations,
  );
  const wanted = new Set(request.keys);
  return Object.fromEntries(translations.filter((t) => wanted.has(t.key) && t.text.trim()).map((t) => [t.key, t.text]));
}

const Findings = z.object({
  findings: z.array(z.object({ key: z.string(), problem: z.string(), suggestion: z.string() })),
});

export async function reviewLabels(request: AiRequest): Promise<ReviewFinding[]> {
  const items = itemsFor(request, true);
  if (!items.length) return [];
  const { findings } = await ask(
    "review",
    request,
    `Review these ${request.language.name} translations. Return only the ones with a problem.\n${JSON.stringify(items, null, 1)}`,
    Findings,
  );
  const wanted = new Set(request.keys);
  return findings.filter((f) => wanted.has(f.key));
}
