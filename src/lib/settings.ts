// Stored per space in the plugin's space-level settings (app_provision.space_level_settings).
// Only non-sensitive configuration belongs here.
export type PluginSettings = {
  sourceLanguage: { name: string; code: string };
  // Tone of voice: general rules, plus rules per language code.
  voice: { general: string; byLanguage: Record<string, string> };
  // Custom system prompts for the AI. Empty means the built-in default.
  prompts: { translate: string; review: string };
  maxLengthRatio: number;
  // Slugs of the datasources the plugin shows. Empty means every datasource with dimensions.
  datasources: string[];
};

export const DEFAULT_SETTINGS: PluginSettings = {
  sourceLanguage: { name: "English", code: "en" },
  voice: { general: "", byLanguage: {} },
  prompts: { translate: "", review: "" },
  maxLengthRatio: 1.6,
  datasources: [],
};

const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const text = (v: unknown) => (typeof v === "string" ? v : "");

// Settings come from whatever was saved before, so every field is checked and defaulted.
export function normalizeSettings(raw: unknown): PluginSettings {
  const s = obj(raw);
  const source = obj(s.sourceLanguage);
  const voice = obj(s.voice);
  const prompts = obj(s.prompts);
  const ratio = Number(s.maxLengthRatio);
  return {
    sourceLanguage: {
      name: text(source.name).trim() || DEFAULT_SETTINGS.sourceLanguage.name,
      code: text(source.code).trim() || DEFAULT_SETTINGS.sourceLanguage.code,
    },
    voice: {
      general: text(voice.general),
      byLanguage: Object.fromEntries(
        Object.entries(obj(voice.byLanguage))
          .map(([code, v]) => [code, text(v)])
          .filter(([, v]) => v.trim()),
      ),
    },
    prompts: { translate: text(prompts.translate), review: text(prompts.review) },
    maxLengthRatio: Number.isFinite(ratio) && ratio >= 1 ? ratio : DEFAULT_SETTINGS.maxLengthRatio,
    datasources: Array.isArray(s.datasources) ? s.datasources.filter((d): d is string => typeof d === "string") : [],
  };
}

export function voiceFor(settings: PluginSettings, code: string) {
  return [settings.voice.general, settings.voice.byLanguage[code]].filter((s) => s?.trim()).join("\n");
}
