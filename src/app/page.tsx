import Link from "next/link";
import { Footer, GradientRule, Masthead, RisingRule } from "@/components/site/Chrome";
import PitchDocs from "@/components/site/PitchDocs";
import SeeADemoCard from "@/components/site/SeeADemoCard";
import HeroBenefits from "@/components/site/HeroBenefits";
import J12Journey from "@/components/index/J12Journey";
import { LazySurveyDemo } from "@/components/site/HomeLazy";
import { WELCOME_MINUTES } from "@/lib/instrument";

/**
 * jfindx.org — the front page. One scroll, top to bottom (Oct 2026):
 *
 *   A  Hero — what it is, that it's free and available now (said in the
 *      text, not as a benefit tile), the benefits,
 *      and two doors: start your journey, or try the survey yourself.
 *   B  The J12 journey — the model as an interactive picture.
 *   C  Try it yourself — the real survey in a phone, beside five steps.
 *   D  Pitch documents — the PDFs to take to leaders.
 *   E  Footer — built by the Collab · Our story · Privacy · Terms · Consent.
 *
 * Round 4 (Oct 2026): the Jesus Index name and mark throughout; the J12
 * drawn as the real mark with details on hover; "Safe for under-18s" off the
 * benefits (consent lives in the footer and /resources/consent).
 * Round 4b: everything demo — the three sample ministries and the global
 * view — lives on /see-a-demo ("See a Demo" in the nav). The front page shows
 * no figures at all, real or invented; the hero card is only a door.
 *
 * Built on Miguel's edit list (headline + steps, benefits first, fewer words
 * and more pictures, preview the questions) with Ulrich's direction. Copy
 * follows the watch-outs: results BELONG to your ministry, answers are
 * anonymous to everyone (including you), comparisons appear as your area
 * grows — never a promise of a benchmark that doesn't exist yet.
 */
// Round 5: shown as headings only (HeroBenefits), each line appearing on hover/tap.
const BENEFITS: { t: string; d: string }[] = [
  { t: "Anonymous", d: "no one, including you, sees an individual's answers" },
  { t: "Your brand", d: "your logo, your colour, your words" },
  { t: "Live results", d: "your dashboard updates with every response, and the data belongs to your ministry." },
  { t: "Compare your results", d: "Country comparisons allow you to see your results in context." },
  { t: "See Jesus-following in the next generation", d: "both locally and globally." },
];

const STEPS: { t: string; d: string }[] = [
  { t: "Join", d: "It takes just two minutes." },
  { t: "Make it yours", d: "Add your own logo and colour, and create your first survey link." },
  { t: "Share it with your young people", d: "Use the link or QR code to share it with your youth group, camp, or even in a group chat." },
  { t: "See your results", d: `In about ${WELCOME_MINUTES} minutes, your dashboard will fill in as answers arrive, anonymously.` },
  { t: "Compare and plan", d: "Once enough ministries near you take part, see how you compare at a country-level." },
];

export default function Home() {
  return (
    <>
      <Masthead edition="From the Next Gen Global Collab: 30+ ministries, one goal for 2033" />

      <main className="mx-auto max-w-5xl px-5">
        {/* ── A · hero ─────────────────────────────────────────────── */}
        <section className="grid gap-10 pt-12 md:grid-cols-[1.45fr_1fr] md:gap-14">
          {/* Round 7: the left column is a flex column, and the benefits fill
              what's left of it, so it ends level with the See a Demo card. */}
          <div className="flex flex-col">
            <h1 className="wordmark text-[42px] leading-[0.98] tracking-tight sm:text-[56px]">
              The <span className="italic">Jesus</span>{" "}
              <span className="tabular text-[36px] uppercase tracking-[0.14em] sm:text-[48px]">Index</span>
            </h1>
            <RisingRule className="mt-3 h-6 w-full max-w-[460px]" />
            <p className="tabular mt-1 text-[11px] uppercase tracking-[0.16em] text-ink-2">
              The Next Gen Jesus-Following Index

            </p>

            <p className="mt-8 text-[24px] font-semibold leading-snug text-ink">
              Do you know where your young people are with Jesus?
            </p>
            <p className="mt-3 max-w-measure text-[18px] leading-relaxed text-ink-2">
              Most of us count who turns up. The Jesus Index shows what&apos;s underneath: who believes, who&apos;s growing,
              and who&apos;s helping someone else follow Jesus. Your young people answer anonymously, on any phone, in
              about {WELCOME_MINUTES} minutes. Free to join and free to run, permanently.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/join"
                className="rounded-lg border-2 border-emerald bg-emerald px-5 py-3 text-[14px] font-semibold text-plate no-underline hover:bg-emerald-deep"
              >
                Start your journey →
              </Link>
              <a
                href="#try"
                className="rounded-lg border border-ink px-5 py-3 text-[14px] font-semibold text-ink no-underline hover:bg-ink hover:text-paper"
              >
                Try the survey yourself ↓
              </a>
            </div>

            <HeroBenefits items={BENEFITS} className="mt-10 flex-1" />
          </div>

          <aside className="flex">
            <SeeADemoCard className="mx-auto w-full max-w-[340px]" />
          </aside>

        </section>

        {/* ── B · the J12 journey ─────────────────────────────────── */}
        <J12Journey />

        {/* ── C · try it yourself ─────────────────────────────────── */}
        <section id="try" aria-labelledby="try-heading" className="scroll-mt-6 py-12">
          <GradientRule className="mb-10" />
          <p className="figcap">Try it yourself</p>
          <h2 id="try-heading" className="mt-2 text-[28px] font-bold leading-tight tracking-tight sm:text-[32px]">What your young people see</h2>
          <div className="mt-8 grid items-center gap-10 md:grid-cols-[1fr_400px] md:gap-14">
            <div>
              <ol className="flex flex-col gap-5">
                {STEPS.map((s, i) => (
                  <li key={s.t} className="flex gap-4">
                    <span className="tabular flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-[15px] font-semibold text-paper">
                      {i + 1}
                    </span>
                    <span>
                      <span className="block text-[17px] font-bold text-ink">{s.t}</span>
                      <span className="block text-[15px] leading-relaxed text-ink-2">{s.d}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/join"
                  className="rounded-lg border-2 border-emerald bg-emerald px-5 py-3 text-[14px] font-semibold text-plate no-underline hover:bg-emerald-deep"
                >
                  Start your own →
                </Link>
                <Link href="/tour" className="rounded-lg border border-ink px-5 py-3 text-[14px] font-semibold text-ink no-underline hover:bg-ink hover:text-paper">
                  How does it work? →
                </Link>
              </div>
            </div>
            <div className="flex justify-center">
              <LazySurveyDemo large />
            </div>
          </div>
        </section>

        {/* ── D · pitch documents ─────────────────────────────────── */}
        <PitchDocs />
      </main>

      <Footer />
    </>
  );
}
