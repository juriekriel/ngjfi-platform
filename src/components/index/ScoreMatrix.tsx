import { DOMAINS, DOMAIN_LABEL, TIERS, TIER_LABEL, fig, heat } from "@/lib/model";

/**
 * The J12 — the 3×4 Questions × Tiers matrix, in one place. Used by the org
 * dashboard, Collab Intelligence, and the Exploration Index panel, so a
 * change to how a cell reads (colour, compare badge, label) lands everywhere
 * at once instead of drifting across three hand-rolled tables.
 *
 * `compare`, when given, overlays a second, smaller figure in the corner of
 * each cell — used only for "compare to Collab" on an org's own dashboard
 * (house-level, never room-level; see CLAUDE.md non-negotiable on rooms).
 */
export default function ScoreMatrix({
  matrix,
  compare,
  compareLabel,
}: {
  matrix: Record<string, Record<string, number | null>>;
  compare?: Record<string, Record<string, number | null>> | null;
  compareLabel?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1.5 text-center">
        <thead>
          <tr>
            <th className="w-1/4" />
            {TIERS.map((tk) => (
              <th key={tk} className="pb-1 font-mono text-[8.5px] uppercase tracking-wider text-muted">
                {TIER_LABEL[tk]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DOMAINS.map((dk) => (
            <tr key={dk}>
              <td className="pr-2 text-left text-[12px] font-medium leading-tight text-ink">
                {DOMAIN_LABEL[dk]}
              </td>
              {TIERS.map((tk) => {
                const v = matrix?.[dk]?.[tk] ?? null;
                const cv = compare?.[dk]?.[tk] ?? null;
                const dark = v !== null && v >= 3.2;
                return (
                  <td
                    key={tk}
                    title={compareLabel && cv != null ? `${fig(v)} · ${compareLabel} ${fig(cv)}` : undefined}
                    className="relative rounded-lg py-3 font-sans text-base font-bold"
                    style={{ background: heat(v), color: dark ? "#fff" : "#22252b" }}
                  >
                    {fig(v)}
                    {cv != null && (
                      <span
                        className="absolute bottom-1 right-1.5 font-mono text-[8px] font-normal leading-none"
                        style={{ color: dark ? "rgba(255,255,255,0.75)" : "rgba(34,37,43,0.55)" }}
                      >
                        {fig(cv)}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {compare && compareLabel && (
        <p className="mt-2 font-mono text-[9px] uppercase tracking-wider text-muted">
          Small number in each cell — {compareLabel}
        </p>
      )}
    </div>
  );
}
