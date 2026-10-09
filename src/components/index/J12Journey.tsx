"use client";

/**
 * The J12 journey — the model, not results — for the front page.
 *
 * Four tier headings (Exposure → Response → Formation → Multiplication), each
 * in its tier colour (the --c-map-* hues the map and matrix already use), and
 * three lane headings (Follow, Mission, World) in the coral gradient of the
 * J12 mark in the hero. Headings carry their name only.
 *
 * The twelve cells start BLANK. Hover or focus a cell and its phrase appears;
 * hover or focus a TIER heading and its whole column fills in; a LANE heading,
 * its whole row (one journey, left to right). On a phone there is no hover:
 * the lanes are tabs and each tier is tapped to reveal its phrase.
 *
 * Every word comes from src/lib/model.ts (TIER_LABEL, DOMAIN_SHORT,
 * DOMAIN_LABEL, MATRIX_PHRASE) — rename a cell there and this follows. The
 * phrases are always in the DOM for screen readers (each cell's accessible
 * name carries its phrase); only what's painted changes. No chart library.
 */
import { useState } from "react";
import { DOMAINS, DOMAIN_LABEL, DOMAIN_SHORT, MATRIX_PHRASE, TIERS, TIER_LABEL } from "@/lib/model";

const tierColour = (t: string) => `rgb(var(--c-map-${t}))`;
const tierTint = (t: string, a: number) => `rgb(var(--c-map-${t}) / ${a})`;

// The hero J12 mark's coral: light on the left, full on the right.
const LANE_GRADIENT = "linear-gradient(to right, rgb(var(--c-emerald) / 0.22), rgb(var(--c-emerald)))";
const LANE_GRADIENT_ON = "linear-gradient(to right, rgb(var(--c-emerald) / 0.55), rgb(var(--c-emerald-deep)))";

type Focus = { tier?: string; lane?: string };

export default function J12Journey() {
  const [focus, setFocus] = useState<Focus>({});
  const [lane, setLane] = useState<string>(DOMAINS[0]);
  const [shown, setShown] = useState<Set<string>>(new Set()); // phone: tiers tapped open
  const lit = (d: string, t: string) =>
    !focus.tier && !focus.lane ? false : (!focus.tier || focus.tier === t) && (!focus.lane || focus.lane === d);
  const clear = () => setFocus({});

  return (
    <section aria-labelledby="j12-journey" className="border-b border-ink py-12">
      <p className="figcap">The J12</p>
      <h2 id="j12-journey" className="mt-2 text-[28px] leading-tight sm:text-[32px]">
        Twelve questions. One journey.
      </h2>
      <p className="mt-3 max-w-measure text-[16.5px] leading-relaxed text-ink-2">
        Three questions — do they follow Jesus, join his mission, does their world look different — each asked at four
        depths, from first hearing to helping others. Hover a stage, a lane or a block to see it.
      </p>

      {/* ── desktop / tablet: the grid ─────────────────────────────── */}
      <div className="mt-8 hidden sm:block" onMouseLeave={clear}>
        <div className="grid grid-cols-[8.5rem_repeat(4,1fr)] gap-1.5">
          <div />
          {TIERS.map((t) => (
            <button
              key={t}
              type="button"
              onMouseEnter={() => setFocus({ tier: t })}
              onFocus={() => setFocus({ tier: t })}
              onBlur={clear}
              className="flex min-h-[3.25rem] items-center rounded-lg px-3 py-2 text-left text-[15px] font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ background: tierColour(t) }}
            >
              {TIER_LABEL[t]}
            </button>
          ))}

          {DOMAINS.map((d) => (
            <Lane key={d} d={d} focus={focus} setFocus={setFocus} clear={clear} lit={lit} />
          ))}
        </div>
        <p className="mt-4 max-w-measure text-[13.5px] leading-relaxed text-ink-2">
          Every question in the Index sits in one of these twelve cells. The narrowing from left to right is the journey.
        </p>
      </div>

      {/* ── phone: lanes as tabs, tiers stacked, tap to reveal ──────── */}
      <div className="mt-6 sm:hidden">
        <div role="tablist" aria-label="Lanes" className="flex gap-1.5">
          {DOMAINS.map((d) => (
            <button
              key={d}
              role="tab"
              type="button"
              aria-selected={lane === d}
              onClick={() => { setLane(d); setShown(new Set()); }}
              className="flex-1 rounded-lg px-2 py-2.5 text-[14px] font-semibold"
              style={{ background: lane === d ? LANE_GRADIENT_ON : LANE_GRADIENT, color: lane === d ? "white" : "rgb(var(--c-ink))" }}
            >
              {DOMAIN_SHORT[d]}
            </button>
          ))}
        </div>
        <p className="mt-3 text-[14px] text-ink-2">{DOMAIN_LABEL[lane]} Tap a stage to see it.</p>
        <ol className="mt-3 flex flex-col gap-1.5" role="tabpanel">
          {TIERS.map((t, i) => {
            const open = shown.has(t);
            return (
              <li key={t}>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setShown((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n; })}
                  className="flex w-full items-stretch gap-1.5 text-left"
                >
                  <span className="flex w-[8.5rem] shrink-0 items-center rounded-lg px-3 py-3 text-[14px] font-semibold text-white" style={{ background: tierColour(t) }}>
                    {i + 1}. {TIER_LABEL[t]}
                  </span>
                  <span
                    className="flex flex-1 items-center rounded-lg border px-3 py-3 text-[15px] font-semibold text-ink"
                    style={{ borderColor: open ? tierColour(t) : "rgb(var(--c-rule))", background: tierTint(t, open ? 0.14 : 0.05) }}
                  >
                    <span className={open ? "" : "sr-only"}>{MATRIX_PHRASE[lane]?.[t]}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-[13px] leading-relaxed text-ink-2">Every question in the Index sits in one of these twelve cells.</p>
      </div>
    </section>
  );
}

function Lane({
  d,
  focus,
  setFocus,
  clear,
  lit,
}: {
  d: string;
  focus: Focus;
  setFocus: (f: Focus) => void;
  clear: () => void;
  lit: (d: string, t: string) => boolean;
}) {
  const on = focus.lane === d && !focus.tier;
  return (
    <>
      <button
        type="button"
        onMouseEnter={() => setFocus({ lane: d })}
        onFocus={() => setFocus({ lane: d })}
        onBlur={clear}
        aria-label={`${DOMAIN_SHORT[d]} — ${DOMAIN_LABEL[d]}`}
        className="flex min-h-[4.5rem] items-center rounded-lg px-3 py-3 text-left text-[15px] font-semibold transition-colors motion-reduce:transition-none"
        style={{ background: on ? LANE_GRADIENT_ON : LANE_GRADIENT, color: on ? "white" : "rgb(var(--c-ink))" }}
      >
        {DOMAIN_SHORT[d]}
      </button>
      {TIERS.map((t) => {
        const show = lit(d, t);
        return (
          <button
            key={t}
            type="button"
            onMouseEnter={() => setFocus({ tier: t, lane: d })}
            onFocus={() => setFocus({ tier: t, lane: d })}
            onBlur={clear}
            aria-label={`${DOMAIN_SHORT[d]} · ${TIER_LABEL[t]}: ${MATRIX_PHRASE[d]?.[t]}`}
            className="flex min-h-[4.5rem] items-center rounded-lg border px-3 py-2 text-left transition-colors duration-200 motion-reduce:transition-none"
            style={{
              borderColor: show ? tierColour(t) : "rgb(var(--c-rule))",
              background: show ? tierTint(t, 0.14) : tierTint(t, 0.05),
            }}
          >
            <span
              aria-hidden="true"
              className="text-[15px] font-semibold leading-snug text-ink transition-opacity duration-200 motion-reduce:transition-none"
              style={{ opacity: show ? 1 : 0 }}
            >
              {MATRIX_PHRASE[d]?.[t]}
            </span>
          </button>
        );
      })}
    </>
  );
}
