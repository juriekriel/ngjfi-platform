import Link from "next/link";
import { Footer, Masthead, RisingRule } from "@/components/site/Chrome";
import { J12Grid } from "@/components/index/Figures";
import J12Journey from "@/components/index/J12Journey";
import { LazyLiveSnapshot, LazySurveyDemo } from "@/components/site/HomeLazy";
import { WELCOME_MINUTES } from "@/lib/instrument";

/**
 * jfindx.org — the front page. One scroll, top to bottom (Oct 2026):
 *
 *   A  Hero — what it is, that it's free and available now (said in the
 *      text, not as a benefit tile), the benefits,
 *      and two doors: start your journey, or try the survey yourself.
 *   B  The J12 journey — the model as an interactive picture.
 *   C  Try it yourself — the real survey in a phone, beside five steps.
 *   D  The global view — the live counter and map (was /intelligence).
 *   E  Footer — built by the Collab · Our story · Privacy · Terms · Consent.
 *
 * Built on Miguel's edit list (headline + steps, benefits first, fewer words
 * and more pictures, preview the questions) with Ulrich's direction. Copy
 * follows the watch-outs: results BELONG to your ministry, answers are
 * anonymous to everyone (including you), comparisons appear as your area
 * grows — never a promise of a benchmark that doesn't exist yet.
 */
const BENEFITS: { t: string; d: string; href?: string }[] = [
  { t: "Anonymous", d: "no one — including you — sees an individual's answers" },
  { t: "Safe for under-18s", d: "consent handled with you, before anyone starts", href: "/resources/consent" },
  { t: "Your brand", d: "your logo, your colour, your words" },
  { t: "Your results, live", d: "they belong to your ministry" },
  { t: "Compare as your area grows", d: "city and country views open as more ministries join" },
];

const STEPS: { t: string; d: string }[] = [
  { t: "Join", d: "Free, about two minutes." },
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
        <section className="grid gap-10 border-b border-ink py-12 md:grid-cols-[1.45fr_1fr] md:gap-14">
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
          </div>

          <aside className="md:pt-2">
            <J12Grid className="mx-auto max-w-[260px]" />
          </aside>

          <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2 md:col-span-2 md:grid-cols-3">
            {BENEFITS.map((b) => (
              <li key={b.t} className="border-l-2 border-emerald pl-3">
                <span className="block text-[15px] font-semibold text-ink">
                  {b.href ? <Link href={b.href} className="text-ink underline decoration-rule-2 underline-offset-2">{b.t}</Link> : b.t}
                </span>
                <span className="block text-[13.5px] leading-snug text-ink-2">{b.d}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ── B · the J12 journey ─────────────────────────────────── */}
        <J12Journey />

        {/* ── C · try it yourself ─────────────────────────────────── */}
        <section id="try" aria-labelledby="try-heading" className="scroll-mt-6 py-12">
          <p className="figcap">Try it yourself</p>
          <h2 id="try-heading" className="mt-2 text-[28px] leading-tight sm:text-[32px]">See it from their side.</h2>
          <div className="mt-8 grid gap-10 md:grid-cols-[1fr_340px] md:gap-14">
            <div>
              <ol className="flex flex-col gap-5">
                {STEPS.map((s, i) => (
                  <li key={s.t} className="flex gap-4">
                    <span className="tabular flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-[15px] font-semibold text-paper">
                      {i + 1}
                    </span>
                    <span>
                      <span className="block text-[17px] font-semibold text-ink">{s.t}</span>
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
                  Join the JFINDX — free →
                </Link>
                <Link href="/tour" className="rounded-lg border border-ink px-5 py-3 text-[14px] font-semibold text-ink no-underline hover:bg-ink hover:text-paper">
                  Take the full tour →
                </Link>
              </div>
            </div>
            <div className="md:sticky md:top-6 md:self-start">
              <LazySurveyDemo />
            </div>
          </div>
        </section>

        {/* ── D · the global view ─────────────────────────────────── */}
        <LazyLiveSnapshot />
      </main>

      <Footer />
    </>
  );
}
