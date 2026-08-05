import Link from "next/link";

/**
 * The masthead. jfindx.org is a nameplate, not a hero — a visitor should feel
 * they have walked into something that existed before them.
 */
export function Masthead({ edition }: { edition?: string }) {
  return (
    <header className="border-b border-ink">
      <div className="mx-auto flex max-w-5xl flex-wrap items-end justify-between gap-x-6 gap-y-2 px-5 py-3">
        <Link href="/" className="flex items-baseline gap-2 no-underline">
          <RisingJ className="h-[26px] w-[26px] shrink-0 translate-y-[5px]" />
          <span className="text-[19px] leading-none tracking-tight">
            The <span className="italic">Jesus</span>{" "}
            <span className="tabular text-[15px] uppercase tracking-[0.18em]">Index</span>
          </span>
        </Link>
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <NavLink href="/learn">Learn</NavLink>
          <NavLink href="/tour">How it works</NavLink>
          <NavLink href="/demo">Sandbox</NavLink>
          <NavLink href="/join">Join</NavLink>
          <Link
            href="/access"
            className="tabular border border-ink px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-ink no-underline hover:bg-ink hover:text-paper"
          >
            Early access
          </Link>
        </nav>
      </div>
      {edition && (
        <div className="border-t border-rule">
          <div className="mx-auto max-w-5xl px-5 py-1.5">
            <p className="figcap">{edition}</p>
          </div>
        </div>
      )}
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="tabular text-[10px] uppercase tracking-[0.14em] text-ink-2 no-underline hover:text-ink"
    >
      {children}
    </Link>
  );
}

/**
 * The Rising J — a J that is also a J-curve, ending in a cross that is also a
 * data point. Down before up. One stroke, one colour, no gradient.
 */
export function RisingJ({
  className = "h-8 w-8",
  stroke = "#1B1F27",
  cross = "#0B8A60",
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
      <path d="M 0 24 L 402 24 L 486 4" fill="none" stroke="#1B1F27" strokeWidth="1.5" />
      <g fill="#0B8A60">
        <rect x="490" y="0" width="5" height="19" rx="1.5" />
        <rect x="483" y="7" width="19" height="5" rx="1.5" />
      </g>
    </svg>
  );
}

/** The colophon. Almanacs have one; template sites don't. */
export function Colophon() {
  return (
    <footer className="mt-20 border-t-2 border-ink">
      <div className="mx-auto max-w-5xl px-5 py-8">
        <div className="grid gap-8 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <p className="text-[15px] leading-snug">
              <span className="italic">The Jesus Index</span> — a global measure of Jesus-following.
            </p>
            <p className="margin-note mt-2 max-w-measure">
              A project of the <b>Next Gen Global Collab</b>. Backbone organisation:{" "}
              <b>NXT&nbsp;Move</b>. Survey and intelligence infrastructure: <b>Eido Research</b>.
              Research direction: <b>Dr.&nbsp;Matthew Niermann</b>, with{" "}
              <b>Ulrich Lombard</b> coordinating.
            </p>
          </div>
          <nav className="flex flex-col gap-1.5">
            <p className="figcap mb-1">Explore</p>
            <FootLink href="/learn">Why this exists</FootLink>
            <FootLink href="/tour">How it will work</FootLink>
            <FootLink href="/demo">The sandbox</FootLink>
            <FootLink href="/join">Join a cohort</FootLink>
            <FootLink href="/access">Early access</FootLink>
          </nav>
          <div>
            <p className="figcap mb-1">Colophon</p>
            <p className="margin-note">
              Set in <b>Newsreader</b> and <b>IBM&nbsp;Plex&nbsp;Mono</b>, with Inter for controls.
              Instrument <span className="tabular">v1</span> · scoring{" "}
              <span className="tabular">v0.1.0</span>. Built in the open at{" "}
              <span className="tabular">github.com/juriekriel/ngjfi-platform</span>.
            </p>
          </div>
        </div>
        <p className="figcap mt-8 border-t border-rule pt-4 leading-relaxed">
          Respondents are anonymous — no name, no email, no location beyond a country, age as a band.
          We report only on those who have completed the Index. Every figure currently on this site is
          synthetic sample data and must not be quoted.
        </p>
      </div>
    </footer>
  );
}

function FootLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-[14px] text-ink-2 no-underline hover:text-ink">
      {children}
    </Link>
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
      style={accent ? { borderTopColor: "#0B8A60" } : undefined}
    >
      <div className="flex items-baseline gap-2">
        <span className="tabular text-[11px] tracking-[0.16em]" style={{ color: accent ? "#0B8A60" : "#8A8F9B" }}>
          {n}
        </span>
        <span className="figcap">{kicker}</span>
      </div>
      <h3 className="mt-2 text-[21px] leading-[1.2] text-ink">{title}</h3>
      <p className="mt-2 flex-1 text-[15px] leading-relaxed text-ink-2">{body}</p>
      <p
        className="tabular mt-4 text-[11px] uppercase tracking-[0.14em] group-hover:underline"
        style={{ color: accent ? "#0B8A60" : "#1B1F27" }}
      >
        {cta} →
      </p>
      <p className="margin-note mt-2 text-muted">{note}</p>
    </Link>
  );
}
