"use client";

/**
 * The front page's benefits (Oct 2026, round 5): headings only, sitting under
 * the hero's two buttons. Hover (or focus, or tap on a phone) a heading and
 * its line of context appears in one reserved slot beneath the row, so the
 * page never jumps. Every description is also inside its button for screen
 * readers, so nothing depends on hovering.
 */
import { useState } from "react";

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

      <ul className="mt-3 flex flex-wrap gap-2" onMouseLeave={() => setHover(null)}>
        {items.map((b, i) => {
          const on = active === i;
          return (
            <li key={b.t}>
              <button
                type="button"
                aria-pressed={pinned === i}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                onClick={() => setPinned((p) => (p === i ? null : i))}
                className={`rounded-full border px-3.5 py-1.5 text-[14px] font-semibold transition-colors motion-reduce:transition-none ${
                  on ? "border-emerald bg-emerald text-plate" : "border-rule-2 bg-plate text-ink hover:border-emerald"
                }`}
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
