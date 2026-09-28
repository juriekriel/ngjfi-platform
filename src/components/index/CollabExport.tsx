"use client";

/**
 * Collab Intelligence → Export. Pick what, in which format, for which years.
 *
 * Exports only what collab_insights() already returned to this browser —
 * aggregates that have passed their gates. Nothing here queries anything new,
 * and there is no path to an individual response: a suppressed cell is
 * written as "suppressed", never as a number. Every file carries an About
 * table with the scope line and the config it was cut under.
 */
import { useMemo, useState } from "react";
import localesJson from "@/data/locales.json";
import { TIERS, DOMAINS } from "@/lib/model";
import { makeXlsx, makeZip } from "@/lib/zipCore";
import {
  DATASETS,
  FORMATS,
  buildTables,
  fileStem,
  toCsv,
  toRecords,
  yearsOf,
  type DatasetKey,
  type FormatKey,
  type Insights,
  type Language,
} from "@/lib/collabInsights";

const LANGUAGES = (localesJson as { locales: Language[] }).locales;

export default function CollabExport({ data }: { data: Insights | null }) {
  const years = useMemo(() => (data ? yearsOf(data) : []), [data]);
  const [sets, setSets] = useState<DatasetKey[]>(["timeline", "countries", "languages", "locality"]);
  const [formats, setFormats] = useState<FormatKey[]>(["xlsx"]);
  const [picked, setPicked] = useState<number[]>([]); // empty = all years
  const [status, setStatus] = useState<string | null>(null);

  const ready = Boolean(data?.published);
  const yearsChosen = picked.length ? picked : years;
  const canExport = ready && sets.length > 0 && formats.length > 0 && yearsChosen.length > 0;
  const onlyUndated = sets.length > 0 && sets.every((k) => !DATASETS.find((d) => d.key === k)?.yearly);

  const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  function run() {
    if (!data || !canExport) return;
    const now = new Date();
    const tables = buildTables(data, sets, picked, { tiers: TIERS, domains: DOMAINS, languages: LANGUAGES, generatedAt: now });
    const span = yearsChosen.length === years.length ? "all-years" : [...yearsChosen].sort().join("-");
    const stem = `jfindx-collab-${data.space === "demo" ? "demo-" : ""}${span}`;

    for (const f of formats) {
      if (f === "xlsx") {
        save(makeXlsx(tables.map((t) => ({ name: t.name, rows: t.rows })), now), `${stem}.xlsx`,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      } else if (f === "json") {
        const body = Object.fromEntries(tables.map((t) => [t.key, toRecords(t.rows)]));
        save(JSON.stringify(body, null, 2), `${stem}.json`, "application/json");
      } else {
        const sheets = tables.filter((t) => t.key !== "about");
        if (sheets.length === 1) {
          // One dataset → one CSV; its About block rides along underneath a blank line.
          const about = tables.find((t) => t.key === "about")!;
          save("\ufeff" + toCsv(sheets[0].rows) + "\r\n" + toCsv(about.rows), `${stem}-${fileStem(sheets[0].name)}.csv`, "text/csv;charset=utf-8");
        } else {
          const entries = tables.map((t) => ({ name: `${fileStem(t.name)}.csv`, data: "\ufeff" + toCsv(t.rows) }));
          save(makeZip(entries, now), `${stem}-csv.zip`, "application/zip");
        }
      }
    }
    setStatus(`Exported ${sets.length} dataset${sets.length === 1 ? "" : "s"} as ${formats.map((f) => FORMATS.find((x) => x.key === f)!.label).join(" + ")}.`);
  }

  return (
    <section aria-labelledby="export-h" className="flex flex-col gap-5 rounded-2xl border border-rule bg-plate px-4 py-5 shadow-sm sm:px-7 sm:py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 id="export-h" className="text-[20px] font-bold tracking-tight">Export</h2>
          <p className="mt-1 max-w-2xl text-[14px] leading-relaxed text-ink-2">
            Download the Collab&apos;s figures for a report or your own analysis. Aggregates only — every file says what
            it covers, and anything below its gate is written as suppressed.
          </p>
        </div>
      </div>

      {!ready ? (
        <p className="rounded-xl border border-dashed border-rule-2 bg-paper-deep px-4 py-5 text-[14px] text-ink-2">
          Export opens when the Collab&apos;s pooled view is published.
        </p>
      ) : (
        <>
          <div className="grid gap-5 md:grid-cols-3">
            <fieldset className="flex flex-col gap-2 md:col-span-2">
              <legend className="mb-2 flex w-full items-center justify-between text-[14px] font-semibold">
                What
                <span className="flex gap-3 text-[13px] font-semibold">
                  <button type="button" className="text-ink-2 hover:text-ink" onClick={() => setSets(DATASETS.map((d) => d.key))}>Select all</button>
                  <button type="button" className="text-ink-2 hover:text-ink" onClick={() => setSets([])}>Clear</button>
                </span>
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {DATASETS.map((d) => (
                  <Check key={d.key} on={sets.includes(d.key)} onChange={() => setSets(toggle(sets, d.key))}>
                    {d.label}
                    {!d.yearly && <span className="ml-1 text-[12px] text-ink-2">(not by year)</span>}
                  </Check>
                ))}
              </div>
            </fieldset>

            <div className="flex flex-col gap-5">
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-[14px] font-semibold">Format</legend>
                {FORMATS.map((f) => (
                  <Check key={f.key} on={formats.includes(f.key)} onChange={() => setFormats(toggle(formats, f.key))}>
                    {f.label}
                    <span className="block text-[12px] font-normal text-ink-2">{f.note}</span>
                  </Check>
                ))}
              </fieldset>
            </div>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-[14px] font-semibold">Years</legend>
            <div className="flex flex-wrap gap-2">
              <Chip on={picked.length === 0} onClick={() => setPicked([])}>All years</Chip>
              {years.map((y) => (
                <Chip key={y} on={picked.includes(y)} onClick={() => {
                  const next = toggle(picked, y);
                  setPicked(next.length === years.length ? [] : next);
                }}>{y}</Chip>
              ))}
            </div>
            {onlyUndated && <p className="text-[12.5px] text-ink-2">The translation pipeline isn&apos;t by year, so the year choice doesn&apos;t change it.</p>}
          </fieldset>

          <div className="flex flex-wrap items-center gap-3 border-t border-rule pt-4">
            <button type="button" onClick={run} disabled={!canExport}
              className={`rounded-lg px-5 py-2.5 text-[14px] font-semibold ${canExport ? "border border-accent bg-accent text-plate hover:opacity-90" : "cursor-not-allowed border border-dashed border-rule-2 bg-paper-deep text-muted"}`}>
              Export {sets.length || ""} {sets.length === 1 ? "dataset" : "datasets"}
            </button>
            <span className="text-[13px] text-ink-2" aria-live="polite">
              {status ?? (canExport
                ? `${yearsChosen.length === years.length ? "All years" : [...yearsChosen].sort().join(", ")} · ${formats.length} format${formats.length === 1 ? "" : "s"}`
                : "Pick at least one dataset, one format and one year.")}
            </span>
          </div>
        </>
      )}
    </section>
  );
}

function Check({ on, onChange, children }: { on: boolean; onChange: () => void; children: React.ReactNode }) {
  return (
    <label className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[14px] ${on ? "border-ink bg-paper-deep" : "border-rule hover:border-rule-2"}`}>
      <input type="checkbox" checked={on} onChange={onChange} className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--c-emerald))]" />
      <span className="font-medium">{children}</span>
    </label>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold ${on ? "border-ink bg-ink text-paper" : "border-rule-2 bg-plate text-ink-2 hover:text-ink"}`}>
      {children}
    </button>
  );
}

function save(content: Uint8Array | string, filename: string, type: string) {
  // Our zip bytes always sit on a plain ArrayBuffer; the cast only narrows TS's ArrayBufferLike.
  const blob = new Blob([typeof content === "string" ? content : (content as Uint8Array<ArrayBuffer>)], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
