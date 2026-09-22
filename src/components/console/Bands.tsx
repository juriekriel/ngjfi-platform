"use client";

import Link from "next/link";

/**
 * The console's furniture — shared by all four tiers.
 *
 * The wireframe's argument was that the four consoles are the SAME console at
 * different scopes: five bands, same order, same position for every action, so
 * someone who learns the organisation console has already learned the network
 * one. That only stays true if the bands are literally one implementation.
 * Fork these components per tier and the promise quietly stops being kept.
 */

/* ── a band ───────────────────────────────────────────────────────────── */

export function Band({
  letter,
  title,
  gloss,
  figure,
  children,
}: {
  letter: string;
  title: string;
  gloss?: string;
  figure?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-l-2 border-ink pl-4 sm:pl-5">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-[21px] leading-tight">
          <span className="tabular mr-2 text-[12px] text-muted">{letter}</span>
          {title}
        </h2>
        {figure && <span className="figcap">{figure}</span>}
      </header>
      {gloss && <p className="margin-note mt-1.5 max-w-measure">{gloss}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/* ── the worklist ─────────────────────────────────────────────────────── */

export type WorkItem = {
  urgency?: string;
  label: string;
  meta?: string;
  action?: string;
  href?: string;
};

/**
 * Band A. The only band allowed to be empty — and when it is, it says so in
 * words rather than showing a zero, because "nothing pending" and "nothing
 * loaded" must never look the same.
 */
export function Worklist({ items, empty }: { items: WorkItem[]; empty: string }) {
  if (!items.length)
    return <p className="text-[15.5px] leading-relaxed text-ink-2">{empty}</p>;

  return (
    <ul className="divide-y divide-rule rounded-xl border border-rule bg-plate px-4 shadow-sm sm:px-5">
      {items.map((it, i) => (
        <li
          key={`${it.label}-${i}`}
          className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3.5"
        >
          <span className="min-w-0 text-[15.5px] leading-snug">
            {it.urgency === "high" && <span className="mr-2 text-vermillion">▲</span>}
            {it.label}
          </span>
          <span className="flex shrink-0 items-baseline gap-3">
            {it.meta && <span className="tabular text-[12px] text-ink-2">{it.meta}</span>}
            {it.action &&
              (it.href ? (
                <Link
                  href={it.href}
                  className="rounded-lg border border-rule-2 px-3 py-1.5 text-[13px] font-semibold text-ink no-underline hover:border-ink"
                >
                  {it.action}
                </Link>
              ) : (
                <span className="rounded-lg border border-rule-2 px-3 py-1.5 text-[13px] font-semibold text-muted">
                  {it.action}
                </span>
              ))}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ── a row of figures ─────────────────────────────────────────────────── */

export function Row({
  label,
  meta,
  tone = "plain",
  children,
}: {
  label: React.ReactNode;
  meta?: string;
  tone?: "plain" | "good" | "warn";
  children?: React.ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
      <span className="min-w-0 text-[15px] leading-snug">
        {tone === "good" && <span className="mr-2 text-emerald">✓</span>}
        {tone === "warn" && <span className="mr-2 text-vermillion">▲</span>}
        {label}
      </span>
      <span className="flex shrink-0 items-baseline gap-3">
        {meta && <span className="tabular text-[12px] text-ink-2">{meta}</span>}
        {children}
      </span>
    </li>
  );
}

export function Rows({ children }: { children: React.ReactNode }) {
  return (
    <ul className="divide-y divide-rule rounded-xl border border-rule bg-plate px-4 shadow-sm sm:px-5">
      {children}
    </ul>
  );
}

/* ── controls ─────────────────────────────────────────────────────────── */

export function Action({
  onClick,
  primary = false,
  disabled = false,
  children,
}: {
  onClick?: () => void;
  primary?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-4 py-2.5 text-[14px] font-semibold disabled:opacity-40 ${
        primary
          ? "bg-emerald text-plate hover:bg-emerald-deep"
          : "border border-rule-2 text-ink hover:border-ink"
      }`}
    >
      {children}
    </button>
  );
}

/** A copyable link. Copying is the single most-used action in the whole console. */
export function LinkRow({
  url,
  label,
  note,
}: {
  url: string;
  label: string;
  note?: string;
}) {
  return (
    <li className="py-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-[15px] font-semibold">{label}</span>
        <button
          onClick={() => navigator.clipboard?.writeText(url)}
          className="rounded-lg border border-rule-2 px-3 py-1.5 text-[13px] font-semibold text-ink-2 hover:border-ink hover:text-ink"
        >
          Copy
        </button>
      </div>
      <p className="tabular mt-1 break-all text-[12.5px] text-ink-2">{url}</p>
      {note && <p className="margin-note mt-1">{note}</p>}
    </li>
  );
}

/** A figure that has no data yet — says why, rather than showing a zero. */
export function Awaiting({ what, why }: { what: string; why: string }) {
  return (
    <div className="rounded-xl border border-rule bg-plate px-4 py-5 shadow-sm">
      <p className="figcap">{what}</p>
      <p className="mt-1.5 max-w-measure text-[14.5px] leading-relaxed text-ink-2">{why}</p>
    </div>
  );
}

/** An error the user can act on, not a stack trace. */
export function Trouble({ message }: { message: string }) {
  return (
    <p className="border-l-2 border-vermillion py-1 pl-3 text-[15px] leading-relaxed text-vermillion">
      {message}
    </p>
  );
}
