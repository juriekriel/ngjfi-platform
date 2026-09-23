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

/* ── a tile ───────────────────────────────────────────────────────────── */

/**
 * One entry point on a console's tile row. The Administrator and Collab
 * consoles use the same four-across grid, so the tile is one implementation
 * for the same reason the bands are.
 *
 * Three shapes, picked by what is passed:
 *   href     → a link out (e.g. Collab Intelligence's public view)
 *   onClick  → a switch that swaps which band renders below the row
 *   neither  → a tile that carries its own content (e.g. the admin worklist,
 *              whose Approve/Decline buttons cannot live inside a <button>)
 */
export function Tile({
  letter,
  figure,
  title,
  gloss,
  selected = false,
  onClick,
  href,
  className = "",
  children,
}: {
  letter: string;
  figure?: string;
  title: string;
  gloss?: string;
  selected?: boolean;
  onClick?: () => void;
  href?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const shell = `flex flex-col rounded-xl border p-4 text-left shadow-sm ${
    selected ? "border-ink bg-ink text-paper" : "border-rule-2 bg-plate text-ink hover:border-ink"
  } ${className}`;
  const inner = (
    <>
      <p className={`tabular text-[11px] ${selected ? "text-paper/70" : "text-muted"}`}>
        {letter}
        {figure ? ` · ${figure}` : ""}
      </p>
      <h3 className="mt-1 text-[16px] font-semibold">{title}</h3>
      {gloss && (
        <p className={`mt-1 text-[13px] leading-snug ${selected ? "text-paper/80" : "text-ink-2"}`}>{gloss}</p>
      )}
      {children && <div className="mt-3 flex-1">{children}</div>}
    </>
  );

  if (href)
    return (
      <Link href={href} className={`${shell} no-underline`}>
        {inner}
      </Link>
    );
  if (onClick)
    return (
      <button type="button" onClick={onClick} aria-pressed={selected} className={shell}>
        {inner}
      </button>
    );
  return <div className={shell}>{inner}</div>;
}

/**
 * A short roster inside a tile: the first few names, then "+N more". The tile
 * is a preview; the band it opens carries the full list.
 */
export function TileList({ names, max = 4, selected = false }: { names: string[]; max?: number; selected?: boolean }) {
  if (!names.length) return null;
  const shown = names.slice(0, max);
  return (
    <ul className={`space-y-0.5 text-[12.5px] leading-snug ${selected ? "text-paper/90" : "text-ink"}`}>
      {shown.map((n) => (
        <li key={n} className="truncate">
          {n}
        </li>
      ))}
      {names.length > max && (
        <li className={selected ? "text-paper/70" : "text-muted"}>+{names.length - max} more</li>
      )}
    </ul>
  );
}

/* ── the house, in figures ────────────────────────────────────────────── */

/**
 * The three settings that change the meaning of every number — the active
 * instrument, the two critical-mass gates, and the global-view publish switch.
 * The Administrator's Console tile and the Collab's Development tile show the
 * same four lines, so it is one component: if they ever disagreed, one of the
 * two consoles would be describing a platform that does not exist.
 */
export type HouseSettings = {
  instrument: { version: string; status: string; items: number } | null;
  gate: number;
  country_gate: number;
  global_view_published: boolean;
};

/** The tile-sized preview. */
export function HouseFigures({ house, selected = false }: { house: HouseSettings | null; selected?: boolean }) {
  const dim = selected ? "text-paper/70" : "text-muted";
  const Line = ({ k, v, warn = false }: { k: string; v: string; warn?: boolean }) => (
    <li className="flex items-baseline justify-between gap-2">
      <span className={dim}>{k}</span>
      <span className={`tabular text-right ${warn ? "text-vermillion" : ""}`}>{v}</span>
    </li>
  );
  if (!house) return <p className={`text-[12.5px] ${dim}`}>Loading…</p>;
  return (
    <ul className="space-y-0.5 text-[12.5px] leading-snug">
      <Line
        k="Instrument"
        v={house.instrument ? `${house.instrument.version} · ${house.instrument.items} items` : "not loaded"}
        warn={!house.instrument}
      />
      <Line k="Gate · org / region" v={house.gate.toLocaleString()} />
      <Line k="Gate · country" v={house.country_gate.toLocaleString()} />
      <Line k="Global view" v={house.global_view_published ? "published" : "not published"} warn={house.global_view_published} />
    </ul>
  );
}

/** The band-sized version — the same four facts, with their status marks. */
export function HouseRows({ house }: { house: HouseSettings | null }) {
  return (
    <Rows>
      <Row
        label="Instrument"
        meta={house?.instrument ? `${house.instrument.version} · ${house.instrument.items} items · ${house.instrument.status}` : "not loaded"}
        tone={house?.instrument ? "good" : "warn"}
      />
      <Row label="Critical-mass gate (org / region)" meta={`${(house?.gate ?? 400).toLocaleString()} completions`} />
      <Row label="Critical-mass gate (country)" meta={`${(house?.country_gate ?? 2000).toLocaleString()} completions`} />
      <Row
        label="Global view published"
        meta={house?.global_view_published ? "yes" : "no"}
        tone={house?.global_view_published ? "warn" : "plain"}
      />
    </Rows>
  );
}
