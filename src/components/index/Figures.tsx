/**
 * The Index's chart language, as a small set of primitives.
 *
 * Square-ended bars off a hairline axis. Tabular mono for every number. Colour
 * only ever means something: emerald is the working colour, navy is levels,
 * vermillion is reserved for "down".
 *
 * These are pure presentational components with no data fetching. That is what
 * lets the LIVE org dashboard and the GUIDED TOUR render from the same code —
 * change a bar here and both move. Nothing in the tour is a mock-up.
 */
import {
  DOMAINS,
  DOMAIN_LABEL,
  DOMAIN_SHORT,
  EMERALD,
  MATRIX_PHRASE,
  NAVY,
  TIERS,
  TIER_TINT,
  TIER_GLOSS,
  TIER_LABEL,
  delta,
  fig,
  heat,
  type DashboardData,
} from "@/lib/model";

/* ── shared furniture ─────────────────────────────────────────────────── */

export function Plate({
  label,
  figure,
  children,
  className = "",
}: {
  label: string;
  figure?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`border-t border-ink pt-2 ${className}`}>
      <header className="flex items-baseline justify-between gap-4">
        <h3 className="tabular text-[10px] uppercase tracking-[0.16em] text-ink">{label}</h3>
        {figure && <span className="figcap">{figure}</span>}
      </header>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** A bar off a hairline axis. No rounding, no gradient. */
function Bar({ value, colour = EMERALD }: { value: number | null; colour?: string }) {
  return (
    <div className="h-[9px] w-full border-b border-rule bg-paper-deep">
      <div
        className="h-full"
        style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%`, background: colour }}
      />
    </div>
  );
}

/* ── 01 · the headline number ─────────────────────────────────────────── */

export function IndexPlate({
  value,
  n,
  change,
  edition,
  caption,
}: {
  value: number | null;
  n: number;
  change?: number | null;
  edition?: string;
  caption?: string;
}) {
  const d = delta(change);
  return (
    <div className="border-y-2 border-ink py-6">
      {edition && <p className="figcap mb-3">{edition}</p>}
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
        <span className="tabular text-[64px] font-medium leading-none text-ink sm:text-[84px]">
          {fig(value)}
        </span>
        {change !== undefined && change !== null && (
          <span className="tabular text-lg" style={{ color: d.colour }}>
            {d.text}
          </span>
        )}
      </div>
      <p className="mt-3 tabular text-[11px] uppercase tracking-[0.12em] text-ink-2">
        n = {n.toLocaleString()} · among those who completed the Index
      </p>
      {caption && <p className="figcap mt-2">{caption}</p>}
    </div>
  );
}

/* ── 02 · the journey funnel ──────────────────────────────────────────── */

export function JourneyFunnel({
  tiers,
  counts,
}: {
  tiers: Record<string, number | null>;
  counts?: Record<string, number>;
}) {
  return (
    <table className="w-full text-left">
      <caption className="sr-only">Index by tier — the journey funnel</caption>
      <thead>
        <tr className="figcap">
          <th scope="col" className="pb-2 font-normal">Tier</th>
          <th scope="col" className="pb-2 font-normal">Movement</th>
          <th scope="col" className="pb-2 text-right font-normal">Index</th>
          {counts && <th scope="col" className="pb-2 text-right font-normal">n</th>}
        </tr>
      </thead>
      <tbody>
        {TIERS.map((tk) => (
          <tr key={tk} className="border-t border-rule align-middle">
            {/* The gloss goes on its own line rather than trailing the label —
                inline, "Multiplication does it spread?" wraps into the bar
                beside it at anything below a comfortable column width. */}
            <th scope="row" className="w-[34%] py-2.5 pr-3 align-top font-normal leading-tight">
              <span className="block">{TIER_LABEL[tk]}</span>
              <span className="block text-[12.5px] italic text-muted">{TIER_GLOSS[tk]}</span>
            </th>
            <td className="py-2.5 pr-3">
              <Bar value={tiers?.[tk] ?? null} />
            </td>
            <td className="tabular py-2.5 text-right text-[15px]">{fig(tiers?.[tk])}</td>
            {counts && (
              <td className="tabular py-2.5 pl-3 text-right text-[12px] text-muted">
                {(counts[tk] ?? 0).toLocaleString()}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ── 03 · the three questions ─────────────────────────────────────────── */

export function DomainBars({ domains }: { domains: Record<string, number | null> }) {
  return (
    <div className="space-y-3.5">
      {DOMAINS.map((dk) => (
        <div key={dk}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[15px] leading-snug">{DOMAIN_LABEL[dk]}</span>
            <span className="tabular text-[15px]">{fig(domains?.[dk])}</span>
          </div>
          <div className="mt-1.5">
            <Bar value={domains?.[dk] ?? null} colour={NAVY} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── 04 · the 3 × 4 matrix ────────────────────────────────────────────── */

/**
 * The heat-grid. `phrases` renders the model itself (plain language, no scores)
 * for the landing page and the tour's opening beat; without it, the same table
 * renders real cell scores. One component, both jobs — so the explanatory
 * version can never drift from the one people actually read results in.
 */
export function Matrix({
  matrix,
  phrases = false,
}: {
  matrix?: Record<string, Record<string, number | null>>;
  phrases?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-left">
        <caption className="sr-only">
          The three questions by the four tiers — what we measure, and how deep it has gone
        </caption>
        <thead>
          <tr>
            <th scope="col" className="figcap border-b border-ink pb-2 pr-3 font-normal" />
            {TIERS.map((tk) => (
              <th
                key={tk}
                scope="col"
                className="figcap border-b border-ink px-2 pb-2 text-center font-normal"
              >
                {TIER_LABEL[tk]}
                <span className="mt-0.5 block normal-case tracking-normal text-muted">
                  {TIER_GLOSS[tk]}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DOMAINS.map((dk) => (
            <tr key={dk} className="border-b border-rule">
              <th scope="row" className="py-3 pr-3 text-left font-normal leading-tight">
                <span className="block text-[14px]">{DOMAIN_SHORT[dk]}</span>
                <span className="block text-[12px] italic text-muted">{DOMAIN_LABEL[dk]}</span>
              </th>
              {TIERS.map((tk) => {
                const v = matrix?.[dk]?.[tk] ?? null;
                const tint = TIER_TINT[tk];
                return (
                  <td
                    key={tk}
                    className={`px-2.5 py-4 text-center ${phrases ? "text-[13.5px] leading-tight" : "tabular text-[15px]"}`}
                    style={
                      phrases
                        ? { background: tint.bg, color: tint.fg }
                        : { background: heat(v) }
                    }
                  >
                    {phrases ? MATRIX_PHRASE[dk][tk] : fig(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── 05 · movement over waves ─────────────────────────────────────────── */

export function TrendPlate({ trend }: { trend: { year: number; index: number }[] }) {
  if (!trend?.length) return null;
  const max = Math.max(...trend.map((p) => p.index), 100);
  return (
    <div className="flex items-end gap-6 border-b border-ink pb-0 pt-2">
      {trend.map((p, idx) => {
        const prev = idx > 0 ? trend[idx - 1].index : null;
        const d = prev === null ? null : Number((p.index - prev).toFixed(1));
        const dd = delta(d);
        return (
          <div key={p.year} className="flex flex-col items-center gap-1.5">
            <span className="tabular text-[13px]">{p.index}</span>
            <div
              className="w-9"
              style={{ height: `${Math.max(4, (p.index / max) * 96)}px`, background: EMERALD }}
            />
            <span className="tabular text-[10px] text-muted">{p.year}</span>
            {d !== null && (
              <span className="tabular text-[10px]" style={{ color: dd.colour }}>
                {dd.text}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── 06 · the ledger ──────────────────────────────────────────────────── */

/**
 * The most trustworthy artifact on any research site is a well-set table.
 * `labelFor` is injected so the caller decides how to resolve item keys —
 * responses bind to the instrument version they were captured under, so a
 * dashboard can legitimately contain keys from an archived version.
 */
export function ItemLedger({
  items,
  labelFor,
}: {
  items: DashboardData["items"];
  labelFor: (key: string) => string;
}) {
  if (!items?.length) return null;
  return (
    <table className="w-full text-left">
      <caption className="sr-only">Per-question detail</caption>
      <thead>
        <tr className="figcap">
          <th scope="col" className="border-b border-ink pb-2 font-normal">Item</th>
          <th scope="col" className="border-b border-ink pb-2 font-normal">Tier</th>
          <th scope="col" className="border-b border-ink pb-2 text-right font-normal">Mean</th>
          <th scope="col" className="border-b border-ink pb-2 text-right font-normal">n</th>
        </tr>
      </thead>
      <tbody>
        {items.map((it) => (
          <tr key={it.key} className="border-b border-rule">
            <td className="py-2 pr-3 text-[14px] leading-snug">{labelFor(it.key)}</td>
            <td className="tabular py-2 pr-3 text-[10px] uppercase tracking-wider text-muted">
              {TIER_LABEL[it.tier] ?? it.tier}
            </td>
            <td className="tabular py-2 text-right text-[14px]">{fig(it.mean)}</td>
            <td className="tabular py-2 pl-3 text-right text-[12px] text-muted">
              {it.n.toLocaleString()}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ── 07 · the integrity footer, on every surface that shows a number ──── */

export function IntegrityNote({ extra }: { extra?: string }) {
  return (
    <p className="figcap mt-6 leading-relaxed">
      Aggregates only — never an individual response. Of those who completed the Index.
      {extra ? ` ${extra}` : ""}
    </p>
  );
}

/* ── 08 · the J12 diagram ─────────────────────────────────────────────── */

/**
 * The J12's own diagram: twelve cells, six of them lit — a cross among the
 * twelve. Round One's cross-grid, re-read; the geometry gained a second meaning
 * by changing nothing.
 *
 * Used where the front page needs a visual anchor that carries the idea without
 * putting a single fabricated figure on screen. Twelve items, twelve disciples,
 * one shape.
 */
export function J12Grid({ className = "" }: { className?: string }) {
  const COLS = 4;
  const ROWS = 3;
  // Vertical bar down column 1, horizontal bar across row 1 → exactly six cells.
  const lit = (r: number, c: number) => c === 1 || r === 1;

  return (
    <figure className={className}>
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}>
        {Array.from({ length: ROWS * COLS }, (_, i) => {
          const r = Math.floor(i / COLS);
          const c = i % COLS;
          const on = lit(r, c);
          return (
            <div
              key={i}
              aria-hidden="true"
              className="aspect-square"
              style={{
                background: on ? TIER_TINT[TIERS[c]].bg : "transparent",
                border: on ? "none" : "1px solid #D9D2C4",
              }}
            />
          );
        })}
      </div>
      <figcaption className="figcap mt-3 leading-relaxed">
        The J12 — twelve items, and a cross among them
      </figcaption>
    </figure>
  );
}
