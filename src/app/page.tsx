import Link from "next/link";
import { Colophon, Door, Masthead, RisingJ, RisingRule } from "@/components/site/Chrome";
import { IndexPlate, JourneyFunnel, Matrix, Plate } from "@/components/index/Figures";
import { sampleDashboard, sampleTierCounts } from "@/lib/sample";

/**
 * jfindx.org — the front page.
 *
 * A masthead, not a hero pitch: a published number with a date on it, then five
 * doors. Every figure here is rendered by the SAME components the live org
 * dashboard uses, fed by a sample payload derived from the live instrument — so
 * the front page cannot show a version of the product that no longer exists.
 */
export default function Home() {
  const d = sampleDashboard();
  const counts = sampleTierCounts();

  return (
    <>
      <Masthead edition="NextGen Edition · Field II · sample data · eleven regions reporting" />

      <main className="mx-auto max-w-5xl px-5">
        {/* ── the nameplate ─────────────────────────────────────────── */}
        <section className="grid gap-8 border-b border-ink py-10 md:grid-cols-[1.35fr_1fr] md:gap-12">
          <div>
            <div className="flex items-start gap-4">
              <RisingJ className="mt-1.5 h-14 w-14 shrink-0" />
              <div className="min-w-0 flex-1">
                <h1 className="text-[40px] leading-[0.98] tracking-tight sm:text-[52px]">
                  The <span className="italic">Jesus</span>{" "}
                  <span className="tabular text-[34px] uppercase tracking-[0.14em] sm:text-[44px]">
                    Index
                  </span>
                </h1>
                {/* Same terminal as the icon, stretched to nameplate scale. */}
                <RisingRule className="mt-2 h-5 w-full max-w-[420px]" />
                <p className="tabular mt-1 text-[11px] uppercase tracking-[0.16em] text-ink-2">
                  A global measure of Jesus-following
                </p>
              </div>
            </div>

            <p className="mt-7 max-w-measure text-[20px] leading-[1.45]">
              Thirty-plus organisations. Dozens of countries. One goal for 2033 — and until now,{" "}
              <b>no shared way to tell whether young people are actually following Jesus.</b>
            </p>
            <p className="mt-4 max-w-measure text-[17px] leading-relaxed text-ink-2">
              Every ministry counts something. Attendance, decisions, baptisms, events run. None of it
              answers the question underneath: <i>is any of this actually forming disciples?</i> And
              because everyone counts differently, nobody can compare, so nobody can learn.
            </p>
            <p className="mt-4 max-w-measure text-[17px] leading-relaxed text-ink-2">
              The Index is one instrument — twelve questions at its core, about four minutes — that any
              organisation can run <b>under its own brand, with its own consent process</b>. Your
              results are yours instantly. Anonymised, they pool into a shared picture, so for the
              first time the whole movement reads the same scoreboard.
            </p>
            <p className="mt-5 max-w-measure text-[17px] leading-relaxed">
              It is free to run, and it stays free. We are not centralising the research —{" "}
              <b>we are crowdsourcing it, and handing it back.</b>
            </p>
          </div>

          {/* the published number */}
          <aside>
            <IndexPlate
              value={d.index}
              n={d.n}
              change={3.1}
              edition="JX:NG · the composite"
              caption="Fig. 01 — one number the whole coalition watches"
            />
            <div className="mt-6">
              <Plate label="The journey" figure="Fig. 02">
                <JourneyFunnel tiers={d.tiers} counts={counts} />
              </Plate>
            </div>
            <p className="margin-note mt-4 border-l-2 border-rule pl-3">
              Read the narrowing, not the headline. Belief outruns practice, and practice outruns
              reproduction — that gap is where the strategy lives.
            </p>
          </aside>
        </section>

        {/* ── the five doors ────────────────────────────────────────── */}
        <section className="py-10">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule pb-3">
            <h2 className="text-[27px] leading-tight">Five ways in.</h2>
            <p className="margin-note">Start anywhere. They are built to be read in order.</p>
          </div>

          <div className="mt-7 grid gap-x-8 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
            <Door
              n="01"
              kicker="Understand it"
              title="Why this exists, and how we got here"
              body="The whole story: the question the Collab could not answer, the 50-country study that collapsed under ethics and arithmetic, the pivot that turned a research project into a shared standard, and the people who carry it. Two years of decisions, explorable."
              cta="Learn more"
              href="/learn"
              note="A long read, with the working shown."
            />
            <Door
              n="02"
              kicker="See it"
              title="A guided walk through how it will work"
              body="Click through the whole thing, one beat at a time — what a young person sees on their phone, what lands on a ministry's dashboard the same day, and what the Collab sees across every organisation at once."
              cta="Take the walkthrough"
              href="/tour"
              note="Rendered by the live product's own components."
            />
            <Door
              n="03"
              kicker="Try it"
              title="Explore the sandbox yourself"
              body="No rails. Take the survey as a young person, open a sample ministry's dashboard, read the global view — the full platform, running on invented data, with nothing to sign and nothing to break."
              cta="Open the sandbox"
              href="/demo"
              note="Every number in it is invented. Nothing in it is research."
            />
            <Door
              n="04"
              kicker="Join it"
              accent
              title="Bring your organisation into a cohort"
              body="We open in small groups, country by country, so each one reaches the sample size a benchmark actually needs. Tell us where you work and we will tell you which cohort you fit."
              cta="Join the first cohort"
              href="/join"
              note="For organisations and churches. About 30 seconds."
            />
            <Door
              n="05"
              kicker="Build it"
              title="Early access, for those building it"
              body="The live roadmap with real dates, the open decisions still on the table, the current instrument version and the repo. Access is approved individually before the first season opens."
              cta="Request early access"
              href="/access"
              note="Ministry email required. Approved individually."
            />
            <div className="border-t-2 border-rule pt-3">
              <p className="figcap">Also</p>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
                Everything here runs on <b>synthetic sample data</b> while the instrument is still
                being tightened by the research panel. Nothing on this site is a finding. When real
                results exist they will be marked as real, and they will carry their sample size.
              </p>
              <Link
                href="/learn#integrity"
                className="tabular mt-3 inline-block text-[11px] uppercase tracking-[0.14em] text-ink no-underline hover:underline"
              >
                Why we are strict about this →
              </Link>
            </div>
          </div>
        </section>

        {/* ── what it measures ──────────────────────────────────────── */}
        <section className="border-t-2 border-ink py-10">
          <div className="grid gap-8 md:grid-cols-[1fr_2fr] md:gap-12">
            <div>
              <h2 className="text-[27px] leading-tight">What it measures</h2>
              <p className="mt-3 max-w-measure text-[16px] leading-relaxed text-ink-2">
                The <b>three questions</b> are <i>what</i> we measure. The <b>four tiers</b> are{" "}
                <i>how deep it has gone</i>. Two axes of one grid — every question readable at every
                tier.
              </p>
              <p className="margin-note mt-4 border-l-2 border-rule pl-3">
                Twelve cells, twelve core items. The instrument inherits the disciples, not a
                demographic — which is also why it can outlive its first cohort.
              </p>
            </div>
            <div>
              <Plate label="The J12 · the model" figure="Fig. 03">
                <Matrix phrases />
              </Plate>
              <p className="figcap mt-3 leading-relaxed">
                Plain language, not scores — this figure is the model itself. Around four minutes on
                the core twelve, on any phone. Anonymous by architecture.
              </p>
            </div>
          </div>
        </section>

        {/* ── the integrity line ────────────────────────────────────── */}
        <section id="integrity" className="-mx-5 bg-ink px-5 py-12 text-paper">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-[30px] leading-[1.15] text-paper sm:text-[36px]">
              We will never claim to speak for a nation.
            </h2>
            <p className="mt-5 max-w-measure text-[17px] leading-relaxed text-rule">
              Crowdsourced data is only responsible if you are honest about what it is. So the Index
              only ever says one thing:
            </p>
            <p className="mt-5 max-w-2xl border-l-2 border-emerald pl-5 text-[21px] italic leading-snug text-paper">
              “Of those who have completed the Index — here are the results, and here is how you
              compare.”
            </p>
            <div className="mt-7 grid max-w-4xl gap-x-10 gap-y-4 text-[15px] leading-relaxed text-rule sm:grid-cols-2">
              <p>
                Every score carries its sample size. No benchmark appears for a country until enough
                people there have completed the Index.
              </p>
              <p>
                No organisation ever sees another organisation&apos;s results, and no organisation ever
                sees an individual response — not even its own respondents&apos;.
              </p>
            </div>
            <p className="mt-7 max-w-measure text-[15px] leading-relaxed text-muted">
              That single discipline is what makes this usable by serious researchers. We are not
              going to trade it for a better headline.
            </p>
          </div>
        </section>

        {/* ── closing ───────────────────────────────────────────────── */}
        <section className="border-b border-ink py-12">
          <div className="grid items-end gap-6 md:grid-cols-[1.4fr_1fr]">
            <div>
              <h2 className="text-[30px] leading-tight">Cohorts are forming now.</h2>
              <p className="mt-3 max-w-measure text-[17px] leading-relaxed text-ink-2">
                Small groups, country by country, each one large enough to give you a benchmark worth
                having. Your own results appear the moment you run the Index — a national comparison
                appears once enough organisations near you have taken part.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <Link
                href="/join"
                className="tabular border-2 border-emerald bg-emerald px-5 py-3 text-center text-[12px] uppercase tracking-[0.14em] text-plate no-underline hover:bg-emerald-deep"
              >
                Join the first cohort →
              </Link>
              <Link
                href="/tour"
                className="tabular border border-ink px-5 py-3 text-center text-[12px] uppercase tracking-[0.14em] text-ink no-underline hover:bg-ink hover:text-paper"
              >
                See how it works first →
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Colophon />
    </>
  );
}
