/**
 * The sample dataset behind the guided tour.
 *
 * DERIVED FROM THE LIVE INSTRUMENT — not a hand-written fixture. Every figure is
 * generated from `instrument.v1.json` at render time, so the moment a researcher
 * adds, removes or re-tiers an item, the tour and the landing page show the new
 * shape without anyone remembering to update a mock. That is the whole contract:
 * the demo cannot drift from the system, because it is computed from it.
 *
 * It is fiction, and it is labelled as fiction everywhere it appears. The shape
 * is modelled on the one real finding the project has — the DFW pilot's
 * belief/practice gap — so the tour teaches the right way to READ a dashboard
 * while teaching nothing false about the world.
 */
import { instrument, t, type InstrumentItem } from "@/lib/instrument";
import { DOMAINS, TIERS, type DashboardData } from "@/lib/model";

/** Deterministic hash → the same "random" figure on server and client. */
function seeded(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

/**
 * The funnel narrows. These centres encode the project's actual headline
 * finding — belief outruns practice, and practice outruns reproduction.
 */
// Rescaled from the old 0-100 headline centres via `1 + (old/100)*4` for the
// 1-5 raw-Likert-mean scale (see migration 0029_score_scale_1_to_5.sql).
const TIER_CENTRE: Record<string, number> = {
  exposure: 4.4,
  response: 3.5,
  formation: 2.8,
  multiplication: 2.1,
};

/** Small, fixed per-domain lean so the three questions don't read identically.
 *  Additive offset (not a score itself), so rescaled by the same 4/100 factor
 *  as the centres above rather than the 1+(old/100)*4 score conversion. */
const DOMAIN_LEAN: Record<string, number> = { follow: 0.16, mission: -0.12, world: -0.04 };

const round1 = (x: number) => Math.round(x * 10) / 10;
const clamp = (x: number) => Math.max(1.1, Math.min(4.9, x));

function itemMean(item: InstrumentItem, salt = ""): number {
  const centre = TIER_CENTRE[item.tier] ?? 3;
  const lean = DOMAIN_LEAN[item.question_domain] ?? 0;
  // Salted per sample org (the tour's org keeps salt "" so its figures are unchanged).
  const jitter = (seeded(salt + item.key) - 0.5) * 0.52;
  return round1(clamp(centre + lean + jitter));
}

function mean(xs: number[]): number | null {
  return xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
}

export interface SampleOrg {
  slug: string;
  name: string;
  country: string;
  region: string;
  brand: string;
  n: number;
}

/**
 * The tour's organisation. Named so it cannot be mistaken for a real ministry —
 * the "(sample)" travels into any screenshot or copy-paste.
 */
export const SAMPLE_ORG: SampleOrg = {
  slug: "riverbend",
  name: "Riverbend Youth Network (sample)",
  country: "Argentina",
  region: "Latin America",
  // Deliberately a literal, NOT the platform token. This is a white-label
  // org's own brand colour — respondent-facing org data, not a design token.
  // Re-skinning the platform must not silently re-skin a ministry's brand.
  brand: "#0B8A60",
  n: 1204,
};

/**
 * The fictional church behind the "Church" view of /see-a-demo (Oct 2026). Same derivation as every other sample figure — only the name,
 * place, brand colour and n differ. "(sample)" travels with the name, like
 * Riverbend's, so no screenshot can pass it off as a real congregation.
 */
export const SAMPLE_CHURCH: SampleOrg = {
  slug: "hillcrest",
  name: "Hillcrest Community Church (sample)",
  country: "Kenya",
  region: "Africa",
  // A white-label org's own brand colour — deliberately a literal, not a token.
  brand: "#2F5BB7",
  n: 486,
};

/**
 * The fictional ministry behind the "Ministry" view of /see-a-demo — a
 * campus/student ministry, as distinct from a single church (SAMPLE_CHURCH)
 * or a network of churches (SAMPLE_ORG). Same derivation, same "(sample)".
 */
export const SAMPLE_MINISTRY: SampleOrg = {
  slug: "lighthouse",
  name: "Lighthouse Student Ministry (sample)",
  country: "Philippines",
  region: "Southeast Asia",
  // A white-label org's own brand colour — deliberately a literal, not a token.
  brand: "#7A3B98",
  n: 742,
};

/** Scored items only — diagnostics and screeners never enter the Index. */
export function sampleItems(): InstrumentItem[] {
  return instrument.items.filter(
    (i) => i.scored && (DOMAINS as readonly string[]).includes(i.question_domain),
  );
}

/** A complete dashboard payload, in exactly the shape the live RPC returns. */
export function sampleDashboard(org: SampleOrg = SAMPLE_ORG): DashboardData {
  const items = sampleItems();

  const rows = items.map((it) => {
    const m = itemMean(it, org.slug === SAMPLE_ORG.slug ? "" : org.slug);
    // Sample size thins toward the deep end — branching means fewer people are
    // even asked the multiplication items, which is the honest shape.
    const shares: Record<string, number> = {
      exposure: 1, response: 0.86, formation: 0.52, multiplication: 0.44,
    };
    const share = shares[it.tier] ?? 0.7;
    return {
      key: it.key,
      domain: it.question_domain,
      tier: it.tier,
      mean: m,
      n: Math.round(org.n * share * (0.9 + seeded(it.key + "n") * 0.2)),
    };
  });

  const tiers: Record<string, number | null> = {};
  for (const tk of TIERS) tiers[tk] = mean(rows.filter((r) => r.tier === tk).map((r) => r.mean));

  const domains: Record<string, number | null> = {};
  for (const dk of DOMAINS) domains[dk] = mean(rows.filter((r) => r.domain === dk).map((r) => r.mean));

  const matrix: Record<string, Record<string, number | null>> = {};
  for (const dk of DOMAINS) {
    matrix[dk] = {};
    for (const tk of TIERS) {
      matrix[dk][tk] = mean(rows.filter((r) => r.domain === dk && r.tier === tk).map((r) => r.mean));
    }
  }

  const tierVals = TIERS.map((tk) => tiers[tk]).filter((v): v is number => v !== null);
  const index = tierVals.length ? round1(tierVals.reduce((a, b) => a + b, 0) / tierVals.length) : null;

  return {
    org: { slug: org.slug, name: org.name, verified: true },
    n: org.n,
    index,
    tiers,
    domains,
    matrix,
    items: rows.sort((a, b) => a.domain.localeCompare(b.domain) || a.tier.localeCompare(b.tier)),
    // Offsets rescaled by the same 4/100 factor as DOMAIN_LEAN above — these
    // are additive deltas from the old 0-100 space, not scores themselves.
    trend: index === null ? null : [
      { year: 2027, index: round1(index - 3.1 * 0.04) },
      { year: 2028, index: round1(index - 1.2 * 0.04) },
      { year: 2029, index },
    ],
    demo: true,
  };
}

/** Response counts per tier, for the funnel's n column. */
export function sampleTierCounts(org: SampleOrg = SAMPLE_ORG): Record<string, number> {
  const d = sampleDashboard(org);
  const out: Record<string, number> = {};
  for (const tk of TIERS) {
    const rows = d.items.filter((i) => i.tier === tk);
    out[tk] = rows.reduce((a, r) => a + r.n, 0);
  }
  return out;
}

/** Item label resolver shared by every surface that renders the ledger. */
export const itemLabel = (key: string): string => {
  const it = instrument.items.find((i) => i.key === key);
  return it ? t(it.text, "en") : key;
};

/**
 * The demo world map's fallback (Oct 2026, round 4b). The global view's demo
 * preview reads the sandbox first (collab_intelligence_demo); before launch
 * the sandbox is deleted (supabase/delete_demo_data.sql), and the map must
 * not go empty again — so it falls back to this. Same derivation as every
 * other sample figure: each country's tier means are the instrument-derived
 * centres plus a deterministic per-country jitter. Invented, and only ever
 * rendered inside a DemoFrame.
 */
const SAMPLE_WORLD: [country: string, lean: number][] = [
  ["Canada", -0.15], ["United States", 0], ["Mexico", 0.1], ["Colombia", 0.15], ["Peru", 0.1], ["Brazil", 0.2],
  ["Argentina", 0.1], ["United Kingdom", -0.3], ["France", -0.35], ["Spain", -0.3], ["Germany", -0.3],
  ["Poland", -0.1], ["Sweden", -0.4], ["Egypt", -0.05], ["Nigeria", 0.3], ["DR Congo", 0.2], ["Ethiopia", 0.25],
  ["Uganda", 0.3], ["Kenya", 0.3], ["South Africa", 0.15], ["India", 0.05], ["Nepal", 0.1], ["Bangladesh", -0.05],
  ["Thailand", -0.1], ["Philippines", 0.25], ["Indonesia", 0.1], ["South Korea", 0.05], ["Japan", -0.4],
  ["Papua New Guinea", 0.2], ["Australia", -0.2], ["New Zealand", -0.15],
];

export function sampleWorld(): {
  totals: { orgs: number; responses: number; countries: number };
  countries: { country: string; n: number; tiers: Record<string, number | null> }[];
} {
  const countries = SAMPLE_WORLD.map(([country, lean]) => {
    const tiers: Record<string, number | null> = {};
    for (const tk of TIERS) tiers[tk] = round1(clamp((TIER_CENTRE[tk] ?? 3) + lean + (seeded(country + tk) - 0.5) * 0.6));
    return { country, n: 2000 + Math.round(seeded(country) * 4200), tiers };
  });
  const responses = countries.reduce((a, c) => a + c.n, 0);
  return { totals: { orgs: Math.round(responses / 190), responses, countries: countries.length }, countries };
}
