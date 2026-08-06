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
const TIER_CENTRE: Record<string, number> = {
  exposure: 84,
  response: 63,
  formation: 44,
  multiplication: 27,
};

/** Small, fixed per-domain lean so the three questions don't read identically. */
const DOMAIN_LEAN: Record<string, number> = { follow: 4, mission: -3, world: -1 };

const round1 = (x: number) => Math.round(x * 10) / 10;
const clamp = (x: number) => Math.max(2, Math.min(98, x));

function itemMean(item: InstrumentItem): number {
  const centre = TIER_CENTRE[item.tier] ?? 50;
  const lean = DOMAIN_LEAN[item.question_domain] ?? 0;
  const jitter = (seeded(item.key) - 0.5) * 13;
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
    const m = itemMean(it);
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
    trend: index === null ? null : [
      { year: 2027, index: round1(index - 3.1) },
      { year: 2028, index: round1(index - 1.2) },
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
