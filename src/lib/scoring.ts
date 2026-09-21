/**
 * NGJFI scoring engine (spec §5) — pure, dependency-free, and versioned.
 *
 * Rules:
 *  - Normalise every scored item to 0–100.
 *  - likert_5:   (value − 1) / 4 × 100        (value ∈ 1..5)
 *  - yes_no:     Yes → 100, No → 0
 *  - frequency:  ordinal index mapped across 0–100  (index / (points − 1) × 100)
 *  - reverse_scored items are inverted (100 − normalised) before aggregation.
 *  - Only items with `scored: true` feed the Index; diagnostics are ignored here.
 *  - Tier score   = mean of scored items tagged to that tier.
 *  - Domain score = mean of scored items tagged to that question domain.
 *  - Matrix cell  = mean of scored items at a domain × tier intersection (may be sparse).
 *  - Index        = mean of the available tier scores.
 *  - Always carry the scoring-version id so results are re-computable.
 */

export type QuestionDomain =
  | "follow"
  | "mission"
  | "world"
  | "screener"
  | "journey"
  | "demographic";

export type Tier =
  | "exposure"
  | "response"
  | "formation"
  | "multiplication"
  | "na";

export type ItemType =
  | "likert_5"
  | "yes_no"
  | "frequency"
  | "single_select"
  | "multi_select"
  | "screener";

export interface Item {
  key: string;
  question_domain: QuestionDomain;
  tier: Tier;
  type: ItemType;
  scored: boolean;
  reverse_scored?: boolean;
  /** points: number of ordered steps (likert_5 → 5, frequency → 4 by default). */
  scale?: { points?: number };
  /**
   * Which parallel branch of the instrument this item belongs to. Items with
   * branch: "unengaged" score into explorationIndex/explorationTiers/
   * explorationDomains/explorationMatrix below — a completely separate
   * accumulator from index/tiers/domains/matrix. Omitted or "engaged" means
   * "this is (or behaves like) the official Index."
   *
   * This split exists because the v4 instrument gives non-followers a
   * parallel 24-item item set using the SAME domain×tier cells as the
   * official Index (see instrument.v4.json's version note) — but the two
   * branches ask different questions of different populations, and must
   * never be averaged together into one number. Never remove this filter
   * without a deliberate, versioned scoring decision.
   */
  branch?: "engaged" | "unengaged";
}

export type RawValue = number | string | boolean | string[] | null | undefined;

export interface RawResponse {
  key: string;
  value: RawValue;
}

export const SCORING_VERSION = "v0.1.0";

const SCORE_DOMAINS: QuestionDomain[] = ["follow", "mission", "world"];
const SCORE_TIERS: Tier[] = ["exposure", "response", "formation", "multiplication"];

const round1 = (x: number): number => Math.round(x * 10) / 10;

const mean = (xs: number[]): number | null =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

/**
 * Normalise a single raw response value to 0–100 for a given item.
 * Returns null when the item is not scorable, unanswered, or the value is invalid.
 */
export function normalizeValue(item: Item, value: RawValue): number | null {
  if (value === null || value === undefined || value === "") return null;

  let base: number | null = null;

  switch (item.type) {
    case "likert_5": {
      const v = Number(value);
      if (!Number.isFinite(v) || v < 1 || v > 5) return null;
      base = ((v - 1) / 4) * 100;
      break;
    }
    case "yes_no": {
      if (value === true || value === 1 || value === "1") base = 100;
      else if (value === false || value === 0 || value === "0") base = 0;
      else {
        const s = String(value).trim().toLowerCase();
        if (s === "yes") base = 100;
        else if (s === "no") base = 0;
        else return null;
      }
      break;
    }
    case "frequency": {
      const points = item.scale?.points ?? 4;
      if (points < 2) return null;
      const idx = Number(value);
      if (!Number.isInteger(idx) || idx < 0 || idx > points - 1) return null;
      base = (idx / (points - 1)) * 100;
      break;
    }
    // single_select / multi_select / screener are diagnostic by default — not scored here.
    default:
      return null;
  }

  if (base === null) return null;
  return item.reverse_scored ? 100 - base : base;
}

export interface ScoreResult {
  scoringVersion: string;
  /** number of scored items that contributed (answered + scorable). */
  n: number;
  index: number | null;
  tiers: Record<string, number | null>;
  domains: Record<string, number | null>;
  /** matrix[domain][tier] */
  matrix: Record<string, Record<string, number | null>>;
  /**
   * The Exploration Index — computed identically to index/tiers/domains/
   * matrix above, but only from items tagged branch: "unengaged". Always
   * present (never merged into the fields above); null/empty when nobody in
   * this batch of responses answered any unengaged-branch item. See the
   * `branch` field on Item for why these must stay separate.
   */
  explorationN: number;
  explorationIndex: number | null;
  explorationTiers: Record<string, number | null>;
  explorationDomains: Record<string, number | null>;
  explorationMatrix: Record<string, Record<string, number | null>>;
}

/**
 * Compute per-session (or aggregate) scores from raw responses against an instrument.
 * Low-n and missing data are handled gracefully (means over what exists; null when empty).
 */
export function computeScores(
  items: Item[],
  responses: RawResponse[],
  opts: { scoringVersion?: string } = {},
): ScoreResult {
  const itemByKey = new Map<string, Item>();
  for (const it of items) itemByKey.set(it.key, it);

  // Collect normalised, scored datapoints tagged by tier + domain — split
  // into two entirely disjoint accumulators by branch. `points` feeds the
  // official Index exactly as before; `explorationPoints` feeds the
  // Exploration Index and is never read by the index/tiers/domains/matrix
  // computation below.
  type Point = { tier: Tier; domain: QuestionDomain; value: number };
  const points: Point[] = [];
  const explorationPoints: Point[] = [];

  for (const r of responses) {
    const item = itemByKey.get(r.key);
    if (!item || !item.scored) continue;
    const norm = normalizeValue(item, r.value);
    if (norm === null) continue;
    const point = { tier: item.tier, domain: item.question_domain, value: norm };
    if (item.branch === "unengaged") explorationPoints.push(point);
    else points.push(point);
  }

  type Reduced = {
    tiers: Record<string, number | null>;
    domains: Record<string, number | null>;
    matrix: Record<string, Record<string, number | null>>;
    index: number | null;
  };

  function reduce(pts: Point[]): Reduced {
    const tiers: Record<string, number | null> = {};
    for (const t of SCORE_TIERS) {
      const m = mean(pts.filter((p) => p.tier === t).map((p) => p.value));
      tiers[t] = m === null ? null : round1(m);
    }

    const domains: Record<string, number | null> = {};
    for (const d of SCORE_DOMAINS) {
      const m = mean(pts.filter((p) => p.domain === d).map((p) => p.value));
      domains[d] = m === null ? null : round1(m);
    }

    const matrix: Record<string, Record<string, number | null>> = {};
    for (const d of SCORE_DOMAINS) {
      matrix[d] = {};
      for (const t of SCORE_TIERS) {
        const m = mean(pts.filter((p) => p.domain === d && p.tier === t).map((p) => p.value));
        matrix[d][t] = m === null ? null : round1(m);
      }
    }

    // Index = mean of the available tier scores (spec default; researchers may weight later).
    const tierVals = SCORE_TIERS.map((t) => tiers[t]).filter((v): v is number => v !== null);
    const index = tierVals.length ? round1(mean(tierVals) as number) : null;

    return { tiers, domains, matrix, index };
  }

  const official = reduce(points);
  const exploration = reduce(explorationPoints);

  return {
    scoringVersion: opts.scoringVersion ?? SCORING_VERSION,
    n: points.length,
    index: official.index,
    tiers: official.tiers,
    domains: official.domains,
    matrix: official.matrix,
    explorationN: explorationPoints.length,
    explorationIndex: exploration.index,
    explorationTiers: exploration.tiers,
    explorationDomains: exploration.domains,
    explorationMatrix: exploration.matrix,
  };
}
