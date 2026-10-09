"use client";

/**
 * The J12 journey — the model, not results — for the front page.
 *
 * Four tiers flow left to right as joined chevrons (Exposure → Response →
 * Formation → Multiplication), each in its tier colour (the --c-map-* hues
 * the map and matrix already use). Three lanes run through them: Follow,
 * Mission, World. At rest the twelve cells are quiet; hover or focus a TIER
 * and its column lights up, a LANE and its row lights up across all four
 * tiers (one journey), a CELL and its phrase plus the tier's question. On a
 * phone there is no hover: the tiers stack top-down and the lanes are tabs.
 *
 * Every word comes from src/lib/model.ts (TIER_LABEL, TIER_GLOSS,
 * DOMAIN_SHORT, DOMAIN_LABEL, MATRIX_PHRASE) — rename a cell there and this
 * follows. All phrases are always in the DOM for screen readers; only their
 * visual emphasis changes. No chart library; CSS grid + clip-path.
 */
import { useState } from "react";
import { DOMAINS, DOMAIN_LABEL, DOMAIN_SHORT, MATRIX_PHRASE, TIERS, TIER_GLOSS, TIER_LABEL } from "@/lib/model";

const tierColour = (t: string) => `rgb(var(--c-map-${t}))`;
const tierTint = (t: string, a: number) => `rgb(var(--c-map-${t}) / ${a})`;

// A chevron: flat left edge on the first tier, notched on the others.
const CHEVRON_FIRST = "polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%)";
const CHEVRON = "polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%, 14px 50%)";

type Focus = { tier?: string; lane?: string };

export default function J12Journey() {
  const [focus, setFocus] = useState<Focus>({});
  const [lane, setLane] = useState<string>(DOMAINS[0]);
  const lit = (d: string, t: string) =>
    (!focus.tier && !focus.lane) ? false : (!focus.tier || focus.tier === t) && (!focus.lane || focus.lane === d);
  const clear = () => setFocus({});

  return (
    <section aria-labelledby="j12-journey" className="border-b border-ink py-12">
      <p className="figcap">The J12</p>
      <h2 id="j12-journey" className="mt-2 text-[28px] leading-tight sm:text-[32px]">
        Twelve questions. One journey.
      </h2>
      <p className="mt-3 max-w-measure text-[16.5px] leading-relaxed text-ink-2">
        Three questions — do they follow Jesus, join his mission, does their world look different — each asked at four
        depths, from first hearing to helping others. Hover a stage or a lane to see it.
      </p>

      {/* ── desktop / tablet: the grid ─────────────────────────────── */}
      <div className="mt-8 hidden sm:block" onMouseLeave={clear}>
        <div className="grid grid-cols-[8.5rem_repeat(4,1fr)] gap-1.5">
          <div />
          {TIERS.map((t, i) => (
            <button
              key={t}
              type="button"
              onMouseEnter={() => setFocus({ tier: t })}
              onFocus={() => setFocus({ tier: t })}
              onBlur={clear}
              aria-label={`${TIER_LABEL[t]} — ${TIER_GLOSS[t]}`}
              className="px-5 py-3 text-left text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ background: tierColour(t), clipPath: i === 0 ? CHEVRON_FIRST : CHEVRON, paddingLeft: i === 0 ? 14 : 24 }}
            >
              <span className="block text-[15px] font-semibold leading-tight">{TIER_LABEL[t]}</span>
              <span className="block text-[12.5px] opacity-90">{TIER_GLOSS[t]}</span>
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

      {/* ── phone: lanes as tabs, tiers stacked ─────────────────────── */}
      <div className="mt-6 sm:hidden">
        <div role="tablist" aria-label="Lanes" className="flex gap-1.5">
          {DOMAINS.map((d) => (
            <button
              key={d}
              role="tab"
              type="button"
              aria-selected={lane === d}
              onClick={() => setLane(d)}
              className={`flex-1 rounded-lg border px-2 py-2 text-[14px] font-semibold ${
                lane === d ? "border-ink bg-ink text-paper" : "border-rule-2 text-ink"
              }`}
            >
              {DOMAIN_SHORT[d]}
            </button>
          ))}
        </div>
        <p className="mt-3 text-[14px] text-ink-2">{DOMAIN_LABEL[lane]}</p>
        <ol className="mt-3 flex flex-col gap-1.5" role="tabpanel">
          {TIERS.map((t, i) => (
            <li key={t} className="flex items-stretch overflow-hidden rounded-lg border border-rule">
              <span className="flex w-[7.5rem] shrink-0 flex-col justify-center px-3 py-2.5 text-white" style={{ background: tierColour(t) }}>
                <span className="text-[13.5px] font-semibold leading-tight">{i + 1}. {TIER_LABEL[t]}</span>
                <span className="text-[11.5px] opacity-90">{TIER_GLOSS[t]}</span>
              </span>
              <span className="flex items-center px-3 py-2.5 text-[15px] text-ink" style={{ background: tierTint(t, 0.08) }}>
                {MATRIX_PHRASE[lane]?.[t]}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
          Every question in the Index sits in one of these twelve cells.
        </p>
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
  const quiet = !focus.tier && !focus.lane;
  return (
    <>
      <button
        type="button"
        onMouseEnter={() => setFocus({ lane: d })}
        onFocus={() => setFocus({ lane: d })}
        onBlur={clear}
        aria-label={DOMAIN_LABEL[d]}
        className={`rounded-lg px-3 py-3 text-left transition-colors motion-reduce:transition-none ${
          focus.lane === d ? "bg-ink text-paper" : "bg-paper-deep text-ink"
        }`}
      >
        <span className="block text-[15px] font-semibold">{DOMAIN_SHORT[d]}</span>
        <span className="block text-[11.5px] leading-snug opacity-80">{DOMAIN_LABEL[d]}</span>
      </button>
      {TIERS.map((t) => {
        const on = lit(d, t);
        return (
          <button
            key={t}
            type="button"
            onMouseEnter={() => setFocus({ tier: t, lane: d })}
            onFocus={() => setFocus({ tier: t, lane: d })}
            onBlur={clear}
            aria-label={`${DOMAIN_SHORT[d]} · ${TIER_LABEL[t]}: ${MATRIX_PHRASE[d]?.[t]}`}
            className="flex min-h-[4.5rem] flex-col justify-center rounded-lg border px-3 py-2 text-left transition-all duration-200 motion-reduce:transition-none"
            style={{
              borderColor: on ? tierColour(t) : "rgb(var(--c-rule))",
              background: on ? tierTint(t, 0.14) : tierTint(t, 0.05),
            }}
          >
            <span
              className="text-[15px] font-semibold leading-snug text-ink transition-opacity duration-200 motion-reduce:transition-none"
              style={{ opacity: on ? 1 : quiet ? 0.5 : 0.22 }}
            >
              {MATRIX_PHRASE[d]?.[t]}
            </span>
            {on && focus.tier && focus.lane && (
              <span className="mt-0.5 text-[12px] text-ink-2">{TIER_LABEL[t]} — {TIER_GLOSS[t]}</span>
            )}
          </button>
        );
      })}
    </>
  );
}
