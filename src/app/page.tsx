import Link from "next/link";
import { Masthead, RisingRule } from "@/components/site/Chrome";
import LiveSnapshot from "@/components/site/LiveSnapshot";
import { J12Grid } from "@/components/index/Figures";

/**
 * jfindx.org — the front page.
 *
 * Kept deliberately short: the title, one paragraph, the J12, and three doors
 * out. Everything the old page explained at length — what you get out of it,
 * what it measures, why crowdsourcing changes what's possible, the five ways
 * in — now lives on the page built for it (Your Organization, How it works,
 * How did we get here, Join), reachable from the nav on every single screen.
 * A front page's job is to get someone to the right door fast, not to be the
 * whole book.
 */
export default function Home() {
  return (
    <>
      <Masthead edition="A project of the Next Gen Global Collab · on the road to 2033" />

      <main className="mx-auto max-w-5xl px-5">
        <section className="grid gap-10 border-b border-ink py-12 md:grid-cols-[1.45fr_1fr] md:gap-14">
          <div>
            <div>
              <h1 className="wordmark text-[42px] leading-[0.98] tracking-tight sm:text-[56px]">
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

            <p className="mt-9 max-w-measure text-[22px] leading-[1.4]">
              One four-minute survey, run under your own name, that finally lets you see your young
              people next to your country and the world — instead of alone.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/tour"
                className="rounded-lg border-2 border-emerald bg-emerald px-5 py-3 text-[14px] font-semibold text-plate no-underline hover:bg-emerald-deep"
              >
                See how it works →
              </Link>
              <Link
                href="/join"
                className="rounded-lg border border-ink px-5 py-3 text-[14px] font-semibold text-ink no-underline hover:bg-ink hover:text-paper"
              >
                Join the Index →
              </Link>
              <Link
                href="/organization"
                className="rounded-lg border border-ink px-5 py-3 text-[14px] font-semibold text-ink no-underline hover:bg-ink hover:text-paper"
              >
                Your Organization →
              </Link>
            </div>
          </div>

          <aside className="md:pt-4">
            <J12Grid className="mx-auto max-w-[280px]" />
            <p className="margin-note mt-5 border-l-2 border-emerald pl-3">
              Twelve questions. Three about the person, four about how deep it has gone.{" "}
              <Link href="/learn" className="text-emerald no-underline hover:underline">
                What is the Index →
              </Link>
            </p>
          </aside>
        </section>

        <LiveSnapshot />

        {/* ── closing ───────────────────────────────────────────────── */}
        <section className="border-t-2 border-ink py-12">
          <div className="grid items-end gap-8 md:grid-cols-[1.4fr_1fr]">
            <div>
              <h2 className="text-[30px] leading-tight">Organisations are joining now.</h2>
              <p className="mt-3 max-w-measure text-[17px] leading-relaxed text-ink-2">
                From every region, each one adding to a benchmark worth having. Your own results
                appear the moment you run the Index — a national comparison appears once enough
                organisations near you have taken part. Which is the best reason to bring the people
                you already work alongside.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <Link
                href="/join"
                className="rounded-lg border-2 border-emerald bg-emerald px-5 py-3 text-center text-[14px] font-semibold text-plate no-underline hover:bg-emerald-deep"
              >
                Join the Index →
              </Link>
              <Link
                href="/intelligence"
                className="rounded-lg border border-ink px-5 py-3 text-center text-[14px] font-semibold text-ink no-underline hover:bg-ink hover:text-paper"
              >
                See the global picture first →
              </Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
