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
  { t: "Anonymous", d: "no one — including you — sees an individual's answers" },
  { t: "Your brand", d: "your logo, your colour, your words" },
  { t: "Your results, live", d: "they belong to your ministry" },
  { t: "Compare as your area grows", d: "city and country views open as more ministries join" },
  { t: "See Jesus-following in the next generation", d: "locally and globally" },
];

const STEPS: { t: string; d: string }[] = [
  { t: "Join", d: "About two minutes." },
  { t: "Make it yours", d: "Your logo and colour; your link and QR code." },
  { t: "Invite your young people", d: `They answer on any phone in about ${WELCOME_MINUTES} minutes, anonymously.` },
  { t: "See your results", d: "Grouped results, live." },
  { t: "Compare", d: "City and country views open as your area grows." },
];

export default function Home() {
  return (
    <>
      <Masthead edition="A project of the Next Gen Global Collab · on the road to 2033" />

      <main className="mx-auto max-w-5xl px-5">
        {/* ── A · hero ─────────────────────────────────────────────── */}
        <section className="grid gap-10 pt-12 md:grid-cols-[1.45fr_1fr] md:gap-14">
          <div>
            <h1 className="wordmark text-[42px] leading-[0.98] tracking-tight sm:text-[56px]">
              The <span className="italic">Jesus</span>{" "}
              <span className="tabular text-[36px] uppercase tracking-[0.14em] sm:text-[48px]">Index</span>
            </h1>
            <RisingRule className="mt-3 h-6 w-full max-w-[460px]" />
            <p className="tabular mt-1 text-[11px] uppercase tracking-[0.16em] text-ink-2">
              A global measure of Jesus-following
            </p>

            <p className="mt-8 text-[24px] font-semibold leading-snug text-ink">
              Free for every ministry. Available now.
            </p>
            <p className="mt-3 max-w-measure text-[18px] leading-relaxed text-ink-2">
              A {WELCOME_MINUTES}-minute survey your young people take on any phone, under your name. You see your
              results live.
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

            <HeroBenefits items={BENEFITS} className="mt-10" />
          </div>

          <aside className="md:pt-2">
            <SeeADemoCard className="mx-auto max-w-[340px]" />
          </aside>

        </section>

        {/* ── B · the J12 journey ─────────────────────────────────── */}
        <J12Journey />

        {/* ── C · try it yourself ─────────────────────────────────── */}
        <section id="try" aria-labelledby="try-heading" className="scroll-mt-6 py-12">
          <GradientRule className="mb-10" />
          <p className="figcap">Try it yourself</p>
          <h2 id="try-heading" className="mt-2 text-[28px] font-bold leading-tight tracking-tight sm:text-[32px]">See it from their side.</h2>
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
                  Join the Jesus Index →
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
