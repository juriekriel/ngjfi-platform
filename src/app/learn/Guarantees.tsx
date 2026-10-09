"use client";

/**
 * The Three guarantees on "What is the JFINDX?" — the short line always
 * shows; hover (or tap, or keyboard focus) opens the detail beneath it, so
 * nothing is hover-only. Same pattern as "Before you ask" on the join page.
 */
import { useState } from "react";
import { GradientRule } from "@/components/site/Chrome";

export type Guarantee = { n: string; h: string; p: string; more: string[] };

export default function Guarantees({ items }: { items: Guarantee[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="mt-6 grid gap-8 sm:grid-cols-3">
      {items.map((c) => {
        const shown = open === c.n;
        const id = `guarantee-${c.n}`;
        return (
          <div key={c.n} className="group">
            <GradientRule />
            <button
              type="button"
              aria-expanded={shown}
              aria-controls={id}
              onClick={() => setOpen(shown ? null : c.n)}
              className="mt-3 flex w-full items-baseline gap-2.5 text-left text-[19px] font-bold leading-snug text-ink"
            >
              <span className="tabular text-[12px] font-semibold tracking-[0.12em] text-emerald-deep">{c.n}</span>
              <span className="flex-1">{c.h}</span>
              <span aria-hidden className={`text-[16px] text-emerald-deep transition-transform group-hover:rotate-45 group-focus-within:rotate-45 ${shown ? "rotate-45" : ""}`}>+</span>
            </button>
            <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{c.p}</p>
            <div
              id={id}
              className={`grid transition-all duration-200 group-hover:mt-3 group-hover:grid-rows-[1fr] group-hover:opacity-100 group-focus-within:mt-3 group-focus-within:grid-rows-[1fr] group-focus-within:opacity-100 ${
                shown ? "mt-3 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
              }`}
            >
              <ul className="overflow-hidden border-l-2 border-emerald pl-3 text-[14px] leading-relaxed text-ink-2">
                {c.more.map((m) => <li key={m} className="mt-1 first:mt-0">{m}</li>)}
              </ul>
            </div>
          </div>
        );
      })}
    </div>
  );
}
