/**
 * Live or demo — said the same way everywhere a number appears on a public
 * page (Oct 2026: "a polished look, but clarity on real data").
 *
 *   <DataLabel kind="live" n={…} />  a green dot: real answers, with their n
 *   <DataLabel kind="demo" />        a hatched coral tag: invented figures
 *   <DemoFrame>…</DemoFrame>         a dashed coral frame with a corner tab, for
 *                                    a whole block of invented figures, so a
 *                                    screenshot of any part of it still says so
 *
 * The wording lives here once. tests/round4.test.ts checks every public
 * surface that can show demo figures renders one of these.
 */

export const DEMO_WORDS = "These are not real ministries, churches, or organisations. This is presented for illustrative purposes only.";

export function DataLabel({ kind, n, className = "" }: { kind: "live" | "demo"; n?: number | null; className?: string }) {
  if (kind === "demo")
    return (
      <span
        className={`inline-flex items-center gap-2 rounded-md border border-emerald px-2 py-1 text-[12.5px] font-semibold text-emerald-deeper ${className}`}
        style={{ backgroundImage: "repeating-linear-gradient(135deg, rgb(var(--c-emerald) / 0.10) 0 6px, transparent 6px 12px)" }}
      >
        <span aria-hidden className="tabular rounded-sm bg-emerald px-1 text-[10px] leading-4 text-plate">DEMO</span>
        {DEMO_WORDS}
      </span>
    );
  return (
    <span className={`inline-flex items-center gap-2 rounded-md border border-rule bg-plate px-2 py-1 text-[12.5px] font-semibold text-ink ${className}`}>
      <span aria-hidden className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full rounded-full bg-green opacity-40 motion-safe:animate-ping" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green" />
      </span>
      Live data
      {typeof n === "number" && <span className="tabular font-normal text-ink-2">· n = {n.toLocaleString("en")}</span>}
    </span>
  );
}

export function DemoFrame({ children, className = "", label = "Demo data", suffix = true }: { children: React.ReactNode; className?: string; label?: string; suffix?: boolean }) {
  return (
    <div className={`relative rounded-2xl border-2 border-dashed border-emerald/70 p-4 pt-7 sm:p-6 sm:pt-8 ${className}`}>
      <span
        className="tabular absolute -top-3 left-4 rounded-md bg-emerald px-2 py-0.5 text-[11px] uppercase tracking-[0.08em] text-plate"
        title={DEMO_WORDS}
      >
        {suffix ? `${label} · invented` : label}
      </span>
      {children}
    </div>
  );
}
