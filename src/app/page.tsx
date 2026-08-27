import Link from "next/link";
import { Colophon, Door, Masthead, RisingRule } from "@/components/site/Chrome";
import { J12Grid, Matrix, Plate } from "@/components/index/Figures";
import { TIER_TINT } from "@/lib/model";

/**
 * jfindx.org — the front page.
 *
 * Deliberately carries NO scores. Every figure in the platform is currently
 * synthetic, and a fabricated number is a poor thing to lead with even when it
 * is labelled: it invites the visitor to read the demo as the product. The
 * numbers live behind door 03, where the context travels with them.
 *
 * What leads instead is the proposition, the scale of the coalition (real, and
 * countable), and the J12 diagram — visual, brand-native, and free of data.
 */
export default function Home() {
  return (
    <>
      <Masthead edition="A project of the Next Gen Global Collab · on the road to 2033" />

      <main className="mx-auto max-w-5xl px-5">
        {/* ── the nameplate ─────────────────────────────────────────── */}
        <section className="grid gap-10 border-b border-ink py-12 md:grid-cols-[1.45fr_1fr] md:gap-14">
          <div>
            {/* No icon beside the wordmark — the J-curve would read as a second
                J. The rising rule carries the same gesture and terminates in the
                same cross, which is what FIG. 06 is for. */}
            <div>
              <h1 className="text-[42px] leading-[0.98] tracking-tight sm:text-[56px]">
                The <span className="italic">Jesus</span>{" "}
                <span className="tabular text-[36px] uppercase tracking-[0.14em] sm:text-[48px]">
                  Index
                </span>
              </h1>
              <RisingRule className="mt-3 h-6 w-full max-w-[460px]" />
              <p className="tabular mt-1 text-[11px] uppercase tracking-[0.16em] text-ink-2">
                A global measure of Jesus-following
              </p>
            </div>

            <p className="mt-9 max-w-measure text-[24px] leading-[1.32]">
              Finally see the young people you lead — and the ones you haven&apos;t reached yet.
            </p>
            <p className="mt-4 max-w-measure text-[17.5px] leading-relaxed text-ink-2">
              Four minutes on a phone tells you where your people actually are on the journey: what
              they believe, what they practise, and whether any of it is reproducing. You get it back
              the same day, under your own brand, and it is free — permanently.
            </p>
            <p className="mt-4 max-w-measure text-[17.5px] leading-relaxed text-ink-2">
              And because hundreds of organisations run the <i>same</i> twelve questions, you see your
              answer next to your city, your country and the world — instead of alone. That is a
              picture <b>no single study could ever afford to buy</b>, and it belongs to everyone who
              helps build it.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/join"
                className="tabular border-2 border-emerald bg-emerald px-5 py-3 text-[11px] uppercase tracking-[0.14em] text-plate no-underline hover:bg-emerald-deep"
              >
                Join the first cohort →
              </Link>
              <Link
                href="/tour"
                className="tabular border border-ink px-5 py-3 text-[11px] uppercase tracking-[0.14em] text-ink no-underline hover:bg-ink hover:text-paper"
              >
                See how it works →
              </Link>
            </div>
          </div>

          <aside className="md:pt-4">
            <J12Grid className="mx-auto max-w-[280px]" />
            <p className="margin-note mt-5 border-l-2 border-emerald pl-3">
              Twelve questions. Three about the person, four about how deep it has gone — and the
              instrument inherits the disciples, not a demographic, which is why it can outlive its
              first cohort.
            </p>
          </aside>
        </section>

        {/* ── what you actually get ─────────────────────────────────── */}
        <section className="py-12">
          <h2 className="text-[28px] leading-tight">What you get out of it.</h2>
          <div className="mt-8 grid gap-x-9 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                n: "01",
                h: "A diagnosis, not a grade",
                p: "Not “how are we doing” but exactly where your people stop moving — belief, practice, or reproduction. Three different problems needing three different responses.",
                tier: "exposure",
              },
              {
                n: "02",
                h: "Yours, under your name",
                p: "Your logo, your colour, your words, your consent process. To a young person it is their youth group asking — because it is. The Index sits in the footer.",
                tier: "response",
              },
              {
                n: "03",
                h: "Benchmarked, not isolated",
                p: "The same twelve questions everywhere means your number finally means something next to your country and the globe.",
                tier: "formation",
              },
              {
                n: "04",
                h: "Proof that it moved",
                p: "Run it again next season and the same figure tells you whether what you changed actually worked. Width and time — not depth.",
                tier: "multiplication",
              },
            ].map((c) => (
              <div key={c.n}>
                {/* The four cards walk the tier ramp, so this block cannot drift
                    from the heat grid: both read TIER_TINT. */}
                <div
                  className="flex h-[74px] items-end p-3"
                  style={{ background: TIER_TINT[c.tier].bg, color: TIER_TINT[c.tier].fg }}
                >
                  <span className="tabular text-[26px] leading-none">{c.n}</span>
                </div>
                <h3 className="mt-3 text-[19px] leading-snug">{c.h}</h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{c.p}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── what it measures ──────────────────────────────────────── */}
        <section className="border-t-2 border-ink py-12">
          <div className="grid gap-9 md:grid-cols-[1fr_1.9fr] md:gap-12">
            <div>
              <h2 className="text-[28px] leading-tight">What it measures</h2>
              <p className="mt-4 max-w-measure text-[16.5px] leading-relaxed text-ink-2">
                Three questions — <b>what</b> we measure. Four tiers — <b>how deep it has gone</b>.
                Every item carries one of each, so a four-minute survey reads two completely different
                ways.
              </p>
              <p className="mt-4 max-w-measure text-[16.5px] leading-relaxed text-ink-2">
                The colour deepens as the journey does. Read across a row to see how far one question
                has travelled; read down a column to see what a whole cohort has and has not reached.
              </p>
              <p className="margin-note mt-5 border-l-2 border-rule pl-3">
                Plain language here, scores in the product — same component, so the explanation can
                never drift from the thing it explains.
              </p>
            </div>
            <Plate label="The J12 · the model" figure="Fig. 01">
              <Matrix phrases />
            </Plate>
          </div>
        </section>

        {/* ── the scale ─────────────────────────────────────────────── */}
        <section id="scale" className="-mx-5 bg-ink px-5 py-14 text-paper">
          <div className="mx-auto max-w-5xl">
            <p className="figcap text-muted">Why crowdsourcing changes what is possible</p>
            <h2 className="mt-3 max-w-3xl text-[30px] leading-[1.14] text-paper sm:text-[38px]">
              A picture of Jesus-following at a scale no one has ever been able to afford.
            </h2>
            <p className="mt-6 max-w-measure text-[17px] leading-relaxed text-rule">
              A comparable global study costs tens of millions and takes a decade. So instead of
              buying the picture, the Collab builds it: give the instrument away, let hundreds of
              organisations run it inside work they are already doing, and pool what comes back.
            </p>

            <div className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["30+", "organisations in the Collab, sharing one goal for 2033"],
                ["11", "regions the instrument is built to field in"],
                ["12", "questions at the core — about four minutes"],
                ["$0", "to run it, permanently, including your standard report"],
              ].map(([fig, cap]) => (
                <div key={cap} className="border-t-2 border-emerald pt-3">
                  <p className="tabular text-[40px] leading-none text-paper">{fig}</p>
                  <p className="mt-2.5 text-[14.5px] leading-snug text-rule">{cap}</p>
                </div>
              ))}
            </div>

            <div className="mt-12 grid gap-8 border-t border-ink-2 pt-8 md:grid-cols-[1.3fr_1fr] md:gap-12">
              <div>
                <h3 className="text-[21px] leading-snug text-paper">
                  And it is trustworthy, which is the harder half.
                </h3>
                <p className="mt-3 max-w-measure text-[15.5px] leading-relaxed text-rule">
                  Every score carries its sample size. No benchmark appears for a country until enough
                  people there have completed the Index. No organisation ever sees another&apos;s
                  results, and no organisation ever sees an individual response — not even its own
                  respondents&apos;. Respondents are anonymous by architecture, and consent for minors
                  is handled by you, locally.
                </p>
              </div>
              <div className="self-center border-l-2 border-emerald pl-5">
                <p className="text-[17px] italic leading-snug text-paper">
                  “Of those who have completed the Index — here are the results, and here is how you
                  compare.”
                </p>
                <p className="margin-note mt-3 text-muted">
                  The only claim the Index ever makes. It is what lets serious researchers use it, and
                  we are not trading it for a better headline.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── the five doors ────────────────────────────────────────── */}
        <section className="py-12">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule pb-3">
            <h2 className="text-[28px] leading-tight">Five ways in.</h2>
            <p className="margin-note">Pick whichever one you came for.</p>
          </div>

          <div className="mt-8 grid gap-x-8 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
            <Door
              n="01"
              kicker="Understand it"
              title="Why this exists, and how we got here"
              body="The question the Collab could not answer, the fifty-country study that collapsed under ethics and arithmetic, and the pivot that turned a research project into a shared standard. Two years of decisions, with the working shown."
              cta="Learn more"
              href="/learn"
              note="A long read. Open one era or all six."
            />
            <Door
              n="02"
              kicker="See it"
              title="A guided walk through how it will work"
              body="Six beats: what a young person sees on their phone, how the survey adapts to their answers, what lands on a ministry's dashboard the same day, and what the whole coalition sees at once."
              cta="Take the walkthrough"
              href="/tour"
              note="Rendered by the live product's own components."
            />
            <Door
              n="03"
              kicker="Try it"
              accent
              title="Explore the sandbox — with the numbers"
              body="This is where the figures live. Take the survey as a young person, open a sample ministry's dashboard, read the global view. Every number in it is invented, and it behaves exactly like the real thing."
              cta="Open the sandbox"
              href="/demo"
              note="Invented data. Nothing in it is research."
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
              body="The live roadmap with real dates, the open decisions still on the table, the current instrument version and the repo. Approved individually before the first season opens."
              cta="Request early access"
              href="/access"
              note="Ministry email required."
            />
            <div className="border-t-2 border-rule pt-3">
              <p className="figcap">A note on the numbers</p>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
                There are deliberately none on this page. Everything the platform holds today is{" "}
                <b>synthetic sample data</b>, generated to build against while the research panel
                tightens the instrument. It lives in the sandbox, where the context travels with it.
              </p>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
                When real results exist they will be marked as real, and they will carry their sample
                size.
              </p>
            </div>
          </div>
        </section>

        {/* ── closing ───────────────────────────────────────────────── */}
        <section className="border-t-2 border-ink py-12">
          <div className="grid items-end gap-8 md:grid-cols-[1.4fr_1fr]">
            <div>
              <h2 className="text-[30px] leading-tight">Cohorts are forming now.</h2>
              <p className="mt-3 max-w-measure text-[17px] leading-relaxed text-ink-2">
                Small groups, country by country, each one large enough to give you a benchmark worth
                having. Your own results appear the moment you run the Index — a national comparison
                appears once enough organisations near you have taken part. Which is the best reason
                to bring the people you already work alongside.
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
                href="/demo"
                className="tabular border border-ink px-5 py-3 text-center text-[12px] uppercase tracking-[0.14em] text-ink no-underline hover:bg-ink hover:text-paper"
              >
                Explore the sandbox first →
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Colophon />
    </>
  );
}
