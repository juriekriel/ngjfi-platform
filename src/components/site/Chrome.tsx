import Link from "next/link";

import { EMERALD, INK, MUTED } from "@/lib/model";

/**
 * The masthead. Brand Proof № 3: the header carries the short mark (gradient
 * chip + "JFINDX") the same way on every page, signed-out or signed-in — this
 * is a control surface, not the hero. The full serif "The Jesus Index"
 * lockup is reserved for page heroes (see the homepage), never repeated here.
 * Nav is plain Inter Tight, same voice as buttons and body copy — the old
 * "every nav link is tracked, uppercase, tabular mono" treatment was a rule
 * that belonged to the almanac and never got removed when the palette did.
 */
export function Masthead({ edition }: { edition?: string }) {
  return (
    <header className="border-b border-rule">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-3.5 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5 no-underline">
          <RisingMark className="h-7 w-7 shrink-0" />
          <span className="text-[18px] font-bold tracking-tight text-ink">JFINDX</span>
        </Link>
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-1.5">
          <NavLink href="/learn">What is the JFINDX?</NavLink>
          <NavLink href="/tour">How does it work?</NavLink>
          <NavLink href="/history">How did we get here?</NavLink>
          <NavLink href="/intelligence">A Global Picture</NavLink>
          <Link
            href="/access"
            className="rounded-lg bg-gradient-to-r from-violet to-violet-deep px-4 py-2 text-[14px] font-semibold text-plate no-underline hover:opacity-90"
          >
            Sign in to Your Organisation
          </Link>
          <Link
            href="/join"
            className="rounded-lg bg-gradient-to-r from-emerald to-emerald-deep px-4 py-2 text-[14px] font-semibold text-plate no-underline hover:opacity-90"
          >
            Join the JFINDX
          </Link>
        </nav>
      </div>
      {edition && (
        <div className="border-t border-rule bg-paper-deep">
          <div className="mx-auto max-w-6xl px-5 py-1.5 sm:px-8">
            <p className="text-[12px] text-muted">{edition}</p>
          </div>
        </div>
      )}
    </header>
  );
}

/**
 * The colophon — CLAUDE.md's design system lists one among the things
 * Brand Proof № 3 "still keeps" from the almanac, but nothing had actually
 * built it yet. Deliberately spare: a hairline rule, the mark, and one line
 * — not a sitemap. Exported so any page can carry it, not just the homepage.
 */
export function Footer() {
  return (
    <footer className="border-t border-rule">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2.5 px-5 py-6 sm:px-8">
        <RisingMark className="h-5 w-5 shrink-0" />
        <p className="text-[13px] text-ink-2">
          Built by the Next Gen Global Collab, to see everyone in the next generation follow Jesus.
        </p>
      </div>
    </footer>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-[14.5px] font-medium text-ink-2 no-underline hover:text-ink">
      {children}
    </Link>
  );
}

/**
 * The rising mark — the masthead's badge: the same coral → violet gradient
 * as the mark's original flat gradient chip, now with the rising-dashed-line-
 * to-cross gesture drawn inside it in white, so the chip stops being an empty
 * swatch. Same gesture as RisingJ/RisingRule below, redrawn as a dashed line
 * (a respondent's steps, not a single continuous stroke) inside a full
 * circular badge rather than a letterform or a standalone rule.
 *
 * The source of truth for this exact geometry is public/icon-mark.svg, which
 * is also what the PWA icon set (src/app/icon.png, apple-icon.png,
 * public/icons/*.png — see manifest.ts) is rasterised from. Keep the two in
 * sync if this ever changes: this one needs to stay inline SVG (it sits next
 * to live text, not a static asset), the other needs to stay a flat file
 * (favicons and app icons can't be React components).
 */
export function RisingMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="risingMarkGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FF7A47" />
          <stop offset="100%" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      <circle cx="60" cy="60" r="58" fill="url(#risingMarkGradient)" />
      <path
        d="M 15 89 L 65 89 L 92 55"
        fill="none"
        stroke="#ffffff"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray="12 10"
      />
      <g fill="#ffffff">
        <rect x="89.25" y="31" width="4.5" height="28" rx="2.25" />
        <rect x="77" y="43.25" width="28" height="4.5" rx="2.25" />
      </g>
    </svg>
  );
}

/**
 * The Rising J — a J that is also a J-curve, ending in a cross that is also a
 * data point. Down before up. One stroke, one colour, no gradient.
 */
export function RisingJ({
  className = "h-8 w-8",
  stroke = INK,
  cross = EMERALD,
}: {
  className?: string;
  stroke?: string;
  cross?: string;
}) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      {/* One continuous stroke: down before up. Weight and round caps are the
          mark — thinning either turns it into a letterform and loses the curve. */}
      <path
        d="M 22 58 C 24 74, 32 85, 46 84 C 62 83, 71 66, 73 26"
        fill="none"
        stroke={stroke}
        strokeWidth="13"
        strokeLinecap="round"
      />
      {/* The terminal: a cross that is also a data point. */}
      <g fill={cross}>
        <rect x="70" y="4" width="6" height="22" rx="2" />
        <rect x="62" y="12" width="22" height="6" rx="2" />
      </g>
    </svg>
  );
}

/**
 * FIG. 06 — the rising rule. The icon's gesture stretched to masthead scale:
 * a hairline that runs flat, then lifts to the same terminal. Same story, no
 * redraw. Used under the nameplate where a 100 × 100 icon would be too loud.
 */
export function RisingRule({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 560 30" className={className} aria-hidden="true" preserveAspectRatio="none">
      <path d="M 0 24 L 402 24 L 486 4" fill="none" stroke={INK} strokeWidth="1.5" />
      <g fill={EMERALD}>
        <rect x="490" y="0" width="5" height="19" rx="1.5" />
        <rect x="483" y="7" width="19" height="5" rx="1.5" />
      </g>
    </svg>
  );
}

/** A numbered door on the landing page. Real anchors, keyboard-reachable in order. */
export function Door({
  n,
  kicker,
  title,
  body,
  cta,
  href,
  note,
  accent = false,
}: {
  n: string;
  kicker: string;
  title: string;
  body: string;
  cta: string;
  href: string;
  note: string;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col border-t-2 border-ink pt-3 no-underline"
      style={accent ? { borderTopColor: EMERALD } : undefined}
    >
      <div className="flex items-baseline gap-2">
        <span className="tabular text-[11px] tracking-[0.16em]" style={{ color: accent ? EMERALD : MUTED }}>
          {n}
        </span>
        <span className="figcap">{kicker}</span>
      </div>
      <h3 className="mt-2 text-[21px] leading-[1.2] text-ink">{title}</h3>
      <p className="mt-2 flex-1 text-[15px] leading-relaxed text-ink-2">{body}</p>
      <p
        className="mt-4 text-[14px] font-semibold group-hover:underline"
        style={{ color: accent ? EMERALD : INK }}
      >
        {cta} →
      </p>
      <p className="margin-note mt-2 text-muted">{note}</p>
    </Link>
  );
}
