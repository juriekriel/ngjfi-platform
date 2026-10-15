import Link from "next/link";
import { Footer, Masthead } from "@/components/site/Chrome";
import JoinForm from "./JoinForm";
import CoverageMap from "@/components/site/CoverageMap";
import BeforeYouAsk from "./BeforeYouAsk";

export const metadata = {
  title: "Join now · The Jesus Index",
  description:
    "Free for every ministry, available now, and it stays free. Join in thirty seconds, set up your page, and try your survey link today.",
};

export default function JoinPage() {
  return (
    <>
      <Masthead edition="See Jesus-Following in your young people, today" />
      <main className="mx-auto max-w-5xl px-5">
        <section className="grid gap-10 border-b border-ink py-10 md:grid-cols-[1.15fr_1fr] md:gap-14">
          <div>
            <p className="figcap">For organizations, churches, and ministries</p>
            <h1 className="mt-3 text-[36px] leading-[1.05] tracking-tight sm:text-[44px]">
              Here&apos;s how to start your own Index
            </h1>
            <p className="mt-5 max-w-measure text-[17px] leading-relaxed">
              Join in 30 seconds. Add your name and colour, then test your survey link the same day. Live surveys are open and ready to share with your people.
            </p>

            <h2 className="mt-10 text-[24px] font-bold leading-tight tracking-tight">What happens when you join</h2>
            <ol className="mt-5 space-y-7">
              {[
                {
                  n: "01",
                  h: "Set up your page.",
                  p: "We email you a sign-in link. Add your logo, colour and welcome message, then try the survey yourself. Test answers are never saved.",
                },
                {
                  n: "02",
                  h: "Confirm consent.",
                  p: "Read the consent guide and confirm consent for your ministry, then again for each survey you send. Live answers start recording when the pilots open.",
                },
                {
                  n: "03",
                  h: "Talk to a person (optional).",
                  p: "Book a 30-minute call to set up your survey and learn to read your results with your team. Comparisons with your city and country open as enough ministries near you take part.",
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
              <p className="figcap">Want comparisons sooner?</p>
              <p className="mt-2 max-w-measure text-[16px] leading-relaxed">
                Your own results appear as soon as your young people answer. Country comparisons open once enough ministries in that country take part. The quickest way to get one is to invite the ministries you already work with to join also.
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
          <p className="mt-3 text-[14px] text-ink-2">Tap a question to see the answer.</p>
          <BeforeYouAsk
            items={[
              ["Is this free?", "Yes. Running the Index and your standard report are free. Advanced reports and consulting are paid; Collab members get them free."],
              ["Who owns our data?", "Your ministry owns its results. Answers are anonymous, so nobody sees one young person's answers, including you. Anonymous answers also feed the shared picture, which is what makes comparisons possible."],
              ["How do you handle under-18s?", "Your ministry gathers consent locally, including from parents, and confirms it on the platform for every survey. No consent, no survey. We never hold identifying data about anyone under 18. The consent guide (jfindx.org/resources/consent) has a parent letter, a script, and the rules for each country (as much as we can verify it)."],
              ["Can anyone see our results?", "No. Only your team, after verifying with your ministry's email address. No other ministry sees your numbers, and you see totals, never one person's answers."],
              ["What languages does it work in?", "English and Spanish today. New languages can be added without rebuilding anything. Tell us what you need when you join; it shapes what we translate next."],
              ["What if we already run our own survey?", "Keep it. Your survey measures what's specific to you. The Index asks the same questions everywhere, so you can compare. Most ministries will run both."],
              ["Is the survey final?", "The current survey version is fixed, so everyone's answers compare to the same baseline of questions. Researchers will keep improving it. Each change becomes a new version, and your results stay tied to the one your young people answered."],
              ["When can we start?", "Today: join, set up your page and test your link. Live answers will start recording and country comparisons open as enough ministries near you take part."],
            ] as [string, string][]}
          />
        </section>

        <section className="border-t-2 border-ink py-10">
          <p className="figcap">Want to learn more about the Index?</p>
          <div className="mt-5 grid gap-6 sm:grid-cols-3">
            <Link href="/learn" className="group no-underline">
              <span aria-hidden className="block h-1 rounded-full bg-gradient-to-r from-emerald via-emerald-deep to-violet" />
              <p className="mt-3 text-[17px] font-bold leading-snug text-ink group-hover:underline">What it measures →</p>
              <p className="margin-note mt-1">Read more about the Jesus Index.</p>
            </Link>
            <Link href="/tour" className="group no-underline">
              <span aria-hidden className="block h-1 rounded-full bg-gradient-to-r from-emerald via-emerald-deep to-violet" />
              <p className="mt-3 text-[17px] font-bold leading-snug text-ink group-hover:underline">Take the tour →</p>
              <p className="margin-note mt-1">A step-by-step walk through the Index itself.</p>
            </Link>
            <Link href="/see-a-demo#global" className="group no-underline">
              <span aria-hidden className="block h-1 rounded-full bg-gradient-to-r from-emerald via-emerald-deep to-violet" />
              <p className="mt-3 text-[17px] font-bold leading-snug text-ink group-hover:underline">A global picture →</p>
              <p className="margin-note mt-1">How the global view works using a demo preview.</p>
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
