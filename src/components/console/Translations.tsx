"use client";

/**
 * The admin console's Translations tile (Nov 2026).
 *
 * Every language on the site, in four stages — Live, Translating, Prospective,
 * Aspirational (src/lib/translations.ts) — with, for each one:
 *
 *   Open survey  → the real survey, in that language, held in memory
 *                  (SurveyDemo). Nothing is ever written, whatever the stage —
 *                  so even a live language can be walked without adding a
 *                  response to anyone's numbers.
 *   Text         → the whole fielded survey as a .txt, untranslated lines
 *                  marked [EN].
 *   CSV          → the translation sheet, identical to
 *                  `node scripts/translation-sheet.mjs export <code>`, so it
 *                  can be translated and imported with that script.
 *
 * At the top: how far the site has got through the world's main languages
 * (src/data/languages.world.json), one cell per language.
 *
 * Read-only on purpose. A language changes stage through a reviewed PR to
 * src/data/locales.json (docs/TRANSLATION.md) — going live is researcher-
 * owned, and CI refuses a live language that isn't complete.
 *
 * No respondent data: everything here is built from the instrument and the
 * language files in the bundle. Language chunks load only when this band
 * opens, so nothing is added to the respondent path.
 */
import { useEffect, useMemo, useState } from "react";
import worldJson from "@/data/languages.world.json";
import enFile from "@/data/i18n/en.json";
import { REGISTRY, loadLang, loadLangFile, type Lang, type LangFile } from "@/lib/i18n";
import { chain } from "@/lib/i18nCore";
import { WELCOME_MINUTES, fieldedItems, instrument } from "@/lib/instrument";
import {
  STAGES,
  coverage,
  fileName,
  sheetRows,
  stageCounts,
  stageOf,
  surveyText,
  toCsv,
  worldRows,
  type SheetItem,
  type Stage,
  type WorldLanguage,
} from "@/lib/translations";
import SurveyDemo from "@/components/survey/SurveyDemo";

const WORLD = (worldJson as { languages: WorldLanguage[] }).languages;
const EN_UI = (enFile as { ui: Record<string, string> }).ui;
const UI_KEYS = Object.keys(EN_UI);
const FIELDED = fieldedItems() as unknown as SheetItem[];
const ALL_ITEMS = instrument.items as unknown as SheetItem[];

/** The stage ramp — the site's one working colour, deepest for live (as Collab Insights' language chart). */
const FILL: Record<Stage, string> = {
  live: "rgb(var(--c-emerald) / 1)",
  translating: "rgb(var(--c-emerald) / 0.55)",
  prospective: "rgb(var(--c-emerald) / 0.22)",
  aspirational: "rgb(var(--c-rule))",
};

type Row = {
  code: string;
  name: string;
  native: string;
  dir: "ltr" | "rtl";
  stage: Stage;
  status: string;
  note?: string;
  onSite: boolean;
};

function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Translations() {
  const world = useMemo(() => worldRows(WORLD, REGISTRY), []);
  const counts = useMemo(() => stageCounts(world), [world]);

  // Every language on the site, plus each aspirational world language.
  const rows: Row[] = useMemo(
    () => [
      ...REGISTRY.map((l) => ({ code: l.code, name: l.name, native: l.native, dir: l.dir, stage: stageOf(l.status), status: l.status, note: l.note, onSite: true })),
      ...world
        .filter((w) => w.stage === "aspirational")
        .map((w) => ({ code: w.code, name: w.name, native: w.native, dir: w.dir, stage: "aspirational" as Stage, status: "not on the site", onSite: false })),
    ],
    [world],
  );

  // Every on-site language file, loaded once when the band opens.
  const [files, setFiles] = useState<Record<string, LangFile> | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all(REGISTRY.map(async (l) => [l.code, await loadLangFile(l.code)] as const))
      .then((pairs) => live && setFiles(Object.fromEntries(pairs)))
      .catch((e: unknown) => live && setLoadErr(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, []);

  const cov = useMemo(() => {
    if (!files) return null;
    const out: Record<string, number> = {};
    for (const l of REGISTRY) out[l.code] = coverage(l.code, chain(l.code, REGISTRY), files, UI_KEYS, FIELDED);
    return out;
  }, [files]);

  // The open survey (one at a time).
  const [open, setOpen] = useState<string | null>(null);
  const [openLang, setOpenLang] = useState<Lang | null>(null);
  useEffect(() => {
    setOpenLang(null);
    if (open) loadLang(open).then(setOpenLang);
  }, [open]);

  function textFor(r: Row) {
    const order = r.onSite ? chain(r.code, REGISTRY) : ["en"];
    return surveyText({
      code: r.onSite ? r.code : "en",
      name: r.onSite ? r.name : `${r.name} — English source, not yet translated`,
      stage: r.stage,
      version: instrument.version,
      order,
      files: files ?? { en: enFile as LangFile },
      items: FIELDED,
      minutes: WELCOME_MINUTES,
      coverage: r.onSite ? cov?.[r.code] ?? 0 : 0,
      date: new Date().toISOString().slice(0, 10),
    });
  }

  function csvFor(r: Row) {
    const own = (r.onSite && r.code !== "en" ? files?.[r.code] : undefined) ?? { ui: {}, items: {} };
    return toCsv(sheetRows(r.code, ALL_ITEMS, EN_UI, own));
  }

  const btn =
    "rounded-md border border-rule-2 px-2.5 py-1 text-[12.5px] font-semibold text-ink-2 hover:border-ink hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-rule-2 disabled:hover:text-ink-2";

  const total = world.length;
  const ordered = [...world].sort((a, b) => STAGES.findIndex((s) => s.key === a.stage) - STAGES.findIndex((s) => s.key === b.stage));

  return (
    <div className="space-y-10">
      {/* ── the world's main languages ─────────────────────────────── */}
      <section aria-labelledby="world-progress">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 id="world-progress" className="text-[16px] font-bold tracking-tight text-ink">
            The world&apos;s {total} main languages
          </h3>
          <p className="tabular text-[13px] text-ink-2">
            <b className="text-ink">{counts.live}</b> live · <b className="text-ink">{counts.live + counts.translating}</b> live or in translation · {counts.aspirational} not started
          </p>
        </div>

        <div
          role="img"
          aria-label={`Of the world's ${total} main languages: ${STAGES.map((s) => `${counts[s.key]} ${s.label.toLowerCase()}`).join(", ")}.`}
          className="mt-3 flex h-7 w-full gap-[3px] overflow-hidden rounded-lg"
        >
          {ordered.map((w) => (
            <span
              key={w.code}
              title={`${w.name} — ${STAGES.find((s) => s.key === w.stage)?.label}${w.variants.length ? ` (${w.variants.join(", ")})` : ""}`}
              className="h-full flex-1 first:rounded-l-lg last:rounded-r-lg"
              style={{ background: FILL[w.stage] }}
            />
          ))}
        </div>

        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px] text-ink-2">
          {STAGES.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-3 w-3 rounded-sm" style={{ background: FILL[s.key] }} />
              {s.label} <span className="tabular font-semibold text-ink">{counts[s.key]}</span>
            </li>
          ))}
        </ul>

        <details className="mt-3 text-[13px] text-ink-2">
          <summary className="cursor-pointer font-semibold text-ink">Which languages</summary>
          <ol className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
            {world.map((w) => (
              <li key={w.code} className="flex items-center justify-between gap-2 border-b border-rule py-1">
                <span className="truncate">
                  {w.name} <span lang={w.code} dir={w.dir} className="text-muted">{w.native}</span>
                </span>
                <span className="flex flex-none items-center gap-1.5 text-[12px]">
                  <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: FILL[w.stage] }} />
                  {STAGES.find((s) => s.key === w.stage)?.label}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-2 max-w-measure text-[12px] leading-relaxed text-muted">
            Roughly in order of total speakers; the order is approximate. A language counts as live or in translation when any
            variant of it is (Spanish covers Latin American and European Spanish). The list is config —{" "}
            <code className="font-mono">src/data/languages.world.json</code>.
          </p>
        </details>
      </section>

      {loadErr && (
        <p role="alert" className="rounded-lg border border-vermillion/40 bg-vermillion/5 px-4 py-3 text-[14px] text-ink">
          The language files didn&apos;t load ({loadErr}). Reload the page; downloads stay off until they do.
        </p>
      )}

      {/* ── every language, by stage ───────────────────────────────── */}
      {STAGES.map((s) => {
        const group = rows.filter((r) => r.stage === s.key);
        return (
          <section key={s.key} aria-labelledby={`stage-${s.key}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule pb-2">
              <h3 id={`stage-${s.key}`} className="flex items-center gap-2 text-[16px] font-bold tracking-tight text-ink">
                <span aria-hidden className="inline-block h-3 w-3 rounded-sm" style={{ background: FILL[s.key] }} />
                {s.label}
                <span className="tabular text-[13px] font-semibold text-muted">{group.length}</span>
              </h3>
              <p className="text-[13px] text-ink-2">{s.gloss}</p>
            </div>

            {group.length === 0 ? (
              <p className="py-3 text-[14px] text-ink-2">None at this stage.</p>
            ) : (
              <ul>
                {group.map((r) => {
                  const pct = r.onSite ? (cov ? Math.round(cov[r.code] * 100) : null) : 0;
                  const isOpen = open === r.code;
                  return (
                    <li key={r.code} className="border-b border-rule py-3">
                      <div className="grid items-center gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]">
                        <div className="min-w-0">
                          <p className="text-[15px] font-semibold text-ink">
                            {r.name}{" "}
                            <span lang={r.code} dir={r.dir} className="font-normal text-ink-2">{r.native}</span>
                          </p>
                          <p className="tabular text-[12px] text-muted">
                            {r.code} · {r.status}
                            {r.dir === "rtl" ? " · right to left" : ""}
                          </p>
                          {r.note && <p className="mt-0.5 text-[12.5px] leading-snug text-ink-2">{r.note}</p>}
                        </div>

                        <div className="min-w-0">
                          <div
                            role="progressbar"
                            aria-label={`${r.name} translated`}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={pct ?? undefined}
                            aria-valuetext={pct == null ? "loading" : `${pct}%`}
                            className="h-2 w-full overflow-hidden rounded-full bg-paper-deep"
                          >
                            <div className="h-full rounded-full" style={{ width: `${pct ?? 0}%`, background: FILL[r.stage === "aspirational" ? "prospective" : r.stage] }} />
                          </div>
                          <p className="tabular mt-1 text-[12px] text-ink-2">
                            {pct == null ? "…" : r.onSite ? `${pct}% translated` : "no translation yet"}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            className={btn}
                            aria-expanded={isOpen}
                            disabled={!r.onSite}
                            title={r.onSite ? undefined : "Nothing to show until the language is added and translation starts"}
                            onClick={() => setOpen(isOpen ? null : r.code)}
                          >
                            {isOpen ? "Close survey" : "Open survey"}
                          </button>
                          <button
                            type="button"
                            className={btn}
                            disabled={!files}
                            onClick={() => download(fileName(r.code, instrument.version, "txt", !r.onSite), textFor(r), "text/plain;charset=utf-8")}
                          >
                            Text
                          </button>
                          <button
                            type="button"
                            className={btn}
                            disabled={!files}
                            onClick={() => download(fileName(r.code, instrument.version, "csv", !r.onSite), csvFor(r), "text/csv;charset=utf-8")}
                          >
                            {r.onSite ? "CSV" : "Starter CSV"}
                          </button>
                        </div>
                      </div>

                      {isOpen && (
                        <div className="mt-4 grid gap-6 rounded-xl bg-paper-deep p-5 md:grid-cols-[340px_1fr]">
                          {openLang ? <SurveyDemo lang={openLang} caption={false} /> : <p className="text-[14px] text-ink-2">Loading {r.name}…</p>}
                          <div className="max-w-measure space-y-2 text-[13.5px] leading-relaxed text-ink-2">
                            <p>
                              The survey as a respondent would see it in <b className="text-ink">{r.name}</b>. Anything not yet translated shows in{" "}
                              {chain(r.code, REGISTRY).length > 2 ? "the language it inherits from, then " : ""}English.
                            </p>
                            <p>Nothing you tap here is saved or counted, whatever the language&apos;s stage.</p>
                            {r.stage === "translating" && (
                              <p>
                                To try it on a phone, add <code className="font-mono">?preview=1&amp;lang={r.code}</code> to a survey link. A preview in a
                                language that isn&apos;t live never records an answer.
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}

      <p className="max-w-measure text-[13px] leading-relaxed text-ink-2">
        The CSV is the translation sheet: translate the <i>translation</i> column, then import it with{" "}
        <code className="font-mono">node scripts/translation-sheet.mjs import &lt;code&gt; &lt;file&gt;</code>. For an aspirational language, add it to{" "}
        <code className="font-mono">src/data/locales.json</code> first. A language moves stage only through a reviewed change — see{" "}
        <code className="font-mono">docs/TRANSLATION.md</code>.
      </p>
    </div>
  );
}
