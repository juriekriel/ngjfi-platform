import Link from "next/link";
import { Footer, Masthead } from "@/components/site/Chrome";
import JoinForm from "./JoinForm";
import CoverageMap from "@/components/site/CoverageMap";
import BeforeYouAsk from "./BeforeYouAsk";

export const metadata = {
  title: "Join the Index — The Jesus Index",
  description:
    "Free for every ministry, available now, and it stays free. Join in thirty seconds, set up your page, and try your survey link today.",
};

export default function JoinPage() {
  return (
    <>
      <Masthead edition="See Jesus-Following in your nextgen, today" />
      <main className="mx-auto max-w-5xl px-5">
        <section className="grid gap-10 border-b border-ink py-10 md:grid-cols-[1.15fr_1fr] md:gap-14">
          <div>
            <p className="figcap">For organisations and churches</p>
            <h1 className="mt-3 text-[36px] leading-[1.05] tracking-tight sm:text-[44px]">
              Join now. It&apos;s free, and it stays free.
            </h1>
            <p className="mt-5 max-w-measure text-[17px] leading-relaxed">
              The Index is available to every ministry today. Join in thirty seconds, set up your page with
              your own name and colour, and try your survey link straight away.
            </p>

            <h2 className="mt-10 text-[24px] font-bold leading-tight tracking-tight">What happens when you join</h2>
            <ol className="mt-5 space-y-7">
              {[
                {
                  n: "01",
                  h: "You're in today.",
                  p: "We send you a sign-in link. Add your logo, colour and welcome message, and try your own survey with a test link — answers on a test link are never kept.",
                },
                {
                  n: "02",
                  h: "Consent comes first.",
                  p: "Read the consent resource, confirm consent for your organisation, and again for each survey you send. Live answers start recording when the pilots open — we'll email you the day they do.",
                },
                {
                  n: "03",
                  h: "You get a person, not a help centre.",
                  p: "A thirty-minute call to set up your version and walk your team through reading the results. Comparisons with your city and country appear as enough ministries near you take part.",
                },
              ].map((r) => (
                <li key={r.n}>
                  <span aria-hidden className="block h-1 rounded-full bg-gradient-to-r from-emerald via-emerald-deep to-violet" />
                  <h3 className="mt-3 flex items-baseline gap-2.5 text-[18px] font-bold leading-snug text-ink">
                    <span className="tabular text-[12px] font-semibold tracking-[0.12em] text-emerald-deep">{r.n}</span>
                    {r.h}
                  </h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{r.p}</p>
                </li>
              ))}
            </ol>

            <div className="mt-10 border-t-2 border-ink pt-4">
              <p className="figcap">The fastest way in</p>
              <p className="mt-2 max-w-measure text-[16px] leading-relaxed">
                Your own results appear the moment you run the Index. A <b>national</b> comparison only
                appears once enough organisations in your country have taken part. So if you want to
                know how your work compares where you are, the quickest route is to bring the
                organisations you already work alongside.
              </p>
              <p className="margin-note mt-3 border-l-2 border-emerald pl-3">
                Coverage beats count. A signup in a country where four organisations are already
                committed is worth several times a signup in a country with none — because it is the
                one that unlocks the benchmark for everybody there.
              </p>
            </div>
          </div>

          <div className="md:sticky md:top-24 md:self-start">
            <JoinForm />
          </div>
        </section>

        <section className="py-10">
          <CoverageMap />
        </section>

        <section className="py-10">
          <h2 className="text-[28px] font-bold leading-tight tracking-tight">
            Before you ask
            <span aria-hidden className="mt-2 block h-1 w-24 rounded-full bg-gradient-to-r from-emerald to-violet" />
          </h2>
          <p className="mt-3 text-[14px] text-ink-2">Hover over a question — or tap it — to see the answer.</p>
          <BeforeYouAsk
            items={[
              ["Is this free?", "Running the Index is free, and it stays free. Your standard report is free. Advanced reports and consulting are paid — and free for Collab members."],
              ["Who owns our data?", "Your results belong to your ministry. Responses are anonymous: no one, including you, sees an individual young person's answers. Anonymous responses also pool into the shared picture — that is what makes comparison possible."],
              ["How do you handle under-18s?", "Consent, including parental consent, is gathered by your organisation, locally, and confirmed on the platform for your organisation and for every survey you send — no consent, no participation. We never hold identifiable data about a minor. The consent resource (jfindx.org/resources/consent) has the parent letter, the script and the rules country by country."],
              ["Can anyone see our results?", "No. Only your team, after verifying with your ministry's email domain. No other organisation sees your numbers, and you never see individual responses — only aggregates."],
              ["What languages does it work in?", "English and Spanish today, with the instrument built so any language can be added as configuration. Tell us what you need when you join — it shapes what we translate next."],
              ["What if we already run our own survey?", "Keep it. The Index is not a replacement for what you measure internally — it is the one part that is the same everywhere, so you can compare. Most organisations will run both."],
              ["Is the survey final?", "The version the pilots run is locked, so everyone's answers compare. Researchers keep improving it, and every change becomes a new version — results always stay tied to the version they were given under."],
              ["When can we start?", "Now: join, set up your page and try your test link today. Live answers start recording when the pilots open, and your city and country comparisons appear as enough ministries near you take part."],
            ] as [string, string][]}
          />
        </section>

        <section className="border-t-2 border-ink py-10">
          <p className="figcap">Not ready yet?</p>
          <div className="mt-5 grid gap-6 sm:grid-cols-3">
            <Link href="/learn" className="group no-underline">
              <span aria-hidden className="block h-1 rounded-full bg-gradient-to-r from-emerald via-emerald-deep to-violet" />
              <p className="mt-3 text-[17px] font-bold leading-snug text-ink group-hover:underline">What is the Index →</p>
              <p className="margin-note mt-1">The short version, two minutes.</p>
            </Link>
            <Link href="/tour" className="group no-underline">
              <span aria-hidden className="block h-1 rounded-full bg-gradient-to-r from-emerald via-emerald-deep to-violet" />
              <p className="mt-3 text-[17px] font-bold leading-snug text-ink group-hover:underline">See how it works →</p>
              <p className="margin-note mt-1">A guided walk through the real product.</p>
            </Link>
            <Link href="/#global" className="group no-underline">
              <span aria-hidden className="block h-1 rounded-full bg-gradient-to-r from-emerald via-emerald-deep to-violet" />
              <p className="mt-3 text-[17px] font-bold leading-snug text-ink group-hover:underline">A global picture →</p>
              <p className="margin-note mt-1">See where the movement stands first.</p>
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
