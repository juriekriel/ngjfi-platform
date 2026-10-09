import Link from "next/link";
import { Footer, GradientRule, Masthead } from "@/components/site/Chrome";
import { BranchDiagram, Matrix, Plate } from "@/components/index/Figures";

export const metadata = {
  title: "What is the Index — The Jesus Index",
  description:
    "One instrument, three questions, four tiers. What the Jesus Index actually measures, in plain language.",
};

export default function LearnPage() {
  return (
    <>
      <Masthead />

      <main className="mx-auto max-w-5xl px-5">
        {/* standfirst */}
        <section className="grid gap-8 border-b border-ink py-10 md:grid-cols-[1.4fr_1fr] md:gap-12">
          <div>
            <p className="figcap">The short version</p>
            <h1 className="mt-3 text-[38px] font-bold leading-[1.02] tracking-tight sm:text-[46px]">
              A shared instrument for measuring Jesus-following, given away for free.
            </h1>
            <p className="mt-6 max-w-measure text-[18px] leading-relaxed text-ink-2">
              About six minutes. Run under your own organisation&apos;s name, telling you where
              your people actually are on the journey — and, because hundreds of other organisations
              run the same shared instrument, how that compares to your country and the world.
            </p>
          </div>
          <aside className="self-end">
            <p className="margin-note border-l-2 border-emerald pl-3">
              Want the full story — why it exists, and how it got here?{" "}
              <Link href="/our-story" className="text-emerald no-underline hover:underline">
                Read the long version →
              </Link>
            </p>
          </aside>
        </section>

        {/* the model */}
        <section className="py-10">
          <GradientRule className="mb-8" />
          <div className="grid gap-9 md:grid-cols-[1fr_1.7fr] md:gap-12">
            <div>
              <p className="figcap">What it measures</p>
              <h2 className="mt-2 text-[27px] font-bold leading-tight tracking-tight">Three questions × four tiers.</h2>
              <p className="mt-4 max-w-measure text-[16px] leading-relaxed text-ink-2">
                Three questions — <b>what</b> we measure: do they follow Jesus, do they participate in
                his mission, does their world look different. Four tiers — <b>how deep it has gone</b>:
                exposure, response, formation, multiplication.
              </p>
              <p className="mt-4 max-w-measure text-[16px] leading-relaxed text-ink-2">
                Every item in the survey carries exactly one question and one tier. Read across a row
                to see how far one question has travelled; read down a column to see what a whole
                group has and has not yet reached. The narrowing between columns is the diagnosis.
              </p>
            </div>
            <Plate label="The J12 · the model" figure="Fig. 01">
              <Matrix phrases />
            </Plate>
          </div>
        </section>

        {/* how someone moves through it */}
        <section className="py-10">
          <GradientRule className="mb-8" />
          <div className="grid gap-9 md:grid-cols-[1fr_1.7fr] md:gap-12">
            <div>
              <p className="figcap">How someone moves through it</p>
              <h2 className="mt-2 text-[27px] font-bold leading-tight tracking-tight">
                Nobody is asked to answer as something they are not.
              </h2>
              <p className="mt-4 max-w-measure text-[16px] leading-relaxed text-ink-2">
                One opening question sorts a respondent onto one of two honest tracks — already
                following Jesus, or not yet. From there both tracks are asked across the same four
                tiers, worded for where they actually are, so the depth of the journey is always
                measured the same way.
              </p>
              <p className="mt-4 max-w-measure text-[16px] leading-relaxed text-ink-2">
                Someone exploring never contributes to the official Index — their answers feed a
                separate Exploration Index instead, kept apart from it entirely. At the end, anyone
                willing can add a few optional questions about their own journey.
              </p>
            </div>
            <Plate label="The two tracks · the model" figure="Fig. 02">
              <BranchDiagram />
            </Plate>
          </div>
        </section>

        {/* three guarantees */}
        <section className="py-10">
          <GradientRule className="mb-8" />
          <p className="figcap">How it runs</p>
          <h2 className="mt-2 text-[27px] font-bold leading-tight tracking-tight">Three guarantees</h2>
          <div className="mt-6 grid gap-8 sm:grid-cols-3">
            {[
              {
                n: "01",
                h: "Yours, under your name",
                p: "Your logo, your colour, your consent process. To a young person it is their youth group asking — because it is.",
              },
              {
                n: "02",
                h: "Anonymous, always",
                p: "No name, no email, no precise location, no birthdate. Consent — including parental consent — is handled by you, locally.",
              },
              {
                n: "03",
                h: "Free, permanently",
                p: "Running the Index costs nothing, and it stays that way. Your standard report is included.",
              },
            ].map((c) => (
              <div key={c.n}>
                <GradientRule />
                <h3 className="mt-3 flex items-baseline gap-2.5 text-[19px] font-bold leading-snug text-ink">
                  <span className="tabular text-[12px] font-semibold tracking-[0.12em] text-emerald-deep">{c.n}</span>
                  {c.h}
                </h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{c.p}</p>
              </div>
            ))}
          </div>
          <p className="margin-note mt-7 border-l-2 border-rule pl-3">
            Full detail on how the survey adapts, what lands on your dashboard live, and what
            the whole coalition sees at once →{" "}
            <Link href="/tour" className="text-emerald no-underline hover:underline">
              How it works
            </Link>
            .
          </p>
        </section>

        {/* onward — the same look as the foot of the join page, same destinations as before */}
        <section className="py-10">
          <p className="figcap">Where next?</p>
          <div className="mt-5 grid gap-6 sm:grid-cols-3">
            {[
              { href: "/organisation", h: "What you get out of it →", p: "A diagnosis, benchmarked, under your own brand." },
              { href: "/#global", h: "A global picture →", p: "Where momentum is strong, and where it isn't yet." },
              { href: "/join", h: "Join the Index →", p: "For organisations and churches." },
            ].map((c) => (
              <Link key={c.href} href={c.href} className="group no-underline">
                <GradientRule />
                <p className="mt-3 text-[17px] font-bold leading-snug text-ink group-hover:underline">{c.h}</p>
                <p className="margin-note mt-1">{c.p}</p>
              </Link>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
