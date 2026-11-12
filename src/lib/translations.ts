/**
 * The Translations tile (admin console) — pure, no imports beyond types, so
 * it is unit-tested directly (tests/translations.test.ts).
 *
 * Four stages, as the Collab talks about languages:
 *
 *   live          — offered to respondents          (locales.json status "live")
 *   translating   — being written or reviewed       ("draft" | "review")
 *   prospective   — asked for, not started          ("requested")
 *   aspirational  — one of the world's main languages that is not on the
 *                   site at all yet (src/data/languages.world.json)
 *
 * The stage is DERIVED from the workflow status in src/data/locales.json; it
 * is never stored separately, so the tile cannot disagree with what the
 * survey actually offers. Aspirational languages live only in the world list
 * — they never enter the respondent path.
 *
 * The CSV is byte-for-byte the sheet `node scripts/translation-sheet.mjs
 * export <code>` writes (a test holds the two together), so a sheet
 * downloaded here can be translated and imported with that script.
 */
import type { LocaleInfo, LocaleStatus } from "./i18nCore";

export type Stage = "live" | "translating" | "prospective" | "aspirational";

export const STAGES: { key: Stage; label: string; gloss: string }[] = [
  { key: "live", label: "Live", gloss: "Offered to respondents. Complete and approved by a researcher." },
  { key: "translating", label: "Translating", gloss: "Being written or waiting for researcher review. Previewable; never records an answer." },
  { key: "prospective", label: "Prospective", gloss: "Asked for, by an organisation or the Collab. Not started." },
  { key: "aspirational", label: "Aspirational", gloss: "One of the world's main languages, not on the site yet. Nobody has asked." },
];

export function stageOf(status: LocaleStatus | string): Stage {
  if (status === "live") return "live";
  if (status === "review" || status === "draft") return "translating";
  return "prospective";
}

const RANK: Record<Stage, number> = { live: 0, translating: 1, prospective: 2, aspirational: 3 };
export const baseOf = (code: string) => code.split("-")[0].toLowerCase();

export type WorldLanguage = { code: string; name: string; native: string; dir: "ltr" | "rtl" };

/** One of the world's main languages, with the site's furthest-along variant of it. */
export type WorldRow = WorldLanguage & { stage: Stage; variants: string[] };

export function worldRows(world: WorldLanguage[], registry: LocaleInfo[]): WorldRow[] {
  return world.map((w) => {
    const variants = registry.filter((l) => baseOf(l.code) === w.code.toLowerCase());
    const stage = variants.reduce<Stage>((best, l) => (RANK[stageOf(l.status)] < RANK[best] ? stageOf(l.status) : best), "aspirational");
    return { ...w, stage, variants: variants.map((v) => v.code) };
  });
}

export function stageCounts(rows: { stage: Stage }[]): Record<Stage, number> {
  const out: Record<Stage, number> = { live: 0, translating: 0, prospective: 0, aspirational: 0 };
  for (const r of rows) out[r.stage]++;
  return out;
}

/** World languages with no variant on the site — the aspirational group. */
export function aspirational(world: WorldLanguage[], registry: LocaleInfo[]): WorldRow[] {
  return worldRows(world, registry).filter((r) => r.stage === "aspirational");
}

/* ── text resolution (mirrors src/lib/i18n.ts build()) ───────────────── */

export type SheetOption = { value: string | number; text?: Record<string, string | undefined> };
export type SheetItem = {
  key: string;
  type: string;
  order?: number;
  section?: string;
  question_domain?: string;
  tier?: string;
  scored?: boolean;
  session_field?: string;
  max_select?: number;
  show_if?: unknown;
  text?: Record<string, string | undefined>;
  help?: Record<string, string | undefined>;
  options?: SheetOption[];
};
export type LangFileLike = {
  ui?: Record<string, string>;
  items?: Record<string, { text?: string; help?: string; options?: Record<string, string> }>;
};
type Found = { text: string; from: string };

/** Walk the chain; the first language with text wins — its own file, then the instrument's built-in text. */
function walk(order: string[], get: (c: string) => string | undefined): Found {
  for (const c of order) {
    const v = get(c);
    if (typeof v === "string" && v.trim()) return { text: v, from: c };
  }
  return { text: "", from: "" };
}

export function resolver(order: string[], files: Record<string, LangFileLike>) {
  return {
    ui: (key: string) => walk(order, (c) => files[c]?.ui?.[key]),
    item: (it: SheetItem, field: "text" | "help" = "text") =>
      walk(order, (c) => files[c]?.items?.[it.key]?.[field] || (field === "help" ? it.help : it.text)?.[c]),
    option: (it: SheetItem, o: SheetOption) =>
      walk(order, (c) => files[c]?.items?.[it.key]?.options?.[String(o.value)] || o.text?.[c]),
  };
}

/**
 * Share (0–1) of what a respondent sees that this language has text for —
 * its own or inherited along its fallback chain BEFORE English. The same
 * test the live gate applies (tests/i18n.test.ts), over the fielded items.
 */
export function coverage(code: string, order: string[], files: Record<string, LangFileLike>, uiKeys: string[], items: SheetItem[]): number {
  if (code === "en") return 1;
  const r = resolver(order.filter((c) => c !== "en"), files);
  let total = 0, have = 0;
  const count = (f: Found) => { total++; if (f.text) have++; };
  for (const k of uiKeys) count(r.ui(k));
  for (const it of items) {
    count(r.item(it));
    if (it.help?.en) count(r.item(it, "help"));
    for (const o of it.options ?? []) count(r.option(it, o));
  }
  return total ? have / total : 1;
}

/* ── the CSV: identical to scripts/translation-sheet.mjs rowsFor() ────── */

const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (rows: string[][]) => "\uFEFF" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";

/** One row per piece of text: id · context · english · translation · note. `own` is the language's file ({} for a language not on the site). */
export function sheetRows(code: string, items: SheetItem[], enUi: Record<string, string>, own: LangFileLike): string[][] {
  const item = (key: string) => own.items?.[key] ?? {};
  const rows: string[][] = [["id", "context", "english", "translation", "note"]];
  for (const [k, v] of Object.entries(enUi)) {
    const note = /\{\w+\}/.test(v) ? "Keep {placeholders} exactly as written." : k === "welcome_title" ? "Keep the [square brackets] around the highlighted words." : "";
    rows.push([`ui:${k}`, "survey screen", v, own.ui?.[k] ?? "", note]);
  }
  for (const it of [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    const ctx = [it.section, it.question_domain, it.tier !== "na" ? it.tier : null, it.scored ? "scored" : null].filter(Boolean).join(" · ");
    rows.push([`item:${it.key}`, ctx, it.text?.en ?? "", item(it.key).text ?? it.text?.[code] ?? "", it.scored ? "A scored question: keep the meaning exact — a researcher checks this one." : ""]);
    if (it.help?.en) rows.push([`help:${it.key}`, ctx + " · help", it.help.en, item(it.key).help ?? it.help?.[code] ?? "", ""]);
    for (const o of it.options ?? [])
      rows.push([`option:${it.key}:${o.value}`, `${it.key} · answer`, o.text?.en ?? "", item(it.key).options?.[String(o.value)] ?? o.text?.[code] ?? "", ""]);
  }
  return rows;
}

/* ── the survey as plain text ────────────────────────────────────────── */

const SECTION: Record<string, string> = {
  demographic: "About you",
  screener: "Where you're at",
  index: "The Index questions",
  driver: "What shapes your faith",
  journey: "Your journey so far",
  exploration: "Exploring",
  module: "Insight module",
};

/**
 * The whole fielded survey, in order, as a respondent in `code` would read
 * it. Text that falls through to English is marked [EN] so a reviewer sees
 * at a glance what is still untranslated. Header and section names are for
 * the reader (English); everything a respondent sees is in the language.
 */
export function surveyText(opts: {
  code: string;
  name: string;
  stage: Stage;
  version: string;
  order: string[];
  files: Record<string, LangFileLike>;
  items: SheetItem[];
  minutes: number;
  coverage: number;
  date?: string;
}): string {
  const { code, order, files, items } = opts;
  const r = resolver(order, files);
  const mark = (f: Found) => (code !== "en" && f.from === "en" ? "[EN] " : "") + f.text;
  const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  const ui = (k: string, vars: Record<string, string | number> = {}) => {
    const f = r.ui(k);
    return mark({ ...f, text: fill(f.text, vars) });
  };
  const ORG = "[your organisation]";
  const out: string[] = [];
  const pct = Math.round(opts.coverage * 100);
  out.push(`The Jesus Index — the survey in ${opts.name} (${code})`);
  out.push(`Instrument ${opts.version} · stage: ${STAGES.find((s) => s.key === opts.stage)?.label ?? opts.stage} · ${pct}% translated${opts.date ? ` · exported ${opts.date}` : ""}`);
  if (code !== "en") out.push("Lines starting [EN] have no translation yet and show in English.");
  out.push("Respondent-facing text only. Every response is anonymous; no answer here is ever linked to a person.");
  out.push("", "=".repeat(64), "");
  out.push(ui("welcome_title").replace(/\[(.*?)\]/g, "$1"));
  out.push("", ui("welcome_body", { org: ORG, minutes: opts.minutes }), "");

  let section = "";
  let n = 0;
  for (const it of items) {
    if (it.section && it.section !== section) {
      section = it.section;
      if (out[out.length - 1] !== "") out.push("");
      out.push(`— ${SECTION[section] ?? section} —`, "");
    }
    n++;
    const conditional = !!(it.show_if && JSON.stringify(it.show_if) !== "{}");
    out.push(`${n}. ${mark(r.item(it))}${conditional ? "   (asked only if earlier answers lead here)" : ""}`);
    if (it.help?.en) out.push(`   ${mark(r.item(it, "help"))}`);
    if (it.type === "likert_5") for (let v = 1; v <= 5; v++) out.push(`   ${v}  ${ui(`likert_${v}`)}`);
    else if (it.type === "yes_no") out.push(`   ○ ${ui("yes")}`, `   ○ ${ui("no")}`);
    else if (it.type === "open_text") out.push(it.session_field === "country" ? `   [${ui("choose_country")}]` : `   [${ui("type_here")}]`);
    else {
      const box = it.type === "multi_select" ? "☐" : "○";
      if (it.type === "multi_select" && it.max_select) out.push(`   (${ui("select_up_to", { n: it.max_select })})`);
      for (const o of it.options ?? []) out.push(`   ${box} ${mark(r.option(it, o))}`);
    }
    out.push("");
  }
  out.push("=".repeat(64), "", ui("thanks"), ui("done_saved", { org: ORG }), ui("done_private"));
  return out.join("\n") + "\n";
}

/** A safe download name: jfindx-survey-fr-v7.csv */
export const fileName = (code: string, version: string, ext: "csv" | "txt", starter = false) =>
  `jfindx-survey-${code}-${version}${starter ? "-starter" : ""}.${ext}`;
