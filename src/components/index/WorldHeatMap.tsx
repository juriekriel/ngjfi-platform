import { COUNTRY_CODE_BY_NAME, WORLD_CENTROIDS, WORLD_FEATURES, WORLD_VIEWBOX } from "@/data/worldGeo";
import { fig, tierHeat } from "@/lib/model";

export type MapCountry = {
  /** Free-text country name, exactly as stored on organisations/sessions. */
  country: string;
  n: number;
  /** One score per tier — pass the tier currently being viewed's number in
   *  via `score`, or the caller can pre-resolve. Kept as tiers so callers
   *  that already have the full matrix don't have to duplicate lookups. */
  tiers?: Record<string, number | null>;
};

/**
 * The real global heat map — real Natural Earth geometry (src/data/worldGeo.ts,
 * ported from the locked demo), coloured by the same coral ramp as the J12
 * matrix (`heat()` in src/lib/model.ts), one shared component for the org
 * dashboard and Collab Intelligence. Fill and legend take the selected tier's
 * own hue (tierHeat), matching MapTierToggle.
 *
 * A country is only ever coloured here if it is present in `countries` — the
 * server already enforces the country-level critical-mass gate
 * (country_critical_mass_gate, 2000 — migration 0020) before a country
 * appears in collab_intelligence()'s countries[] or org_benchmark()'s
 * country baseline, so "not in the list" and "below the gate" are the same
 * state. This component adds no gating logic of its own — it only draws
 * what it's given, grey otherwise.
 */
export default function WorldHeatMap({
  countries,
  tier,
  reached = [],
  gate,
}: {
  countries: MapCountry[];
  tier: string;
  /**
   * Country names (as stored on sessions) an organisation's links reached —
   * outlined, never filled, so an under-threshold country is marked without
   * being activated. Comes from org_reach_countries() (0033), which already
   * drops any country below min_group_n.
   */
  reached?: string[];
  /** The country critical-mass gate, from config (collab_intelligence().country_gate). */
  gate?: number;
}) {
  const byCode = new Map<string, MapCountry>();
  for (const c of countries) {
    const code = COUNTRY_CODE_BY_NAME[c.country];
    if (code) byCode.set(code, c);
  }

  const scoreFor = (code: string) => byCode.get(code)?.tiers?.[tier] ?? null;
  const reachedCodes = new Set(reached.map((n) => COUNTRY_CODE_BY_NAME[n]).filter(Boolean));

  return (
    <div>
      <svg
        viewBox={`0 0 ${WORLD_VIEWBOX.w} ${WORLD_VIEWBOX.h}`}
        className="w-full"
        role="img"
        aria-label="World map, countries coloured by score where enough responses have been collected"
      >
        {WORLD_FEATURES.map((f, i) => {
          const active = f.c ? byCode.has(f.c) : false;
          const score = f.c ? scoreFor(f.c) : null;
          return (
            <path
              key={i}
              d={f.d}
              fill={active && score != null ? tierHeat(tier, score) : "#e2e5ea"}
              stroke="#ffffff"
              strokeWidth={f.c ? 0.9 : 0.6}
            />
          );
        })}
        {WORLD_FEATURES.filter((f) => f.c && reachedCodes.has(f.c)).map((f) => (
          <path key={`reached-${f.c}`} d={f.d} fill="none" stroke="rgb(var(--c-ink))" strokeWidth={1.6} />
        ))}
        {Object.entries(WORLD_CENTROIDS).map(([code, [x, y]]) => {
          const entry = byCode.get(code);
          const score = entry?.tiers?.[tier] ?? null;
          const active = Boolean(entry) && score != null;
          return (
            <g key={code}>
              <rect
                x={x - 11}
                y={y - 7}
                width={22}
                height={14}
                rx={3}
                fill={active ? "#22252b" : "#ffffff"}
                fillOpacity={active ? 0.85 : 0.7}
                stroke={active ? "none" : "#9a9fa8"}
                strokeWidth={0.6}
              />
              <text
                x={x}
                y={y + 3.5}
                textAnchor="middle"
                fontSize={7.5}
                fontFamily="var(--font-mono), ui-monospace, monospace"
                fill={active ? "#ffffff" : "#9a9fa8"}
              >
                {code}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-3 flex flex-wrap items-center gap-3 font-mono text-[9px] uppercase tracking-wider text-muted">
        <span>1</span>
        <span
          className="h-2.5 w-32 rounded-full"
          style={{
            background: `linear-gradient(90deg, ${tierHeat(tier, 1.2)}, ${tierHeat(tier, 2.2)}, ${tierHeat(tier, 3.4)}, ${tierHeat(tier, 4.7)})`,
          }}
        />
        <span>5</span>
        <span className="ml-2 inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-rule" style={{ background: "#e2e5ea" }} />
          No data, or below n ≥ {(gate ?? 2000).toLocaleString()}
        </span>
        {reachedCodes.size > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded border-2 border-ink" />
            Your links reached here
          </span>
        )}
      </div>

      {countries.length === 0 && (
        <p className="mt-3 text-sm text-slate">No country has cleared the benchmark threshold yet.</p>
      )}
      {countries.length > 0 && (
        <p className="mt-3 font-mono text-[9px] uppercase tracking-wider text-muted">
          {countries.length} {countries.length === 1 ? "country" : "countries"} shown · of those who
          completed the Index · n ={" "}
          {countries.reduce((sum, c) => sum + c.n, 0).toLocaleString()}
        </p>
      )}
    </div>
  );
}

/** Re-export for callers that only have a matrix and want one tier's map score. */
export function pickTierScore(tiers: Record<string, number | null> | undefined, tier: string) {
  return fig(tiers?.[tier] ?? null);
}
