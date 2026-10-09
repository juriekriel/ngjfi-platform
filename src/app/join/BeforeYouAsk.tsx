"use client";

/**
 * "Before you ask" — questions only, each answer appearing on hover. Hover
 * isn't the only way in: the question is a button (tap on a phone, Enter or
 * Space on a keyboard) and keyboard focus reveals it too, so nothing is
 * hidden from someone who can't hover.
 */
import { useState } from "react";

export default function BeforeYouAsk({ items }: { items: [string, string][] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <dl className="mt-6 grid gap-x-10 gap-y-3 md:grid-cols-2">
      {items.map(([q, a], i) => {
        const shown = open === q;
        const id = `faq-${i}`;
        return (
          <div key={q} className="group rounded-xl border border-rule px-4 py-3 transition-colors hover:border-emerald focus-within:border-emerald">
            <dt>
              <button
                type="button"
                aria-expanded={shown}
                aria-controls={id}
                onClick={() => setOpen(shown ? null : q)}
                className="flex w-full items-center justify-between gap-3 text-left text-[17px] font-semibold leading-snug text-ink"
              >
                {q}
                <span aria-hidden className={`text-emerald-deep transition-transform group-hover:rotate-45 ${shown ? "rotate-45" : ""}`}>+</span>
              </button>
            </dt>
            <dd
              id={id}
              className={`grid text-[15px] leading-relaxed text-ink-2 transition-all duration-200 group-hover:mt-1.5 group-hover:grid-rows-[1fr] group-hover:opacity-100 group-focus-within:mt-1.5 group-focus-within:grid-rows-[1fr] group-focus-within:opacity-100 ${
                shown ? "mt-1.5 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
              }`}
            >
              <span className="overflow-hidden">{a}</span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
