import { Colophon, Masthead } from "@/components/site/Chrome";
import JoinForm from "./JoinForm";

export const metadata = {
  title: "Join a cohort — The Jesus Index",
  description:
    "We open in small groups, country by country, so each one reaches the sample size a benchmark needs. Tell us where you work and we'll tell you which cohort you fit.",
};

export default function JoinPage() {
  return (
    <>
      <Masthead edition="§ Join · cohorts are forming" />
      <main className="mx-auto max-w-5xl px-5">
        <section className="grid gap-10 border-b border-ink py-10 md:grid-cols-[1.15fr_1fr] md:gap-14">
          <div>
            <p className="figcap">Door 04 · for organisations and churches</p>
            <h1 className="mt-3 text-[36px] leading-[1.05] tracking-tight sm:text-[44px]">
              Cohorts are forming now.
            </h1>
            <p className="mt-5 max-w-measure text-[17px] leading-relaxed">
              Small groups, country by country, each one large enough to give you a benchmark worth
              having. Tell us where you work and we will tell you which cohort you fit.
            </p>

            <h2 className="mt-10 text-[21px] leading-tight">Why there is a list at all</h2>
            <p className="mt-2 max-w-measure text-[16px] leading-relaxed text-ink-2">
              Three reasons, none of them marketing.
            </p>
            <ol className="mt-5 space-y-5">
              {[
                {
                  n: "01",
                  h: "The instrument is not locked yet.",
                  p: "A panel of standardised-measurement researchers is still tightening the questions. Data gathered before the lock cannot be cleanly compared to data gathered after it — so early cohorts stay small on purpose.",
                },
                {
                  n: "02",
                  h: "A benchmark needs numbers.",
                  p: "A score on its own means very little; it means something next to your country and the globe. We do not publish a benchmark for a country until enough people there have completed the Index — so we open in country clusters, not first-come-first-served.",
                },
                {
                  n: "03",
                  h: "Every first-cohort organisation gets a person.",
                  p: "Not a help centre. A thirty-minute call to set up your white-labelled version and walk your team through reading the results. That caps how many we can take at a time.",
                },
              ].map((r) => (
                <li key={r.n} className="grid grid-cols-[2.2rem_1fr] gap-3 border-t border-rule pt-3">
                  <span className="tabular text-[11px] tracking-[0.16em] text-muted">{r.n}</span>
                  <div>
                    <h3 className="text-[17px] leading-snug">{r.h}</h3>
                    <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{r.p}</p>
                  </div>
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
          <h2 className="text-[24px] leading-tight">Before you ask</h2>
          <dl className="mt-6 grid gap-x-10 gap-y-6 md:grid-cols-2">
            {[
              ["Is this free?", "Running the Index is free, and it stays free. Your standard report is free. Advanced reports and consulting are paid — and free for Collab members."],
              ["Who owns our data?", "You do. You run the Index under your own brand, with your own consent process, and your results are yours to keep. Anonymised responses also pool into the shared picture — that is what makes comparison possible."],
              ["How do you handle under-18s?", "Consent, including parental consent, is handled by your organisation, locally, under your own rules. We never hold identifiable data about a minor centrally. That is not a setting; it is how the platform is built."],
              ["Can anyone see our results?", "No. Only your team, after verifying with your ministry's email domain. No other organisation sees your numbers, and you never see individual responses — only aggregates."],
              ["What languages does it work in?", "English and Spanish today, with the instrument built so any language can be added as configuration. Tell us what you need when you join — it shapes what we translate next."],
              ["What if we already run our own survey?", "Keep it. The Index is not a replacement for what you measure internally — it is the one part that is the same everywhere, so you can compare. Most organisations will run both."],
              ["Is the survey final?", "No. A panel of standardised-measurement researchers is still tightening it. That is precisely why early cohorts are small, and why joining now means shaping it."],
              ["When does it launch?", "Cohorts open in sequence, starting with the pilot countries. Join the list and we will tell you which one you fit and when it opens."],
            ].map(([q, a]) => (
              <div key={q} className="border-t border-rule pt-3">
                <dt className="text-[17px] leading-snug">{q}</dt>
                <dd className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{a}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>
      <Colophon />
    </>
  );
}
