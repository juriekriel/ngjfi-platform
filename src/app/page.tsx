import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">
        NextGen Global Collab · Road to 2033
      </p>
      <h1 className="mt-4 font-sans text-4xl font-black leading-[0.95] tracking-tight sm:text-5xl">
        The Next Gen <span className="text-accent">Jesus-Following</span> Index
      </h1>
      <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate">
        One shared way to measure whether young people are following Jesus —
        crowdsourced across hundreds of organisations, each running it as their own.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <Link
          href="/sunrise"
          className="rounded-lg border border-ink bg-card p-6 transition hover:bg-ink hover:text-paper"
        >
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted">
            Respondent demo
          </div>
          <div className="mt-2 text-xl font-semibold">The survey →</div>
          <p className="mt-1 text-sm text-slate">
            A white-labelled, anonymous survey at <code>/sunrise</code>.
          </p>
        </Link>
        <Link
          href="/sunrise/dashboard"
          className="rounded-lg border border-ink bg-card p-6 transition hover:bg-ink hover:text-paper"
        >
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted">
            Org view
          </div>
          <div className="mt-2 text-xl font-semibold">Org dashboard →</div>
          <p className="mt-1 text-sm text-slate">
            Aggregate results for a ministry (sign-in required).
          </p>
        </Link>
      </div>

      <p className="mt-12 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
        Reports only on those who complete the Index — never a whole population.
      </p>
    </main>
  );
}
