import Link from "next/link";
import { Colophon, Masthead } from "@/components/site/Chrome";
import { Plate } from "@/components/index/Figures";

export const metadata = {
  title: "The sandbox — The Jesus Index",
  description:
    "The full platform running on invented data. Take the survey, open a sample ministry's dashboard, read the global view. Nothing in it is research.",
};

const SANDBOX_ORGS = [
  { slug: "sunrise", name: "Sunrise Youth Collective", country: "Argentina", note: "Spanish-language pilot persona" },
  { slug: "grace-cdmx", name: "Grace CDMX", country: "Mexico", note: "Second Spanish cluster" },
  { slug: "lighthouse-mnl", name: "Lighthouse Manila", country: "Philippines", note: "Dense youth network" },
  { slug: "anchor-nairobi", name: "Anchor Nairobi", country: "Kenya", note: "East African cluster" },
  { slug: "cityreach-london", name: "CityReach London", country: "United Kingdom", note: "Europe anchor" },
];

export default function DemoHub() {
  return (
    <>
      <Masthead edition="§ Sandbox · invented organisations · invented figures" />

      <main className="mx-auto max-w-5xl px-5">
        <section className="grid gap-8 border-b border-ink py-10 md:grid-cols-[1.4fr_1fr] md:gap-12">
          <div>
            <p className="figcap">Door 03 · no rails</p>
            <h1 className="mt-3 text-[36px] leading-[1.05] tracking-tight sm:text-[44px]">
              Explore the whole platform yourself.
            </h1>
            <p className="mt-5 max-w-measure text-[17px] leading-relaxed">
              This is the real software, connected to a real database, running on a set of{" "}
              <b>invented organisations</b>. Take the survey as a young person. Open a ministry&apos;s
              dashboard without signing in. Read the coalition-wide view. Nothing you do here can break
              anything, and nothing you do here is recorded against you.
            </p>
            <p className="mt-4 max-w-measure text-[16px] leading-relaxed text-ink-2">
              If you would rather be walked through it with the reasoning attached, the{" "}
              <Link href="/tour" className="underline decoration-rule underline-offset-2">
                guided walkthrough
              </Link>{" "}
              covers the same ground in six beats.
            </p>
          </div>
          <aside className="self-end border-2 border-ink p-5">
            <p className="tabular text-[10px] uppercase tracking-[0.16em] text-vermillion">
              Read this first
            </p>
            <p className="mt-3 text-[15px] leading-relaxed">
              Every organisation, number and finding in the sandbox is <b>fictional</b>, generated to
              show how the platform works. Nobody answered these questions.
            </p>
            <p className="mt-3 text-[15px] leading-relaxed">
              The correlations in it are artefacts of how it was generated — the formation-to-
              multiplication relationship in particular reads far more tightly than any real dataset
              would.
            </p>
            <p className="mt-3 text-[15px] leading-relaxed">
              <b>Please do not quote any number from the sandbox.</b> When there are real results they
              will be clearly marked as real, and they will carry their sample size.
            </p>
          </aside>
        </section>

        <section className="py-10">
          <Plate label="Pick an organisation" figure="Sandbox">
            <div className="mt-1 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
              {SANDBOX_ORGS.map((o) => (
                <div key={o.slug} className="border-t border-rule pt-3">
                  <p className="figcap">{o.country}</p>
                  <h3 className="mt-1.5 text-[19px] leading-snug">{o.name}</h3>
                  <p className="margin-note mt-1">{o.note}</p>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                    <Link
                      href={`/${o.slug}`}
                      className="tabular text-[10px] uppercase tracking-[0.14em] text-ink no-underline hover:underline"
                    >
                      Take the survey →
                    </Link>
                    <Link
                      href={`/${o.slug}/dashboard`}
                      className="tabular text-[10px] uppercase tracking-[0.14em] text-emerald no-underline hover:underline"
                    >
                      Open the dashboard →
                    </Link>
                  </div>
                </div>
              ))}
              <div className="border-t border-rule pt-3">
                <p className="figcap">Across all of them</p>
                <h3 className="mt-1.5 text-[19px] leading-snug">Collab Intelligence</h3>
                <p className="margin-note mt-1">
                  The pooled picture across the invented organisations — the fiction, aggregated only within itself.
                </p>
                <Link
                  href="/demo/intelligence"
                  className="tabular mt-3 inline-block text-[10px] uppercase tracking-[0.14em] text-emerald no-underline hover:underline"
                >
                  Read the global view →
                </Link>
              </div>
            </div>
          </Plate>

          <p className="figcap mt-6 leading-relaxed">
            Sample dashboards open without a sign-in because these organisations are flagged as demo
            data in the database itself. A real ministry&apos;s dashboard is only reachable after
            verifying against its own website domain — that gate is not a setting, it is how the
            platform is built.
          </p>
        </section>

        <section className="border-t-2 border-ink py-10">
          <div className="grid gap-6 sm:grid-cols-3">
            <Link href="/learn" className="border-t-2 border-ink pt-3 no-underline">
              <p className="figcap">Context</p>
              <p className="mt-2 text-[18px] leading-snug">Why this exists →</p>
            </Link>
            <Link href="/tour" className="border-t-2 border-ink pt-3 no-underline">
              <p className="figcap">Guided</p>
              <p className="mt-2 text-[18px] leading-snug">The walkthrough →</p>
            </Link>
            <Link href="/join" className="border-t-2 border-emerald pt-3 no-underline">
              <p className="figcap">Ready</p>
              <p className="mt-2 text-[18px] leading-snug text-emerald">Join a cohort →</p>
            </Link>
          </div>
        </section>
      </main>

      <Colophon />
    </>
  );
}
