import Link from "next/link";
import { Footer, GradientRule, Masthead } from "@/components/site/Chrome";
import Guarantees from "./Guarantees";
import { itemSetMinutes } from "@/lib/instrument";
import { BranchDiagram, Matrix, Plate } from "@/components/index/Figures";

export const metadata = {
  title: "Learn about the Jesus Index",
  description:
    "One instrument, three questions, four tiers. What the Jesus Index actually measures, in plain language.",
};

export default function LearnPage() {
  return (
    <>
      <Masthead />

      <main className="mx-auto max-w-5xl px-5">
        {/* standfirst */}
        <section className="grid gap-8 py-10 md:grid-cols-[1.4fr_1fr] md:gap-12">
          <div>
            <p className="figcap">The short version</p>
            <h1 className="mt-3 text-[38px] font-bold leading-[1.02] tracking-tight sm:text-[46px]">
              A shared instrument for measuring Jesus-following.
            </h1>
            <p className="mt-6 max-w-measure text-[18px] leading-relaxed text-ink-2">
              Your young people answer about {itemSetMinutes("full")} minutes of questions ({itemSetMinutes("j12")} for the J12-only version), under your ministry&apos;s name. You see where they are, from first hearing about Jesus to helping others follow Him. Because every ministry asks the same questions, comparisons with your country open as more join.
            </p>
          </div>
          <aside className="self-end">
            <p className="margin-note border-l-2 border-emerald pl-3">
              Why did the Collab build this, and how did it get here?{" "}
              <Link href="/our-story" className="text-emerald no-underline hover:underline">
                Read our story →
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
              <h2 className="mt-2 text-[27px] font-bold leading-tight tracking-tight">Three questions at four depths</h2>
              <p className="mt-4 max-w-measure text-[16px] leading-relaxed text-ink-2">
                The three questions are <b>what</b> we measure: Do they follow Jesus? Do they participate in His mission? Does their world look different? The four tiers are <b>how deep</b> it has gone: exposure, response, formation, and multiplication.
              </p>
              <p className="mt-4 max-w-measure text-[16px] leading-relaxed text-ink-2">
                Each survey question belongs to a box in the grid. Read across a row to see how far faith has gone in one area. Read down a column to see what your group has reached. Where the numbers drop between columns is where to focus.
              </p>
            </div>
            <Plate label="The J12 Model">
              <Matrix phrases />
            </Plate>
          </div>
        </section>

        {/* how someone moves through it */}
        <section className="py-10">
          <GradientRule className="mb-8" />
          <div className="grid gap-9 md:grid-cols-[1fr_1.7fr] md:gap-12">
            <div>
              <p className="figcap">How the survey itself works</p>
              <h2 className="mt-2 text-[27px] font-bold leading-tight tracking-tight">
                What you answer now determines what you get asked next
              </h2>
              <p className="mt-4 max-w-measure text-[16px] leading-relaxed text-ink-2">
                The first question asks where someone&apos;s walk with Jesus is. Those already following get one set of questions; those not yet following get another, worded for them. Both are measured across the same four depths.
              </p>
              <p className="mt-4 max-w-measure text-[16px] leading-relaxed text-ink-2">
                Answers from those still exploring go into a separate Exploration Index, with the same anonymity, and never change the main score. Then everyone answers a few questions about what has helped or held them back.
              </p>
            </div>
            <Plate label="The two branches">
              <BranchDiagram />
            </Plate>
          </div>
        </section>

        {/* three guarantees */}
        <section className="py-10">
          <GradientRule className="mb-8" />
          <p className="figcap">You might be wondering</p>
          <h2 className="mt-2 text-[27px] font-bold leading-tight tracking-tight">Three guarantees from us</h2>
          <p className="mt-2 text-[14px] text-ink-2">Tap on each to see more detail</p>
          <Guarantees
            items={[
              {
                n: "01",
                h: "Yours, under your name",
                p: "Young people see your ministry asking, with your logo and colour. You run consent your way, with us confirming your agreement to consent.",
                more: [
                  "Your name, colour and logo on every screen young people see.",
                  "Your own welcome and closing message, for each survey you send.",
                  "The Index appears only as a small credit in the footer.",
                  "Your results belong to your ministry.",
                ],
              },
              {
                n: "02",
                h: "Anonymous, always",
                p: "We never ask for a name, email, birthdate or exact location. You own gathering consent locally.",
                more: [
                  "We ask for an age range and a country.",
                  "IP addresses are never stored with answers.",
                  "No score appears for fewer than 10 people. No ministry ever sees one person's answers.",
                  "After 60 days, the exact time, the city, typed answers and the individual survey link are removed.",
                ],
              },
              {
                n: "03",
                h: "Free to run",
                p: "Running the Index costs nothing. Your standard report is included.",
                more: [
                  "No fee to join, to run as many surveys as you like, or to see your dashboard.",
                  "Your live dashboard and exports are included.",
                  "Advanced reports and consulting are paid. Collab members get them free.",
                ],
              },
            ]}
          />
          <p className="margin-note mt-7 border-l-2 border-rule pl-3">
            See the survey, your dashboard and the Collab view, step by step →{" "}
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
              { href: "/organisation", h: "What your ministry gets →", p: "Your results under your brand, with comparisons as your area grows." },
              { href: "/see-a-demo#global", h: "A global picture →", p: "How the global view works, with a demo preview." },
              { href: "/join", h: "Join the Index →", p: "For organizations, churches, and ministries." },
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
