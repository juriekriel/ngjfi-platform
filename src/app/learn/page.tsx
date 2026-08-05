import Link from "next/link";
import { Colophon, Masthead } from "@/components/site/Chrome";
import { Matrix, Plate } from "@/components/index/Figures";
import LearnExplorer from "./LearnExplorer";
import { NAMING, OPEN_QUESTIONS } from "@/data/history";

export const metadata = {
  title: "Why the Jesus Index exists — The Jesus Index",
  description:
    "The whole story: the question the Collab could not answer, the fifty-country study that collapsed, the pivot to a shared standard, and the people who carry it.",
};

/** The DFW pilot — the one real finding the project has. Cited, never synthetic. */
const DFW = [
  { label: "Affirm Jesus is the Son of God", value: 97 },
  { label: "Identify as followers of Jesus", value: 93 },
  { label: "Pray daily", value: 64 },
  { label: "Being mentored by someone", value: 48 },
  { label: "Attend church weekly", value: 36 },
  { label: "Mentoring someone else", value: 34 },
  { label: "Read the Bible daily", value: 26 },
];

export default function LearnPage() {
  return (
    <>
      <Masthead edition="§ Learn · the record · compiled August 2026" />

      <main className="mx-auto max-w-5xl px-5">
        {/* standfirst */}
        <section className="grid gap-8 border-b border-ink py-10 md:grid-cols-[1.5fr_1fr] md:gap-12">
          <div>
            <p className="figcap">The long version</p>
            <h1 className="mt-3 text-[38px] leading-[1.02] tracking-tight sm:text-[46px]">
              A coalition tried to buy a picture of youth faith.
              <br />
              It ended up <span className="italic">building the measure</span> and giving it away.
            </h1>
            <p className="mt-6 max-w-measure text-[18px] leading-relaxed text-ink-2">
              That sentence is the whole through-line, and it took about eighteen months of expensive
              discovery to earn. What follows is the record — including the parts where the plan
              failed, because the shape of the thing now only makes sense against what it stopped
              being.
            </p>
          </div>
          <aside className="self-end">
            <p className="margin-note border-l-2 border-emerald pl-3">
              Six eras. Open one to read the beats, the arguments, and what each decision changed.
              Nothing here is marketing copy — it is compiled from the working documents, the meeting
              notes and the build sessions.
            </p>
          </aside>
        </section>

        {/* the explorable record */}
        <LearnExplorer />

        {/* the one real finding */}
        <section className="border-t-2 border-ink py-10">
          <div className="grid gap-8 md:grid-cols-[1fr_1.4fr] md:gap-12">
            <div>
              <p className="figcap">The evidence that started it</p>
              <h2 className="mt-2 text-[27px] leading-tight">Belief outruns practice.</h2>
              <p className="mt-4 max-w-measure text-[16px] leading-relaxed text-ink-2">
                The Dallas–Fort Worth pilot is the only real data the project has, and it did the job
                a pilot is supposed to do: it found a gap nobody could argue with. Near-universal
                assent to the beliefs. Barely a quarter reading scripture daily. And a third fewer
                people mentoring someone than being mentored.
              </p>
              <p className="mt-4 max-w-measure text-[16px] leading-relaxed text-ink-2">
                That second gap — <b>the mentorship deficit</b> — is arithmetic with a horizon on it. A
                movement where fewer people reproduce than are being formed does not compound. It is
                also precisely why <i>multiplication</i> is a tier of its own rather than a footnote.
              </p>
              <p className="margin-note mt-5 border-l-2 border-rule pl-3">
                DFW pilot, Centiment panel, under-30s, 2025. Real data, cited — unlike every other
                figure on this site, which is synthetic and labelled as such.
              </p>
            </div>
            <div>
              <Plate label="DFW pilot · under-30s identifying as followers" figure="Fig. 04 · real data">
                <table className="w-full text-left">
                  <caption className="sr-only">Dallas–Fort Worth pilot results</caption>
                  <tbody>
                    {DFW.map((r) => (
                      <tr key={r.label} className="border-b border-rule">
                        <th scope="row" className="w-[46%] py-2.5 pr-3 text-left text-[14px] font-normal leading-snug">
                          {r.label}
                        </th>
                        <td className="py-2.5 pr-3">
                          <div className="h-[9px] w-full border-b border-rule bg-paper-deep">
                            <div
                              className="h-full"
                              style={{ width: `${r.value}%`, background: r.value >= 60 ? "#35639C" : "#B5451B" }}
                            />
                          </div>
                        </td>
                        <td className="tabular w-10 py-2.5 text-right text-[14px]">{r.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Plate>
              <p className="figcap mt-3 leading-relaxed">
                Navy is level. Vermillion marks the practices that fall away — colour only ever means
                something.
              </p>
            </div>
          </div>
        </section>

        {/* the model */}
        <section className="border-t-2 border-ink py-10">
          <p className="figcap">What it actually measures</p>
          <h2 className="mt-2 text-[27px] leading-tight">Three questions × four tiers.</h2>
          <div className="mt-5 grid gap-8 md:grid-cols-[1fr_1.6fr] md:gap-12">
            <div>
              <p className="max-w-measure text-[16px] leading-relaxed text-ink-2">
                The three questions are <i>what</i> we measure. The four tiers are <i>how deep it has
                gone</i>. Every item in the instrument carries exactly one of each, which is what makes
                a single four-minute survey readable through two completely different lenses.
              </p>
              <p className="mt-4 max-w-measure text-[16px] leading-relaxed text-ink-2">
                Read across a row and you learn how far one question has travelled. Read down a column
                and you learn what an entire cohort has and has not yet reached. The narrowing between
                columns is the diagnosis.
              </p>
              <p className="margin-note mt-5 border-l-2 border-rule pl-3">
                This grid is rendered by the same component the live dashboard uses — with plain
                language in the cells instead of scores. There is no second, prettier version of the
                model kept for marketing.
              </p>
            </div>
            <Plate label="The J12 · the model" figure="Fig. 05">
              <Matrix phrases />
            </Plate>
          </div>
        </section>

        {/* naming */}
        <section className="border-t-2 border-ink py-10">
          <p className="figcap">The nameplate</p>
          <h2 className="mt-2 text-[27px] leading-tight">
            Named so it never has to be renamed.
          </h2>
          <p className="mt-4 max-w-measure text-[16px] leading-relaxed text-ink-2">
            Rebrands cost trust precisely when a longitudinal measure is accruing it. The Index begins
            with the next generation; it does not end there — so no generation appears in the name.
            Editions carry the cohort instead.
          </p>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left">
              <thead>
                <tr className="figcap">
                  <th scope="col" className="border-b border-ink pb-2 pr-4 font-normal">Layer</th>
                  <th scope="col" className="border-b border-ink pb-2 pr-4 font-normal">Name</th>
                  <th scope="col" className="border-b border-ink pb-2 font-normal">Role</th>
                </tr>
              </thead>
              <tbody>
                {NAMING.map((r) => (
                  <tr key={r.layer} className="border-b border-rule align-top">
                    <td className="tabular py-2.5 pr-4 text-[10px] uppercase tracking-[0.14em] text-muted">
                      {r.layer}
                    </td>
                    <td className="py-2.5 pr-4 text-[15px]">{r.name}</td>
                    <td className="py-2.5 text-[14px] leading-snug text-ink-2">{r.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* integrity */}
        <section id="integrity" className="-mx-5 mt-4 bg-ink px-5 py-12 text-paper">
          <div className="mx-auto max-w-5xl">
            <p className="figcap text-muted">The line that governs everything</p>
            <h2 className="mt-3 text-[30px] leading-[1.15] text-paper sm:text-[36px]">
              We will never claim to speak for a nation.
            </h2>
            <div className="mt-6 grid max-w-4xl gap-x-10 gap-y-4 text-[16px] leading-relaxed text-rule md:grid-cols-2">
              <p>
                Crowdsourced data is only responsible if you are honest about what it is. Every score
                on this platform carries its sample size. No benchmark appears for a country until
                enough people there have completed the Index.
              </p>
              <p>
                No organisation ever sees another organisation&apos;s results. No organisation ever sees
                an individual response — not even its own respondents&apos;. There are no cross-org
                league tables, and there will not be.
              </p>
            </div>
            <p className="mt-6 max-w-measure text-[15px] leading-relaxed text-muted">
              This is also why every figure on this site is currently marked as synthetic. A demo
              screenshot circulating as a real finding would cost more than a slower launch does.
            </p>
          </div>
        </section>

        {/* open questions */}
        <section className="border-b border-ink py-10">
          <p className="figcap">Still unsettled</p>
          <h2 className="mt-2 text-[27px] leading-tight">Questions we have not answered.</h2>
          <p className="mt-3 max-w-measure text-[16px] leading-relaxed text-ink-2">
            Publishing these is deliberate. A measurement standard that hides its open problems is not
            a standard, it is a product. If you have a view on any of them, we want it.
          </p>
          <ol className="mt-7 space-y-6">
            {OPEN_QUESTIONS.map((o, i) => (
              <li key={o.q} className="grid gap-2 border-t border-rule pt-3 md:grid-cols-[2.5rem_1fr_1.2fr] md:gap-6">
                <span className="tabular text-[11px] tracking-[0.16em] text-muted">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="text-[17px] leading-snug">{o.q}</h3>
                <p className="text-[15px] leading-relaxed text-ink-2">{o.why}</p>
              </li>
            ))}
          </ol>
          <p className="mt-8 max-w-measure text-[16px] italic leading-relaxed">
            Clay to be moulded — not a vase to be baked.
          </p>
        </section>

        {/* onward */}
        <section className="py-10">
          <div className="grid gap-4 sm:grid-cols-3">
            <Link href="/tour" className="border-t-2 border-ink pt-3 no-underline">
              <p className="figcap">Next</p>
              <p className="mt-2 text-[18px] leading-snug">See how it will work →</p>
              <p className="margin-note mt-1">A guided walk, one beat at a time.</p>
            </Link>
            <Link href="/demo" className="border-t-2 border-ink pt-3 no-underline">
              <p className="figcap">Or</p>
              <p className="mt-2 text-[18px] leading-snug">Explore the sandbox →</p>
              <p className="margin-note mt-1">The full platform, invented data.</p>
            </Link>
            <Link href="/join" className="border-t-2 border-emerald pt-3 no-underline">
              <p className="figcap">When you are ready</p>
              <p className="mt-2 text-[18px] leading-snug text-emerald">Join a cohort →</p>
              <p className="margin-note mt-1">For organisations and churches.</p>
            </Link>
          </div>
        </section>
      </main>

      <Colophon />
    </>
  );
}
