import Link from "next/link";
import { J12Grid } from "@/components/index/Figures";

/**
 * The front page's door into /see-a-demo — "See your: Ministry ·
 * Organisation · Church", each deep-linking its tab. Deliberately carries no
 * figures, real or invented: every number lives on the demo page, inside a
 * DEMO frame (round 4b).
 */
const DOORS = [
  { view: "ministry", label: "Ministry" },
  { view: "organisation", label: "Organisation" },
  { view: "church", label: "Church" },
] as const;

export default function SeeADemoCard({ className = "" }: { className?: string }) {
  return (
    // h-full + flex column: the card stretches to the hero's row height, and
    // the mark takes up any spare room, centred — so the card's bottom lines
    // up with the benefits beside it (round 7).
    <div className={`flex h-full flex-col rounded-2xl border border-rule bg-plate p-5 shadow-sm ${className}`}>
      <div className="flex flex-1 items-center justify-center py-4">
        <J12Grid className="w-full max-w-[220px]" />
      </div>
      <p className="mt-5 text-[19px] font-bold leading-snug text-ink">See a Demo</p>
      <p className="mt-1 text-[14px] leading-relaxed text-ink-2">
        See a fictional ministry, church, or organization&apos;s survey, dashboard, and the results they gathered.
      </p>
      <p className="mt-4 text-[13px] font-semibold text-ink">See it as a:</p>
      <div className="mt-2 grid gap-2">
        {DOORS.map((d) => (
          <Link
            key={d.view}
            href={`/see-a-demo?view=${d.view}`}
            className="flex items-center justify-between rounded-lg border border-rule px-3.5 py-3 text-[14.5px] font-semibold text-ink no-underline hover:border-ink hover:bg-paper-deep"
          >
            {d.label}
            <span aria-hidden className="text-emerald-deeper">→</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
