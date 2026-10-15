"use client";

/**
 * Share about the Jesus Index — what an organisation hands to a partner, a board
 * or a neighbouring ministry. Four downloads (static files in public/share/,
 * so they work offline once cached and never depend on the database) plus a
 * short blurb to paste into an email or a WhatsApp group.
 */
import { useState } from "react";
import { PITCH_DOCS } from "@/components/site/PitchDocs";

// The same three PDFs as the front page's "Pitch documents" (one list, so the
// two can't drift), plus the QR code for jfindx.org.
const FILES = [
  ...PITCH_DOCS.map(({ href, kicker, title, body }) => ({ href, kicker, title, body })),
  {
    href: "/share/jfindx-qr.png",
    kicker: "QR code · PNG",
    title: "Point people to jfindx.org",
    body: "A high-resolution QR code for slides, posters and newsletters. It opens the public home page, not your survey.",
  },
];

export default function ShareJfindx({ orgName }: { orgName: string }) {
  const blurb = `${orgName} is using the Jesus Index — a seven-minute, anonymous survey that shows how young people are following Jesus, and where they stop moving. It's free for ministries and built with the Next Gen Global Collab. See jfindx.org.`;
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
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
