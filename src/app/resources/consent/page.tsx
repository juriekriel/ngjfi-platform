import { Footer, Masthead } from "@/components/site/Chrome";
import PrintControls from "@/components/site/PrintControls";
import ConsentResource, { CONSENT_RESOURCE_VERSION } from "@/content/consent/ConsentResource";

export const metadata = {
  title: "Consent — The Jesus Index",
  description:
    "Why consent matters, how it works on the Index, the rules in 21 countries, and the materials to do it well: information for young people, a parent letter and form, a script and a checklist.",
};

export default function ConsentResourcePage() {
  return (
    <>
      <div className="no-print"><Masthead /></div>
      <main className="mx-auto max-w-4xl px-5 py-10">
        <p role="note" className="rounded-xl border border-vermillion/40 bg-vermillion/5 px-4 py-3 text-[14px] leading-relaxed text-ink">
          <b>Draft for review.</b> This resource has not yet been reviewed by counsel or approved by the Next Gen Global
          Collab. It is a reference, not legal advice.
        </p>
        <p className="figcap mt-8">Consent · version {CONSENT_RESOURCE_VERSION}</p>
        <h1 className="mt-2 text-[34px] leading-tight tracking-tight">Consent: why it matters and how it works</h1>
        <div className="mt-5"><PrintControls /></div>
        <div className="mt-6"><ConsentResource /></div>
      </main>
      <div className="no-print"><Footer /></div>
    </>
  );
}
