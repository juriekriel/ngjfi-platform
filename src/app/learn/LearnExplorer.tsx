"use client";

import { useState } from "react";
import { ERAS } from "@/data/history";

/**
 * The record, explorable.
 *
 * An era rail plus expandable beats. Deliberately not an animated timeline —
 * the almanac language rules out motion, and a reader who wants the whole story
 * can open everything at once and read it as one continuous document, which a
 * carousel would prevent.
 */
export default function LearnExplorer() {
  const [open, setOpen] = useState<string[]>([ERAS[0].id]);
  const allOpen = open.length === ERAS.length;

  const toggle = (id: string) =>
    setOpen((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));

  return (
    <section className="py-10">
      {/* rail */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b border-rule pb-3">
        <p className="figcap mr-1">Six eras</p>
        {ERAS.map((e) => (
          <a
            key={e.id}
            href={`#era-${e.id}`}
            onClick={() => setOpen((o) => (o.includes(e.id) ? o : [...o, e.id]))}
            className="tabular text-[10px] uppercase tracking-[0.13em] text-ink-2 no-underline hover:text-ink"
          >
            <span className="text-muted">{e.ordinal}</span> {e.title.split(" — ")[0]}
          </a>
        ))}
        <button
          type="button"
          onClick={() => setOpen(allOpen ? [] : ERAS.map((e) => e.id))}
          className="tabular ml-auto border border-ink px-2 py-1 text-[10px] uppercase tracking-[0.13em] text-ink hover:bg-ink hover:text-paper"
        >
          {allOpen ? "Collapse all" : "Read it all"}
        </button>
      </div>

      <div className="mt-2">
        {ERAS.map((era) => {
          const isOpen = open.includes(era.id);
          return (
            <article key={era.id} id={`era-${era.id}`} className="scroll-mt-4 border-b border-rule">
              <button
                type="button"
                onClick={() => toggle(era.id)}
                aria-expanded={isOpen}
                className="grid w-full grid-cols-[2.2rem_1fr_1.5rem] items-baseline gap-3 py-5 text-left md:grid-cols-[3rem_1fr_9rem_1.5rem] md:gap-6"
              >
                <span className="tabular text-[15px] text-muted">{era.ordinal}</span>
                <span>
                  <span className="block font-serif text-[22px] leading-tight text-ink">
                    {era.title}
                  </span>
                  <span className="mt-1 block font-serif text-[15px] leading-snug text-ink-2 md:hidden">
                    {era.window}
                  </span>
                </span>
                <span className="tabular hidden text-[10px] uppercase tracking-[0.13em] text-muted md:block">
                  {era.window}
                </span>
                <span className="tabular text-right text-[15px] text-muted">{isOpen ? "−" : "+"}</span>
              </button>

              {isOpen && (
                <div className="grid gap-8 pb-9 md:grid-cols-[1fr_1.7fr] md:gap-12">
                  <div className="md:pl-[4.5rem]">
                    <p className="max-w-measure font-serif text-[17px] leading-relaxed">
                      {era.standfirst}
                    </p>
                    {era.marker && (
                      <div className="mt-6 border-t-2 border-ink pt-2">
                        <p className="tabular text-[38px] leading-none text-ink">
                          {era.marker.figure}
                        </p>
                        <p className="figcap mt-2 leading-relaxed">{era.marker.caption}</p>
                      </div>
                    )}
                  </div>

                  <ol className="space-y-6">
                    {era.beats.map((b, i) => (
                      <li key={b.title} className="border-t border-rule pt-3">
                        <div className="flex items-baseline gap-3">
                          <span className="tabular text-[10px] tracking-[0.16em] text-muted">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <span className="figcap">{b.when}</span>
                        </div>
                        <h4 className="mt-1.5 text-[18px] leading-snug">{b.title}</h4>
                        <p className="mt-2 text-[15.5px] leading-relaxed text-ink-2">{b.body}</p>
                        {b.consequence && (
                          <p className="mt-3 border-l-2 border-emerald pl-3 text-[14.5px] leading-relaxed">
                            <span className="tabular mr-2 text-[10px] uppercase tracking-[0.14em] text-emerald">
                              What changed
                            </span>
                            {b.consequence}
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
