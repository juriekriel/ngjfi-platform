"use client";

/**
 * The front page's benefits (Oct 2026, rounds 5–6): headings only, in one
 * horizontal row of five across the page (a swipeable strip on a phone),
 * each edged in the coral → violet gradient while hovered, focused or tapped. Hover (or focus, or tap on a phone) a heading and
 * its line of context appears in one reserved slot beneath the row, so the
 * page never jumps. Every description is also inside its button for screen
 * readers, so nothing depends on hovering.
 */
import { useState } from "react";

// The masthead's coral → violet, drawn as a 2px edge: the fill paints the
// padding box, the gradient shows through the transparent border.
const GRADIENT_EDGE: React.CSSProperties = {
  border: "2px solid transparent",
  background:
    "linear-gradient(rgb(var(--c-plate)), rgb(var(--c-plate))) padding-box, linear-gradient(135deg, rgb(var(--c-emerald)), rgb(var(--c-violet))) border-box",
  boxShadow: "0 4px 14px -6px rgb(var(--c-violet) / 0.35)",
};
const PLAIN_EDGE: React.CSSProperties = { border: "2px solid rgb(var(--c-rule-2))", background: "rgb(var(--c-plate))" };

const WORD = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

export default function HeroBenefits({ items, className = "" }: { items: { t: string; d: string }[]; className?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const active = hover ?? pinned;

  return (
    <section aria-labelledby="benefits-heading" className={className}>
      <h2 id="benefits-heading" className="text-[20px] font-bold leading-tight tracking-tight text-ink">
        Why use the Jesus Index?
      </h2>
      <p className="mt-1 text-[15px] text-ink-2">{WORD[items.length] ?? items.length} ways this helps you:</p>

      <ul
        className="-mx-1 mt-3 flex snap-x gap-2 overflow-x-auto px-1 pb-1 md:mx-0 md:grid md:grid-cols-5 md:overflow-visible md:px-0 md:pb-0"
        onMouseLeave={() => setHover(null)}
      >
        {items.map((b, i) => {
          const on = active === i;
          return (
            <li key={b.t} className="shrink-0 snap-start md:shrink">
              <button
                type="button"
                aria-pressed={pinned === i}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                onClick={() => setPinned((p) => (p === i ? null : i))}
                className="flex h-full min-h-[3.25rem] w-full items-center justify-center whitespace-nowrap rounded-2xl px-4 py-2 text-center text-[14px] font-semibold leading-snug text-ink transition-shadow motion-reduce:transition-none md:whitespace-normal"
                style={on ? GRADIENT_EDGE : PLAIN_EDGE}
              >
                {b.t}
                <span className="sr-only"> — {b.d}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <p aria-hidden className="mt-3 min-h-[2.75rem] border-l-2 border-emerald pl-3 text-[15px] leading-snug text-ink-2">
        {active !== null ? (
          <>
            <b className="text-ink">{items[active].t}:</b> {items[active].d}.
          </>
        ) : (
          <span className="text-muted">
            <span className="hidden sm:inline">Hover</span>
            <span className="sm:hidden">Tap</span> a heading to see what it means.
          </span>
        )}
      </p>
    </section>
  );
}
