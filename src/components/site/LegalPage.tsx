import Link from "next/link";
import { Footer, Masthead } from "@/components/site/Chrome";

/**
 * Shared layout for /privacy and /terms. Both are DRAFTS pending review by
 * counsel and the Collab: the banner says so on the page itself, so a draft
 * can never be mistaken for a reviewed policy.
 */
export default function LegalPage({
  kicker,
  title,
  updated,
  sections,
}: {
  kicker: string;
  title: string;
  updated: string;
  sections: { heading: string; body: React.ReactNode }[];
}) {
  return (
    <>
      <Masthead />
      <main className="mx-auto max-w-3xl px-5 py-10">
        <p role="note" className="rounded-xl border border-vermillion/40 bg-vermillion/5 px-4 py-3 text-[14px] leading-relaxed text-ink">
          <b>Draft for review.</b> This page has not yet been reviewed by counsel or approved by the Next Gen Global
          Collab. It describes how the platform is built today; it is not yet a binding policy.
        </p>
        <p className="figcap mt-8">{kicker}</p>
        <h1 className="mt-2 text-[34px] leading-tight tracking-tight">{title}</h1>
        <p className="mt-2 text-[13px] text-muted">Last updated {updated}</p>
        {sections.map((s) => (
          <section key={s.heading} className="mt-8 border-t border-rule pt-6">
            <h2 className="text-[20px] font-bold tracking-tight">{s.heading}</h2>
            <div className="mt-3 flex flex-col gap-3 text-[15.5px] leading-relaxed text-ink-2">{s.body}</div>
          </section>
        ))}
        <p className="mt-10 text-[14px] text-ink-2">
          See also: <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms for organisations</Link>
        </p>
      </main>
      <Footer />
    </>
  );
}
