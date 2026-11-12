export const GLOSSARY_SLUG = "translation-glossary";

export type Glossary = {
  datasourceId: number;
  terms: { term: string; translations: Record<string, string> }[];
};

export type Issue = {
  kind: "placeholder" | "length" | "untranslated" | "whitespace" | "punctuation" | "glossary" | "review";
  message: string;
  suggestion?: string;
};

const PLACEHOLDER = /\{\{[^{}]+\}\}|\{[^{}]+\}|%[sd]/g;
const END_PUNCTUATION = /([.?!:…]|\.\.\.)$/;

const placeholders = (s: string): string[] => [...(s.match(PLACEHOLDER) ?? [])].sort();
const endOf = (s: string) => s.trim().match(END_PUNCTUATION)?.[1].replace("...", "…") ?? "";
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const contains = (text: string, term: string) => new RegExp(`(^|\\W)${escape(term)}($|\\W)`, "i").test(text);

export function glossaryFor(glossary: Glossary | null, code: string) {
  return (glossary?.terms ?? [])
    .filter((t) => t.translations[code])
    .map((t) => ({ term: t.term, translation: t.translations[code] }));
}

export function checkTranslation(
  source: string,
  text: string,
  code: string,
  glossary: Glossary | null,
  maxLengthRatio: number,
): Issue[] {
  if (!text.trim() || !source.trim()) return [];
  const issues: Issue[] = [];

  const want = placeholders(source);
  const got = placeholders(text);
  const missing = want.filter((p) => !got.includes(p));
  const extra = got.filter((p) => !want.includes(p));
  if (missing.length) issues.push({ kind: "placeholder", message: `Missing placeholder ${missing.join(", ")}` });
  if (extra.length) issues.push({ kind: "placeholder", message: `Unknown placeholder ${extra.join(", ")}` });

  if (text.length > source.length * maxLengthRatio && text.length - source.length > 10) {
    issues.push({ kind: "length", message: `Much longer than the source (${text.length} vs ${source.length} characters)` });
  }

  const keptTerms = glossaryFor(glossary, code);
  const isKeptTerm = keptTerms.some((t) => t.term === source.trim() && t.translation === source.trim());
  if (text.trim() === source.trim() && /\p{L}{3}/u.test(source) && source.trim().length > 3 && !isKeptTerm) {
    issues.push({ kind: "untranslated", message: "Same as the source, so it may not be translated" });
  }

  if (text !== text.trim() && source === source.trim()) {
    issues.push({ kind: "whitespace", message: "Starts or ends with a space" });
  }

  if (endOf(source) !== endOf(text)) {
    const describe = (p: string) => (p ? `“${p}”` : "no punctuation");
    issues.push({ kind: "punctuation", message: `Ends with ${describe(endOf(text))}, the source with ${describe(endOf(source))}` });
  }

  for (const { term, translation } of keptTerms) {
    if (contains(source, term) && !contains(text, translation)) {
      issues.push({ kind: "glossary", message: `Glossary: “${term}” should be “${translation}”` });
    }
  }

  return issues;
}

type GlossaryRow = { key: string; value: string; translations: Record<number, string> };

export function glossaryFromRows(
  datasource: { id: number; dimensions: { id: number; entry_value: string }[] },
  rows: GlossaryRow[],
): Glossary {
  const byCode = (row: GlossaryRow) =>
    Object.fromEntries(datasource.dimensions.map((d) => [d.entry_value, row.translations[d.id] ?? ""]).filter(([, v]) => v));
  return {
    datasourceId: datasource.id,
    terms: rows.map((r) => {
        const translations = byCode(r);
        // A term with only a default value means "keep it as is" in every language.
        if (!Object.keys(translations).length) {
          for (const d of datasource.dimensions) translations[d.entry_value] = r.value || r.key;
        }
        return { term: r.key, translations };
      }),
  };
}
