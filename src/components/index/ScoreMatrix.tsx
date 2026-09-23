import {
  DOMAINS,
  DOMAIN_GLOSS,
  DOMAIN_SHORT,
  TIERS,
  TIER_LABEL,
  fig,
  tierCellInk,
  tierHeat,
  tierMapColour,
} from "@/lib/model";

/**
 * The J12 — the 3×4 Questions × Tiers matrix, in one place. Used by the org
 * dashboard, Collab Intelligence, the PDF export and the Exploration Index
 * panel, so a change to how a cell reads lands everywhere at once.
 *
 * Colour: each tier column is painted in that tier's own hue — the same
 * green / violet / blue / red the landing page's map toggle uses
 * (tierHeat(), docs/PALETTE.md §6) — deeper meaning a higher score. Text is
 * ink or white per cell, whichever has the higher contrast (tierCellInk()).
 *
 * `compare`, when given, overlays a second figure and the difference in the
 * corner of each cell. Used only for comparing an organisation's whole house
 * with the Collab (never a room — see CLAUDE.md).
 */
/** Scores always read to one decimal (4.0, not 4) so a column of figures lines up. */
const one = (v: number | null) => (v == null ? fig(v) : v.toFixed(1));

export default function ScoreMatrix({
  matrix,
  compare,
  compareLabel,
  showDelta = true,
}: {
  matrix: Record<string, Record<string, number | null>>;
  compare?: Record<string, Record<string, number | null>> | null;
  compareLabel?: string;
  /** Show "± difference" beside the compared figure. */
  showDelta?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] table-fixed border-separate border-spacing-2 text-center">
        <caption className="sr-only">
          Scores by question and tier, on a 1 to 5 scale
          {compare && compareLabel ? `, with ${compareLabel} for comparison` : ""}
        </caption>
        <thead>
          <tr>
            <th className="w-[92px] sm:w-[150px]" />
            {TIERS.map((tk) => (
              <th key={tk} scope="col" className="pb-1 font-mono text-[10.5px] font-normal uppercase tracking-wider text-ink-2">
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: tierMapColour(tk) }} />
                  {TIER_LABEL[tk]}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DOMAINS.map((dk) => (
            <tr key={dk}>
              <th scope="row" className="pr-2 text-left align-middle font-normal">
                <span className="block text-[15px] font-semibold leading-tight text-ink">{DOMAIN_SHORT[dk]}</span>
                <span className="block text-[12px] text-ink-2">{DOMAIN_GLOSS[dk]}</span>
              </th>
              {TIERS.map((tk) => {
                const v = matrix?.[dk]?.[tk] ?? null;
                const cv = compare?.[dk]?.[tk] ?? null;
                const d = v != null && cv != null ? Math.round((v - cv) * 10) / 10 : null;
                return (
                  <td
                    key={tk}
                    className="relative h-[72px] rounded-xl align-middle text-[22px] font-bold tracking-tight sm:h-[84px] sm:text-[26px]"
                    style={{ background: v == null ? "rgb(var(--c-paper-deep))" : tierHeat(tk, v), color: tierCellInk(tk, v) }}
                  >
                    {one(v)}
                    {cv != null && compareLabel && (
                      <span className="absolute bottom-1 right-1 whitespace-nowrap rounded-md bg-plate/95 px-1.5 py-0.5 font-mono text-[9.5px] font-medium leading-none tracking-normal text-ink sm:bottom-1.5 sm:right-1.5 sm:text-[10.5px]">
                        <span className="hidden sm:inline">{compareLabel} </span>
                        {one(cv)}
                        {showDelta && d != null && (
                          <span className="hidden sm:inline">{` · ${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)}`}</span>
                        )}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The matrix legend: one light-to-deep ramp per tier, in the tier's own hue. */
export function MatrixLegend() {
  return (
    <span className="flex flex-wrap items-center gap-3 font-mono text-[10.5px] uppercase tracking-wider text-ink-2">
      1–5 · deeper = higher
      {TIERS.map((tk) => (
        <span
          key={tk}
          aria-hidden
          className="h-2.5 w-14 rounded-full"
          style={{ background: `linear-gradient(90deg, ${tierHeat(tk, 1.2)}, ${tierHeat(tk, 4.8)})` }}
        />
      ))}
    </span>
  );
}
