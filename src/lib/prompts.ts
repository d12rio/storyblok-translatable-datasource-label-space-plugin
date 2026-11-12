// Shared by the server (the requests to Claude) and the UI (Settings and the "AI instructions" dialog),
// so what editors see is exactly what the model gets.
import { voiceFor, type PluginSettings } from "./settings";

export type Language = { name: string; code: string };
export type GlossaryTerm = { term: string; translation: string };
export type LabelContext = { key: string; source: string; existing: string };
export type PromptKind = "translate" | "review";

export const PROMPT_VARIABLES = ["{{source}}", "{{target}}", "{{targetCode}}"];

const LABEL_BASICS = `The labels are short interface strings: buttons, headings, aria labels, form hints. Each has a dotted key that says where it's used (for example "nav.login" is a navigation link, "a11y.*" are screen reader texts, "form.*" are form labels and errors). Use the key to pick the right register and length.`;

export const DEFAULT_PROMPTS: Record<PromptKind, string> = {
  translate: `You translate UI labels for a website from {{source}} into {{target}} ({{targetCode}}).

${LABEL_BASICS}

Rules:
- Keep placeholders such as {name}, {count} or {privacy_policy} exactly as they are, untranslated.
- Keep HTML tags, Markdown, URLs, brand and product names unchanged.
- Keep terminology consistent with the existing {{target}} translations: translate the same {{source}} term the same way everywhere. For tone and register, the tone of voice below wins over existing translations.
- Keep labels about as short as the {{source}}. Buttons stay short.
- Use the conventions of {{target}} for punctuation, quotes and capitalization.`,

  review: `You review {{target}} ({{targetCode}}) translations of UI labels for a website. The source language is {{source}}.

${LABEL_BASICS}

Report only real problems: wrong meaning, grammar or spelling mistakes, wrong register for where the label is used, inconsistent terminology across labels, tone of voice or glossary violations, broken placeholders. Don't report a translation just because you would phrase it differently.
For each problem, say briefly what's wrong (in English) and give a corrected {{target}} translation. Leave out labels that are fine.`,
};

function render(template: string, source: Language, target: Language) {
  return template
    .replaceAll("{{source}}", source.name)
    .replaceAll("{{target}}", target.name)
    .replaceAll("{{targetCode}}", target.code);
}

// The tone of voice and glossary are always appended, so a custom prompt can't drop them by accident.
export function buildInstructions(kind: PromptKind, settings: PluginSettings, target: Language, glossary: GlossaryTerm[]) {
  const parts = [render(settings.prompts[kind].trim() || DEFAULT_PROMPTS[kind], settings.sourceLanguage, target)];
  const voice = voiceFor(settings, target.code);
  if (voice) parts.push(`Tone of voice for ${target.name}. These rules take priority over the style of existing translations:\n${voice}`);
  if (glossary.length) {
    const lines = glossary.map((g) =>
      g.term === g.translation ? `- "${g.term}" stays "${g.term}" (don't translate)` : `- "${g.term}" → "${g.translation}"`,
    );
    parts.push(`Glossary. Always use these translations:\n${lines.join("\n")}`);
  }
  return parts.join("\n\n");
}

export function labelsContext(source: Language, target: Language, labels: LabelContext[]) {
  const lines = labels
    .map((l) => JSON.stringify({ key: l.key, [source.code]: l.source, [target.code]: l.existing || null }))
    .join("\n");
  return `All labels in this datasource (one JSON object per line, null means not translated yet):\n${lines}`;
}
