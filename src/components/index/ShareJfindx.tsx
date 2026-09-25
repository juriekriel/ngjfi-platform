"use client";

/**
 * Share about the JFINDX — what an organisation hands to a partner, a board
 * or a neighbouring ministry. Three downloads (static files in public/share/,
 * so they work offline once cached and never depend on the database) plus a
 * short blurb to paste into an email or a WhatsApp group.
 */
import { useState } from "react";

const FILES = [
  {
    href: "/share/JFINDX-two-pager.pdf",
    kicker: "Two pages · PDF",
    title: "What the JFINDX is, and how it works",
    body: "The three questions and four tiers, what a young person does, what a ministry sees, and the privacy promises — for a board or a partner.",
  },
  {
    href: "/share/JFINDX-pitch-and-demo.pdf",
    kicker: "Pitch & demo · PDF",
    title: "Walk someone through it",
    body: "Why it exists, how to use it, and step-by-step demo instructions — for a leaders' meeting or a call.",
  },
  {
    href: "/share/jfindx-qr.png",
    kicker: "QR code · PNG",
    title: "Point people to jfindx.org",
    body: "A high-resolution QR code for slides, posters and newsletters. It opens the public home page, not your survey.",
  },
];

export default function ShareJfindx({ orgName }: { orgName: string }) {
  const blurb = `${orgName} is using the JFINDX — a seven-minute, anonymous survey that shows how young people are following Jesus, and where they stop moving. It's free for ministries and built with the Next Gen Global Collab. See jfindx.org.`;
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 lg:grid-cols-3">
        {FILES.map((f) => (
          <a key={f.href} href={f.href} download className="group flex flex-col gap-2 rounded-2xl border border-rule bg-plate p-5 text-ink no-underline shadow-sm hover:border-ink">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">{f.kicker}</span>
            <span className="text-[18px] font-bold leading-snug tracking-tight">{f.title}</span>
            <span className="text-[13.5px] leading-relaxed text-ink-2">{f.body}</span>
            <span className="mt-auto pt-2 text-[14px] font-semibold text-violet-deeper group-hover:underline">Download →</span>
          </a>
        ))}
      </div>
      <section className="rounded-2xl border border-rule bg-plate p-5 shadow-sm">
        <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">A few lines to paste anywhere</p>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed">{blurb}</p>
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(blurb);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="mt-3 rounded-lg bg-gradient-to-r from-violet via-violet-deep to-violet-deeper px-4 py-2.5 text-[14px] font-semibold text-plate"
        >
          {copied ? "Copied" : "Copy these lines"}
        </button>
      </section>
    </div>
  );
}
