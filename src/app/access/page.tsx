import Link from "next/link";
import { Colophon, Masthead } from "@/components/site/Chrome";
import AccessForm from "./AccessForm";

export const metadata = {
  title: "Early access — The Jesus Index",
  description:
    "For the people building it: the live roadmap with real dates, the open decisions, the current instrument version and the repo. Approved individually.",
};

export default function AccessPage() {
  return (
    <>
      <Masthead edition="§ Early access · approved individually · season one not yet open" />
      <main className="mx-auto max-w-5xl px-5">
        <section className="grid gap-10 border-b border-ink py-10 md:grid-cols-[1.15fr_1fr] md:gap-14">
          <div>
            <p className="figcap">Door 05 · for those building it</p>
            <h1 className="mt-3 text-[36px] leading-[1.05] tracking-tight sm:text-[44px]">
              The build room.
            </h1>
            <p className="mt-5 max-w-measure text-[17px] leading-relaxed">
              Everything the public page deliberately leaves out. The roadmap with{" "}
              <b>real dates</b> on it. The decisions still open and who owns each one. The current
              instrument version, item by item, with its change log. The repo, the migrations and the
              runbook.
            </p>

            <h2 className="mt-9 text-[21px] leading-tight">Why it is gated</h2>
            <p className="mt-2 max-w-measure text-[16px] leading-relaxed text-ink-2">
              Not secrecy. A public date that slips is a credibility event with thirty-plus partner
              organisations; the same slip discussed inside the build room is just a Tuesday. So the
              public page uses sequence — <i>cohorts are forming</i> — and the calendar lives in here.
            </p>
            <p className="mt-4 max-w-measure text-[16px] leading-relaxed text-ink-2">
              There is a second reason. Until the research panel locks the instrument,{" "}
              <b>what you would see in here is still changing weekly</b>. Access is approved
              individually so that everyone reading it knows what stage it is at, and season one has to
              be signed off before anyone interacts with how the Index will actually run.
            </p>

            <div className="mt-9 border-t-2 border-ink pt-4">
              <p className="figcap">What is behind the door</p>
              <ul className="mt-3 space-y-2.5">
                {[
                  ["Now", "Current phase, what is in flight, who holds what."],
                  ["Roadmap", "Phases with owners, real dates and status. The internal truth."],
                  ["Open decisions", "The question, the options, who decides, by when."],
                  ["The instrument", "Current version, every item, the change log, how to propose a change."],
                  ["Coverage", "Real waitlist counts, cluster assembly, who is ready to invite."],
                  ["Building", "Repo, CI, deploy previews, database, the runbook."],
                ].map(([h, p]) => (
                  <li key={h} className="grid grid-cols-[7.5rem_1fr] gap-3 border-b border-rule pb-2.5">
                    <span className="tabular text-[10px] uppercase tracking-[0.14em] text-muted">{h}</span>
                    <span className="text-[15px] leading-snug text-ink-2">{p}</span>
                  </li>
                ))}
              </ul>
            </div>

            <p className="margin-note mt-7 border-l-2 border-rule pl-3">
              If you are here to run the Index rather than build it, you want{" "}
              <Link href="/join" className="underline decoration-rule underline-offset-2">
                door 04
              </Link>{" "}
              instead — that is the one that opens.
            </p>
          </div>

          <div className="md:sticky md:top-24 md:self-start">
            <AccessForm />
          </div>
        </section>
      </main>
      <Colophon />
    </>
  );
}
