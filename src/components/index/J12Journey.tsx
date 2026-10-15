"use client";

/**
 * The J12 — the actual instrument, drawn as its own mark (Oct 2026 round).
 *
 * The earlier version was a table of blank blocks whose phrases faded in on
 * hover. Ulrich's edit: remove the blocks, draw the real J12, and let the
 * details appear on hover. So this IS the J12 mark (the same cross-in-a-grid
 * as the hero/brand mark — colours from j12CellColour() in Figures, so the
 * two can't drift), at full size, with its twelve cells numbered J1–J12.
 *
 * Each cell is one of the twelve core questions — the J12 — and the detail
 * panel shows, for the cell under the pointer (or focused, or tapped):
 *   - where it sits (question × tier) and the plain-language phrase
 *     (MATRIX_PHRASE, src/lib/model.ts);
 *   - the core question itself, read from the LIVE instrument (the item
 *     flagged `core` in that cell) — never typed here;
 *   - how many more questions the full survey asks in the same cell.
 * Rename a cell or re-word an item in config and this follows.
 *
 * Phones have no hover: tap a cell to pin it. Keyboard: Tab through the
 * cells; the panel is an aria-live region. No chart library.
 */
import { GradientRule } from "@/components/site/Chrome";
import { useMemo, useState } from "react";
import { j12CellColour, j12Lighten } from "@/components/index/Figures";
import { instrument, t } from "@/lib/instrument";
import { DOMAINS, DOMAIN_GLOSS, DOMAIN_LABEL, DOMAIN_SHORT, MATRIX_PHRASE, RULE, TIERS, TIER_GLOSS, TIER_LABEL } from "@/lib/model";

type Cell = { n: number; d: string; t: string; core: string | null; more: number };

// Front-page wording for the "How to read it" list, keyed by tier. Falls back to
// TIER_GLOSS (the model's own gloss) for any tier added later, so a new tier
// never renders blank.
const TIER_QUESTION: Record<string, string> = {
  exposure: "have they encountered Jesus?",
  response: "have they responded to Him?",
  formation: "are they being formed in Him?",
  multiplication: "are they multiplying their faith?",
};

const tierDot = (tier: string) => `rgb(var(--c-map-${tier}))`;

function buildCells(): Cell[] {
  const cells: Cell[] = [];
  DOMAINS.forEach((d, r) =>
    TIERS.forEach((tk, c) => {
      const inCell = instrument.items.filter(
        (i) => i.scored && i.question_domain === d && i.tier === tk && i.branch !== "unengaged",
      );
      const core = inCell.find((i) => i.core) ?? inCell[0];
      cells.push({ n: r * TIERS.length + c + 1, d, t: tk, core: core ? t(core.text, "en") : null, more: Math.max(0, inCell.length - 1) });
    }),
  );
  return cells;
}

export default function J12Journey() {
  const cells = useMemo(buildCells, []);
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const active = hover ?? pinned;
  const cell = active ? cells[active - 1] : null;
  const total = cells.length;
  // How many questions capture each cell, read from the instrument (two in v5).
  // Said only when every cell has the same number, so the sentence stays true.
  const perCell = cells.every((c) => c.more === cells[0].more) ? cells[0].more + 1 : null;
  const NUM = ["no", "one", "two", "three", "four", "five", "six"];

  return (
    <section aria-labelledby="j12-journey" className="pb-12 pt-10">
      <GradientRule className="mb-10" />
      <p className="figcap">The J12</p>
      <h2 id="j12-journey" className="mt-2 text-[28px] font-bold leading-tight tracking-tight sm:text-[32px]">
        {total} unique items. One shared measure of Jesus-following.
      </h2>
      <p className="mt-3 max-w-measure text-[16.5px] leading-relaxed text-ink-2">
        Do they follow Jesus? Do they participate in His mission? Does their world look different? We ask each question at four depths, from first hearing about Jesus to helping someone else follow Him.
        {perCell !== null && perCell > 1 && <> Every box in the J12 is measured by {NUM[perCell] ?? perCell} survey questions.</>}{" "}
        <span className="hidden sm:inline">Hover a box to see how it&apos;s represented in the survey.</span>
        <span className="sm:hidden">Tap a box to see how it&apos;s represented in the survey.</span>
      </p>

      <div className="mt-8 grid items-start gap-8 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] md:gap-12">
        {/* ── the mark itself ─────────────────────────────────────────── */}
        <div onMouseLeave={() => setHover(null)}>
          <div className="grid grid-cols-[3.75rem_repeat(4,minmax(0,1fr))] gap-1.5 sm:grid-cols-[4.75rem_repeat(4,minmax(0,1fr))] sm:gap-2">
            <span aria-hidden />
            {TIERS.map((tk) => (
              <span
                key={tk}
                aria-hidden
                className="tabular break-words pb-1 text-center text-[9px] uppercase leading-tight tracking-[0.02em] sm:text-[10.5px] sm:tracking-[0.06em]"
                style={{ color: cell?.t === tk ? "rgb(var(--c-ink))" : "rgb(var(--c-muted))" }}
              >
                {TIER_LABEL[tk]}
              </span>
            ))}

            {DOMAINS.map((d, r) => (
              <Row key={d}>
                <span
                  aria-hidden
                  className="flex items-center pr-1 text-[13px] font-semibold sm:text-[14.5px]"
                  style={{ color: cell?.d === d ? "rgb(var(--c-ink))" : "rgb(var(--c-ink-2))" }}
                >
                  {DOMAIN_SHORT[d]}
                </span>
                {TIERS.map((tk, c) => {
                  const k = cells[r * TIERS.length + c];
                  const colour = j12CellColour(r, c);
                  const on = active === k.n;
                  const dim = active !== null && !on;
                  return (
                    <button
                      key={tk}
                      type="button"
                      aria-pressed={pinned === k.n}
                      aria-label={`J${k.n}: ${DOMAIN_SHORT[d]} × ${TIER_LABEL[tk]} — ${MATRIX_PHRASE[d]?.[tk]}${k.core ? `. “${k.core}”` : ""}`}
                      onMouseEnter={() => setHover(k.n)}
                      onFocus={() => setHover(k.n)}
                      onBlur={() => setHover(null)}
                      onClick={() => setPinned((p) => (p === k.n ? null : k.n))}
                      className="relative aspect-square rounded-lg transition-[opacity,box-shadow,transform] duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none sm:rounded-xl"
                      style={{
                        background: colour
                          ? `linear-gradient(to right, ${j12Lighten(colour, 0.22)}, ${colour})`
                          : on
                            ? "rgb(var(--c-paper-deep))"
                            : "transparent",
                        border: colour ? "none" : `1.5px solid ${on ? "rgb(var(--c-ink))" : RULE}`,
                        boxShadow: on && colour ? "0 0 0 2px rgb(var(--c-plate)), 0 0 0 4px rgb(var(--c-ink))" : "none",
                        opacity: dim ? 0.42 : 1,
                        transform: on ? "translateY(-2px)" : "none",
                      }}
                    >
                      <span
                        aria-hidden
                        className="tabular absolute left-1.5 top-1 text-[10px] sm:left-2 sm:top-1.5 sm:text-[11px]"
                        style={{ color: colour ? "rgb(255 255 255 / 0.92)" : "rgb(var(--c-muted))" }}
                      >
                        J{k.n}
                      </span>
                    </button>
                  );
                })}
              </Row>
            ))}
          </div>
          <p className="figcap mt-4 leading-relaxed">
            The J12 · rows are the three questions, columns are the four depths
          </p>
        </div>

        {/* ── the details, on hover ───────────────────────────────────── */}
        <div aria-live="polite" className="min-h-[17rem] rounded-2xl border border-rule bg-plate p-5 shadow-sm sm:p-6 md:sticky md:top-6">
          {cell ? (
            <>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-2">
                <span className="tabular rounded-md bg-ink px-1.5 py-0.5 text-[12px] text-paper">J{cell.n}</span>
                <span className="font-semibold text-ink">{DOMAIN_SHORT[cell.d]}</span>
                <span aria-hidden>×</span>
                <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
                  <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: tierDot(cell.t) }} />
                  {TIER_LABEL[cell.t]}
                </span>
                {pinned === cell.n && <span className="text-muted">· pinned</span>}
              </p>
              <p className="mt-4 text-[26px] font-bold leading-tight tracking-tight text-ink">{MATRIX_PHRASE[cell.d]?.[cell.t]}</p>
              <p className="mt-1 text-[14px] text-ink-2">
                {DOMAIN_LABEL[cell.d]} <span className="text-muted">({DOMAIN_GLOSS[cell.d]})</span> · {TIER_LABEL[cell.t]}:{" "}
                <i>{TIER_GLOSS[cell.t]}</i>
              </p>
              {cell.core && (
                <figure className="mt-5 border-l-2 border-emerald pl-4">
                  <figcaption className="figcap">The J12 asks</figcaption>
                  <blockquote className="mt-1.5 text-[17px] leading-snug text-ink">“{cell.core}”</blockquote>
                  <p className="mt-2 text-[13px] text-muted">Agree – disagree, on a five-point scale.</p>
                </figure>
              )}
              {cell.more > 0 && (
                <p className="mt-4 text-[13.5px] leading-relaxed text-ink-2">
                  The full survey asks {cell.more} more question{cell.more === 1 ? "" : "s"} here, so no score rests on a single answer.
                </p>
              )}
            </>
          ) : (
            <div className="flex h-full flex-col justify-center">
              <p className="figcap">How to read it</p>
              <p className="mt-3 text-[20px] font-bold leading-snug text-ink">
                Each box is one core question. Read left to right to see how far faith has gone.
              </p>
              <ul className="mt-4 flex flex-col gap-2 text-[14.5px] text-ink-2">
                {TIERS.map((tk, i) => (
                  <li key={tk} className="flex items-center gap-2.5">
                    <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: tierDot(tk) }} />
                    <span>
                      <b className="text-ink">{i + 1}. {TIER_LABEL[tk]}</b> — {TIER_QUESTION[tk] ?? TIER_GLOSS[tk]}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-[13px] text-muted">
                <span className="hidden sm:inline">Hover</span>
                <span className="sm:hidden">Tap</span> any box for its question.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/** A row of the grid — a fragment, so the row label and its four cells share the parent grid's columns. */
function Row({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
