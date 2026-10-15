import { GradientRule } from "@/components/site/Chrome";

/**
 * The front page's pitch documents (Oct 2026: "create pitch docs/PDFs on the
 * homepage"). Static files in public/share/, built by
 * scripts/build-share-docs.py from what the platform actually does — no
 * invented statistics — so they download instantly, work offline once cached
 * and never depend on the database. The dashboard's "Share about the Jesus
 * Index" panel offers the same files (src/components/index/ShareJfindx.tsx).
 */
export const PITCH_DOCS = [
  {
    href: "/share/JesusIndex-leadership-pitch.pdf",
    kicker: "Leadership pitch · 9 pages · PDF",
    title: "Why a shared measure, and why this matters now.",
    body: "The case for the Index: why measuring Jesus-following matters, how it works, who does what, and what this means for the future.",
    lead: true,
  },
  {
    href: "/share/JesusIndex-two-pager.pdf",
    kicker: "Two-pager · PDF",
    title: "What the Jesus Index is, and how it works",
    body: "The three questions and four tiers, what a young person answers, what your ministry sees, and how answers stay anonymous. Specifically written for a board or partner.",
  },
  {
    href: "/share/JesusIndex-pitch-and-demo.pdf",
    kicker: "Pitch & demo guide · 8 pages · PDF",
    title: "Walk someone through it",
    body: "Why it exists, how to use it, and step-by-step notes for a leaders' meeting or a call.",
  },
] as const;

export default function PitchDocs() {
  return (
    <section id="pitch" aria-labelledby="pitch-heading" className="scroll-mt-6 py-12">
      <GradientRule className="mb-10" />
      <p className="figcap">Pitch documents</p>
      <h2 id="pitch-heading" className="mt-2 text-[28px] font-bold leading-tight tracking-tight sm:text-[32px]">
        Take it to your team.
      </h2>
      <p className="mt-3 max-w-measure text-[16.5px] leading-relaxed text-ink-2">
        Download, print, or forward. These explain the Index in detail, and can be downloaded with one click.
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {PITCH_DOCS.map((f) => (
          <a
            key={f.href}
            href={f.href}
            download
            className={`group flex flex-col gap-2 rounded-2xl border p-5 no-underline shadow-sm transition-colors ${
              "lead" in f && f.lead ? "border-ink bg-ink text-paper hover:bg-ink/90" : "border-rule bg-plate text-ink hover:border-ink"
            }`}
          >
            <span className={`font-mono text-[11px] uppercase tracking-[0.06em] ${"lead" in f && f.lead ? "text-paper/70" : "text-ink-2"}`}>
              {f.kicker}
            </span>
            <span className="text-[19px] font-bold leading-snug tracking-tight">{f.title}</span>
            <span className={`text-[14px] leading-relaxed ${"lead" in f && f.lead ? "text-paper/80" : "text-ink-2"}`}>{f.body}</span>
            <span className={`mt-auto pt-3 text-[14px] font-semibold group-hover:underline ${"lead" in f && f.lead ? "text-emerald" : "text-violet-deeper"}`}>
              Download PDF ↓
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
