"use client";

/**
 * Collab Intelligence → Insights (third view, beside J12 matrix / Heat map).
 *
 * Reach and re-engagement, year by year — not a score. Everything drawn here
 * comes from collab_insights() (migration 0041), which has already applied
 * the publish gate and suppressed small locality-years. The charts are plain
 * SVG: no chart library, same as the rest of the platform.
 *
 *   Timeline     started (whole bar) vs completed (coral part of the bar),
 *                switchable to countries reached per year, drawn as a pie.
 *   Languages    languages in use per year, plus the translation pipeline
 *                (languages created, by status) from src/data/locales.json.
 *   Locality     year-on-year retention, 0–1: completions ÷ last year's, per
 *                locality the survey was registered to, triangulated against
 *                where respondents said they are. Band cut-offs are config,
 *                read from the payload.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import localesJson from "@/data/locales.json";
import {
  BAND_LABEL,
  DEFAULT_BANDS,
  rateBand,
  type Insights,
  type RateBand,
} from "@/lib/collabInsights";

const LOCALES = (localesJson as { locales: { code: string; name: string; status: string }[] }).locales;
const LOCALE_NAME = new Map(LOCALES.map((l) => [l.code, l.name]));

const CORAL = (a = 1) => `rgb(var(--c-emerald) / ${a})`;
const NAVY = (a = 1) => `rgb(var(--c-navy) / ${a})`;

/** Navy = levels and benchmarks (docs/PALETTE.md); lightness encodes the band. */
const BAND_FILL: Record<RateBand, { bg: string; fg: string }> = {
  exceptional: { bg: NAVY(0.95), fg: "rgb(var(--c-plate))" },
  healthy: { bg: NAVY(0.68), fg: "rgb(var(--c-plate))" },
  average: { bg: NAVY(0.4), fg: "rgb(var(--c-ink))" },
  low: { bg: NAVY(0.18), fg: "rgb(var(--c-ink))" },
  not_yet: { bg: NAVY(0.06), fg: "rgb(var(--c-ink-2))" },
};

const STATUS = [
  { key: "live", label: "Live", fill: CORAL(1) },
  { key: "review", label: "In review", fill: CORAL(0.6) },
  { key: "draft", label: "Draft", fill: CORAL(0.3) },
  { key: "requested", label: "Requested", fill: CORAL(0.1) },
];

const nf = (n: number) => n.toLocaleString();

export default function CollabInsights({ data }: { data: Insights | null }) {
  if (!data) return <p className="py-16 text-center text-[14.5px] text-ink-2">Loading insights…</p>;
  if (!data.published) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center">
        <p className="text-[20px] font-semibold">Insights open with the Collab&apos;s pooled view</p>
        <p className="max-w-lg text-[14.5px] leading-relaxed text-ink-2">
          Reach, languages and locality rates are published under the same gate as every other Collab figure —{" "}
          {(data.completions ?? 0).toLocaleString()} completions so far.
        </p>
      </div>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="grid min-w-0 gap-4 lg:grid-cols-5">
        <TimelineTile data={data} />
        <LanguagesTile data={data} />
      </div>
      <LocalityTile data={data} />
      <p className="text-[13px] text-ink-2">
        Reach counts every session started through a Collab organisation, by the calendar year it started. Scores
        elsewhere stay scoped to those who have completed the Index.
      </p>
    </div>
  );
}

// ── Tiles ───────────────────────────────────────────────────────────────────

function Tile({ title, sub, right, className = "", children }: {
  title: string; sub: string; right?: React.ReactNode; className?: string; children: React.ReactNode;
}) {
  return (
    <section className={`flex min-w-0 flex-col gap-4 rounded-xl border border-rule bg-plate p-4 sm:p-5 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[16px] font-semibold leading-snug">{title}</h3>
          <p className="mt-0.5 text-[13px] leading-snug text-ink-2">{sub}</p>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function Toggle<T extends string>({ value, options, onChange, label }: {
  value: T; options: { key: T; label: string }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex shrink-0 gap-1 rounded-lg bg-rule/70 p-0.5">
      {options.map((o) => (
        <button key={o.key} type="button" aria-pressed={value === o.key} onClick={() => onChange(o.key)}
          className={`rounded-md px-3 py-1.5 text-[13px] font-semibold ${value === o.key ? "bg-plate text-ink shadow-sm" : "text-ink-2 hover:text-ink"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function TimelineTile({ data }: { data: Insights }) {
  const [mode, setMode] = useState<"responses" | "countries">("responses");
  const timeline = data.timeline ?? [];
  const started = timeline.reduce((s, t) => s + t.started, 0);
  const completed = timeline.reduce((s, t) => s + t.completed, 0);

  return (
    <Tile
      className="lg:col-span-3"
      title={mode === "responses" ? "Timeline" : "Countries reached"}
      sub={mode === "responses"
        ? `${nf(started)} started · ${nf(completed)} completed, all years`
        : `${nf(data.countries_total ?? 0)} distinct countries across all years`}
      right={<Toggle label="Timeline view" value={mode} onChange={setMode}
        options={[{ key: "responses", label: "Responses" }, { key: "countries", label: "Countries" }]} />}
    >
      {timeline.length === 0 ? (
        <Empty />
      ) : mode === "responses" ? (
        <>
          <StackedBars rows={timeline} />
          <div className="flex flex-wrap gap-4 text-[12.5px] text-ink-2">
            <Swatch fill={CORAL(0.16)} border>Started</Swatch>
            <Swatch fill={CORAL(1)}>Completed</Swatch>
          </div>
        </>
      ) : (
        <CountriesPie rows={data.countries_by_year ?? []} />
      )}
    </Tile>
  );
}

function StackedBars({ rows }: { rows: { year: number; started: number; completed: number }[] }) {
  const [ref, W] = useWidth(320);
  const H = 240, padL = 44, padB = 34, padT = 22;
  const max = niceMax(Math.max(1, ...rows.map((r) => r.started)));
  const plotW = W - padL - 8, plotH = H - padB - padT;
  const slot = plotW / rows.length;
  const bw = Math.min(64, slot * 0.62);
  const y = (v: number) => padT + plotH - (v / max) * plotH;

  return (
    <div ref={ref} className="w-full min-w-0 overflow-hidden">
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block" role="img"
      aria-label={`Sessions started and completed per year: ${rows.map((r) => `${r.year}, ${r.started} started, ${r.completed} completed`).join("; ")}`}>
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={padL} x2={W - 8} y1={y(max * f)} y2={y(max * f)} stroke="rgb(var(--c-rule))" />
          <text x={padL - 8} y={y(max * f) + 4} textAnchor="end" className="fill-ink-2 font-mono" fontSize="10.5">{compact(max * f)}</text>
        </g>
      ))}
      {rows.map((r, i) => {
        const cx = padL + slot * i + slot / 2;
        const rate = r.started > 0 ? Math.round((r.completed / r.started) * 100) : 0;
        return (
          <g key={r.year}>
            <title>{`${r.year}: ${nf(r.started)} started, ${nf(r.completed)} completed (${rate}%)`}</title>
            <rect x={cx - bw / 2} y={y(r.started)} width={bw} height={Math.max(0, y(0) - y(r.started))} rx="4" fill={CORAL(0.16)} stroke={CORAL(0.35)} />
            <rect x={cx - bw / 2} y={y(r.completed)} width={bw} height={Math.max(0, y(0) - y(r.completed))} rx="4" fill={CORAL(1)} />
            <text x={cx} y={y(r.started) - 6} textAnchor="middle" className="fill-ink font-mono" fontSize="11" fontWeight="600">{compact(r.started)}</text>
            <text x={cx} y={H - padB + 16} textAnchor="middle" className="fill-ink font-mono" fontSize="11.5" fontWeight="600">{r.year}</text>
            <text x={cx} y={H - padB + 29} textAnchor="middle" className="fill-ink-2 font-mono" fontSize="10">{rate}% done</text>
          </g>
        );
      })}
    </svg>
    </div>
  );
}

function CountriesPie({ rows }: { rows: { year: number; countries: number }[] }) {
  const total = rows.reduce((s, r) => s + r.countries, 0);
  if (total === 0) return <Empty />;
  const R = 92, C = 100;
  let acc = 0;
  const slices = rows.map((r, i) => {
    const a0 = (acc / total) * Math.PI * 2;
    acc += r.countries;
    const a1 = (acc / total) * Math.PI * 2;
    // oldest lightest → newest full coral: the same lightness-means-sequence idea as the tier ramp
    const alpha = rows.length === 1 ? 1 : 0.25 + (0.75 * i) / (rows.length - 1);
    return { ...r, a0, a1, alpha };
  });
  const pt = (a: number, r = R) => [C + r * Math.sin(a), C - r * Math.cos(a)];

  return (
    <div className="my-auto flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <svg viewBox="0 0 200 200" className="h-44 w-44 shrink-0" role="img"
        aria-label={`Countries reached per year: ${rows.map((r) => `${r.year}, ${r.countries}`).join("; ")}`}>
        {slices.length === 1 ? (
          <circle cx={C} cy={C} r={R} fill={CORAL(1)} />
        ) : (
          slices.map((s) => {
            const [x0, y0] = pt(s.a0), [x1, y1] = pt(s.a1);
            const large = s.a1 - s.a0 > Math.PI ? 1 : 0;
            const [lx, ly] = pt((s.a0 + s.a1) / 2, R * 0.64);
            return (
              <g key={s.year}>
                <title>{`${s.year}: ${s.countries} countries`}</title>
                <path d={`M${C},${C} L${x0},${y0} A${R},${R} 0 ${large} 1 ${x1},${y1} Z`} fill={CORAL(s.alpha)} stroke="rgb(var(--c-plate))" strokeWidth="2" />
                {s.a1 - s.a0 > 0.35 && (
                  <text x={lx} y={ly + 4} textAnchor="middle" fontSize="13" fontWeight="700"
                    className={`font-mono ${s.alpha > 0.6 ? "fill-plate" : "fill-ink"}`}>{s.countries}</text>
                )}
              </g>
            );
          })
        )}
      </svg>
      <div className="flex w-full flex-col gap-2">
        {slices.slice().reverse().map((s) => (
          <div key={s.year} className="flex items-center gap-3 text-[14px]">
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: CORAL(s.alpha) }} />
            <span className="font-mono text-[12.5px] font-semibold">{s.year}</span>
            <span className="flex-1 border-b border-dotted border-rule-2" />
            <b className="font-mono text-[13px]">{s.countries}</b>
            <span className="w-16 text-[12.5px] text-ink-2">countries</span>
          </div>
        ))}
        <p className="pt-1 text-[12.5px] leading-snug text-ink-2">
          Each year counts a country once. A country active in two years appears in both slices.
        </p>
      </div>
    </div>
  );
}

function LanguagesTile({ data }: { data: Insights }) {
  const rows = data.languages_by_year ?? [];
  const [ref, W] = useWidth(320);
  const H = 200, padB = 34, padT = 22;
  const max = Math.max(1, ...rows.map((r) => r.languages));
  const slot = (W - 16) / Math.max(1, rows.length);
  const bw = Math.min(44, slot * 0.58);
  const y = (v: number) => padT + (H - padB - padT) * (1 - v / max);

  const byStatus = STATUS.map((s) => ({ ...s, n: LOCALES.filter((l) => l.status === s.key).length }));
  const created = LOCALES.length;

  return (
    <Tile className="lg:col-span-2" title="Survey languages"
      sub={`${nf(data.languages_total ?? 0)} used by respondents · ${created} created`}>
      <div ref={ref} className="w-full min-w-0 overflow-hidden">
      {rows.length === 0 ? <Empty /> : (
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block" role="img"
          aria-label={`Languages in use per year: ${rows.map((r) => `${r.year}, ${r.languages}`).join("; ")}`}>
          <line x1="8" x2={W - 8} y1={y(0)} y2={y(0)} stroke="rgb(var(--c-rule))" />
          {rows.map((r, i) => {
            const cx = 8 + slot * i + slot / 2;
            const names = r.locales.map((l) => `${LOCALE_NAME.get(l.code) ?? l.code} (${nf(l.n)})`).join(", ");
            return (
              <g key={r.year}>
                <title>{`${r.year}: ${r.languages} languages — ${names}`}</title>
                <rect x={cx - bw / 2} y={y(r.languages)} width={bw} height={Math.max(2, y(0) - y(r.languages))} rx="4" fill={CORAL(1)} />
                <text x={cx} y={y(r.languages) - 6} textAnchor="middle" className="fill-ink font-mono" fontSize="12" fontWeight="700">{r.languages}</text>
                <text x={cx} y={H - padB + 17} textAnchor="middle" className="fill-ink font-mono" fontSize="11.5" fontWeight="600">{r.year}</text>
              </g>
            );
          })}
        </svg>
      )}
      </div>
      <div className="mt-auto flex flex-col gap-2 border-t border-rule pt-3">
        <p className="text-[13px] font-semibold">Translation pipeline</p>
        <div className="flex h-3 overflow-hidden rounded-full border border-rule" role="img"
          aria-label={byStatus.map((s) => `${s.label} ${s.n}`).join(", ")}>
          {byStatus.map((s) => s.n > 0 && (
            <span key={s.key} title={`${s.label}: ${s.n}`} style={{ width: `${(s.n / created) * 100}%`, background: s.fill }} />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-2">
          {byStatus.map((s) => <Swatch key={s.key} fill={s.fill} border={s.key === "requested"}>{s.label} {s.n}</Swatch>)}
        </div>
      </div>
    </Tile>
  );
}

function LocalityTile({ data }: { data: Insights }) {
  const bands = data.locality?.bands ?? DEFAULT_BANDS;
  const years = useMemo(() => (data.timeline ?? []).map((t) => t.year), [data.timeline]);
  const rows = data.locality_rates ?? [];
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, 12);
  const bandOrder: RateBand[] = ["exceptional", "healthy", "average", "low", "not_yet"];

  return (
    <Tile title="Locality retention"
      sub="Completions each year ÷ the year before, for the country each survey was registered to, capped at 1.00. A locality holding 0.7 or more is being re-engaged, not just reached once. The % beside n is the share of respondents who said they are in that country.">
      {rows.length === 0 ? <Empty /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-separate border-spacing-1 text-center">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-plate text-left font-mono text-[11px] font-normal uppercase tracking-[0.06em] text-ink-2">Locality</th>
                {years.map((y) => <th key={y} className="font-mono text-[11px] font-normal uppercase tracking-[0.06em] text-ink-2">{y}</th>)}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.locality}>
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-plate pr-2 text-left text-[14px]">
                    {r.locality}
                    {r.region && <span className="ml-2 hidden text-[12px] text-ink-2 sm:inline">{r.region}</span>}
                  </td>
                  {years.map((y) => {
                    const c = r.cells[String(y)];
                    if (!c) return <td key={y} className="rounded-md py-2 font-mono text-[12px] text-muted" title="No sessions this year">·</td>;
                    if (c.suppressed) {
                      return (
                        <td key={y} className="rounded-md border border-dashed border-rule-2 py-2 font-mono text-[12px] text-ink-2"
                          title={`Fewer than ${data.min_group_n ?? 10} completions — not shown`}>&lt;{data.min_group_n ?? 10}</td>
                      );
                    }
                    const match = c.match !== undefined ? ` · ${Math.round(c.match * 100)}% said ${r.locality}` : "";
                    if (c.rate === undefined) {
                      const why = c.baseline ? "first year — the baseline" : c.prev_suppressed ? "last year too small to compare" : "no activity";
                      return (
                        <td key={y} className="rounded-md border border-rule px-1 py-1.5 text-ink-2"
                          title={`${r.locality} ${y}: ${why} · n ${nf(c.n)}${match}`}>
                          <div className="text-[12px] font-semibold leading-tight">{c.baseline ? "Base" : "—"}</div>
                          <div className="font-mono text-[10.5px] leading-tight">n {compact(c.n)}{c.match !== undefined ? ` · ${Math.round(c.match * 100)}%` : ""}</div>
                        </td>
                      );
                    }
                    const b = rateBand(c.rate, bands);
                    return (
                      <td key={y} className="rounded-md px-1 py-1.5" style={{ background: BAND_FILL[b].bg, color: BAND_FILL[b].fg }}
                        title={`${r.locality} ${y}: ${c.rate.toFixed(2)} retained · ${BAND_LABEL[b]} · n ${nf(c.n)} vs ${nf(c.prev_n ?? 0)} last year${match}`}>
                        <div className="font-mono text-[14px] font-bold leading-tight">{c.rate.toFixed(2)}</div>
                        <div className="font-mono text-[10.5px] leading-tight opacity-80">n {compact(c.n)}{c.match !== undefined ? ` · ${Math.round(c.match * 100)}%` : ""}</div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-2">
          {bandOrder.map((b) => (
            <Swatch key={b} fill={BAND_FILL[b].bg} border={b === "not_yet"}>
              {BAND_LABEL[b]} {b === "not_yet" ? `< ${bands.low}` : `≥ ${bands[b]}`}
            </Swatch>
          ))}
          <span>Base = first year · % = respondents who said that country</span>
        </div>
        {rows.length > 12 && (
          <button type="button" onClick={() => setAll((v) => !v)}
            className="rounded-lg border border-rule-2 bg-plate px-3 py-1.5 text-[13px] font-semibold text-ink hover:border-ink">
            {all ? "Show top 12" : `Show all ${rows.length}`}
          </button>
        )}
      </div>
    </Tile>
  );
}

// ── Small parts ─────────────────────────────────────────────────────────────

/**
 * Draw at the container's real width, so labels stay legible on a phone
 * instead of shrinking with a scaled viewBox.
 */
function useWidth(initial: number): [React.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function Swatch({ fill, border = false, children }: { fill: string; border?: boolean; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-3 w-3 rounded-sm ${border ? "border border-rule-2" : ""}`} style={{ background: fill }} />
      {children}
    </span>
  );
}

function Empty() {
  return <p className="py-10 text-center text-[14px] text-ink-2">No sessions recorded yet.</p>;
}

function niceMax(v: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function compact(v: number): string {
  if (v >= 1_000_000) return `${+(v / 1_000_000).toFixed(1)}M`;
  if (v >= 10_000) return `${Math.round(v / 1000)}k`;
  if (v >= 1_000) return `${+(v / 1000).toFixed(1)}k`;
  return String(Math.round(v));
}
