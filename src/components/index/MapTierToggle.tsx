import { TIERS, TIER_LABEL, tierMapColour, tierMapInk } from "@/lib/model";

/**
 * The tier toggle that sits above every WorldHeatMap. Each button carries its
 * tier's map hue — a dot when idle, a full fill when selected — so the button
 * you press is the colour the countries (and the 1–5 legend) turn.
 *
 * `className` sets shape and size per surface; colour is owned here.
 */
export default function MapTierToggle({
  tier,
  onChange,
  className = "rounded-md px-2.5 py-1 text-[13px]",
}: {
  tier: string;
  onChange: (tier: string) => void;
  className?: string;
}) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Tier shown on the map">
      {TIERS.map((tk) => {
        const on = tier === tk;
        const colour = tierMapColour(tk);
        return (
          <button
            key={tk}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(tk)}
            className={`inline-flex items-center gap-1.5 border font-semibold transition-colors ${className} ${
              on ? "" : "border-rule text-ink-2 hover:border-current"
            }`}
            style={on ? { background: colour, borderColor: colour, color: tierMapInk(tk) } : undefined}
          >
            {!on && (
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: colour }} />
            )}
            {TIER_LABEL[tk]}
          </button>
        );
      })}
    </div>
  );
}
