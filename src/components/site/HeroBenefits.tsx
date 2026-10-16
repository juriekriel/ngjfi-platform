"use client";

/**
 * The front page's benefits (Oct 2026, rounds 5–7): headings only, stacked
 * vertically under the hero's two buttons, so the left column ends level with
 * the See a Demo card beside it.
 *
 * Hover, focus or tap a row: it takes the coral → violet gradient edge and its
 * line of context fades in on the right of the SAME row — rows never change
 * height, so the column stays aligned with the card. On a phone (one column,
 * nothing to align with) a tapped row opens its line underneath instead.
 * Every description is also inside its button for screen readers.
 */
import { useState } from "react";
import { GRADIENT_EDGE, PLAIN_EDGE } from "@/components/site/Chrome";

const WORD = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

export default function HeroBenefits({ items, className = "" }: { items: { t: string; d: string }[]; className?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const active = hover ?? pinned;

  return (
    <section aria-labelledby="benefits-heading" className={`flex flex-col ${className}`}>
      <h2 id="benefits-heading" className="text-[20px] font-bold leading-tight tracking-tight text-ink">
        Why use the Jesus Index?
      </h2>
      <p className="mt-1 text-[15px] text-ink-2">{WORD[items.length] ?? items.length} ways this serves you:</p>

      <ul className="mt-3 grid flex-1 auto-rows-fr gap-2" onMouseLeave={() => setHover(null)}>
        {items.map((b, i) => {
          const on = active === i;
          return (
            <li key={b.t} className="flex">
              <button
                type="button"
                aria-pressed={pinned === i}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                onClick={() => setPinned((p) => (p === i ? null : i))}
                className="flex min-h-[3rem] w-full flex-col justify-center rounded-xl px-4 py-2 text-left transition-shadow motion-reduce:transition-none md:flex-row md:items-center md:justify-start md:gap-4"
                style={on ? GRADIENT_EDGE : PLAIN_EDGE}
              >
                <span className="text-[14.5px] font-semibold leading-snug text-ink md:w-[13.5rem] md:shrink-0">{b.t}</span>
                <span
                  aria-hidden
                  className={`text-[13.5px] leading-snug text-ink-2 transition-opacity duration-150 motion-reduce:transition-none md:block ${
                    on ? "mt-1 block opacity-100 md:mt-0" : "hidden opacity-0"
                  }`}
                >
                  {b.d}
                </span>
                <span className="sr-only"> — {b.d}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
