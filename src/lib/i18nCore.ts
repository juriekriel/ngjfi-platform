/**
 * Language logic for the survey — pure, no imports, unit-tested
 * (tests/i18n.test.ts). src/lib/i18n.ts binds it to the registry
 * (src/data/locales.json) and the per-language files (src/data/i18n/*.json).
 */
export type LocaleStatus = "live" | "review" | "draft" | "requested";
export type LocaleInfo = { code: string; name: string; native: string; dir: "ltr" | "rtl"; status: LocaleStatus; fallback: string[]; note?: string };

/** Where text for `code` comes from, in order: itself, its fallbacks (recursively), then English. */
export function chain(code: string, registry: LocaleInfo[]): string[] {
  const out: string[] = [];
  const visit = (c: string) => {
    if (out.includes(c)) return;
    out.push(c);
    for (const f of registry.find((l) => l.code === c)?.fallback ?? []) visit(f);
  };
  visit(code);
  if (!out.includes("en")) out.push("en");
  return out;
}

/** The first non-empty text along the chain. */
export function pick(texts: Record<string, string | undefined> | undefined, order: string[]): string {
  if (!texts) return "";
  for (const c of order) {
    const v = texts[c];
    if (typeof v === "string" && v.trim()) return v;
  }
  return "";
}

/** Fill {placeholders}: fmt("Question {n} of {total}", { n: 2, total: 9 }). */
export function fmt(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/** Languages a respondent may choose: live ones — or, in reviewer preview, everything except "requested". */
export function offered(registry: LocaleInfo[], preview: boolean): LocaleInfo[] {
  return registry.filter((l) => l.status === "live" || (preview && l.status !== "requested"));
}

/**
 * The best offered language for a phone's language settings
 * (navigator.languages): an exact match first ("es-419"), then the same
 * language ("es-MX" → "es-419" if offered, else "es"), else English.
 */
export function bestMatch(phone: readonly string[], available: string[]): string {
  const lower = available.map((a) => a.toLowerCase());
  const at = (code: string) => available[lower.indexOf(code)];
  // Latin-American regions of Spanish map to es-419 when it's offered.
  const latam = ["mx", "ar", "co", "cl", "pe", "ve", "ec", "gt", "cu", "bo", "do", "hn", "py", "sv", "ni", "cr", "pa", "uy", "pr", "419", "us"];
  // The phone's languages in the person's own order of preference: the first
  // one that we can serve at all — exactly, by region, or by language — wins.
  for (const p of phone) {
    const code = p.toLowerCase();
    if (lower.includes(code)) return at(code);
    const [lang, region] = code.split("-");
    if (lang === "es" && region && latam.includes(region) && lower.includes("es-419")) return at("es-419");
    if (lang === "zh" && lower.includes("zh-hans")) return at("zh-hans");
    const same = lower.findIndex((a) => a.split("-")[0] === lang);
    if (same !== -1) return available[same];
  }
  return available.includes("en") ? "en" : available[0] ?? "en";
}

/** What share of the strings a language has its own text for (0–1) — for the coverage report. */
export function coverage(keys: string[], own: Record<string, unknown>): number {
  if (!keys.length) return 1;
  return keys.filter((k) => typeof own[k] === "string" && (own[k] as string).trim()).length / keys.length;
}
