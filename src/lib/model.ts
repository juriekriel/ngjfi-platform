/**
 * The 3 × 4 model, in one place.
 *
 * Labels, order and colour for the two reporting lenses. Every surface — the
 * live org dashboard, Collab Intelligence, the guided tour, the landing page —
 * imports from here, so renaming a tier or restating a question is one edit
 * that lands everywhere at once.
 */

export const TIERS = ["exposure", "response", "formation", "multiplication"] as const;
export type Tier = (typeof TIERS)[number];

export const DOMAINS = ["follow", "mission", "world"] as const;
export type Domain = (typeof DOMAINS)[number];

export const TIER_LABEL: Record<string, string> = {
  exposure: "Exposure",
  response: "Response",
  formation: "Formation",
  multiplication: "Multiplication",
};

/** The question each tier is really asking, for captions and marginalia. */
export const TIER_GLOSS: Record<string, string> = {
  exposure: "encountered?",
  response: "responded?",
  formation: "being shaped?",
  multiplication: "does it spread?",
};

export const DOMAIN_LABEL: Record<string, string> = {
  follow: "Do they follow Jesus?",
  mission: "Do they participate in His mission?",
  world: "Does their world look different?",
};

/** Short forms, for axis labels and narrow columns. */
export const DOMAIN_SHORT: Record<string, string> = {
  follow: "Follow",
  mission: "Mission",
  world: "World",
};

export const DOMAIN_GLOSS: Record<string, string> = {
  follow: "personal faith",
  mission: "outward",
  world: "lived impact",
};

/** Plain-language content of each matrix cell — the model, not results. */
export const MATRIX_PHRASE: Record<string, Record<string, string>> = {
  follow: {
    exposure: "heard of Jesus",
    response: "believes",
    formation: "being shaped",
    multiplication: "helps others believe",
  },
  mission: {
    exposure: "aware of the call",
    response: "convinced it's theirs",
    formation: "practising witness",
    multiplication: "mobilising others",
  },
  world: {
    exposure: "sees faith should matter",
    response: "believes it does",
    formation: "choices reshaped",
    multiplication: "changing their spheres",
  },
};

/**
 * Colour, for the chart primitives.
 *
 * These do NOT restate hex values. They point at the CSS variables defined in
 * src/app/globals.css, which is the single source of truth for the palette —
 * the same block Tailwind reads. A colour therefore exists in exactly one
 * place, and re-skinning the platform is one edit to one file.
 */
const token = (name: string) => `rgb(var(--c-${name}))`;

/**
 * The tier ramp. Colour means depth, and only depth — a single emerald
 * deepening as the journey goes on, so the grid reads as a progression at a
 * glance rather than as decoration. Text flips to paper on the darker two.
 */
export const TIER_TINT: Record<string, { bg: string; fg: string }> = {
  exposure:       { bg: token("tier-exposure"),       fg: token("ink") },
  response:       { bg: token("tier-response"),       fg: token("ink") },
  formation:      { bg: token("tier-formation"),      fg: token("plate") },
  multiplication: { bg: token("tier-multiplication"), fg: token("plate") },
};

export const INK = token("ink");
export const PLATE = token("plate");
export const MUTED = token("muted");
export const EMERALD = token("emerald");
export const GREEN = token("green");
export const NAVY = token("navy");
export const VIOLET = token("violet");
export const VERMILLION = token("vermillion");
export const RULE = token("rule");

/**
 * Coral wash for heat cells — the brand colour, at intensity = score.
 * Scores are 1-5 (see supabase/migrations/0029_score_scale_1_to_5.sql);
 * divide by 5.5 rather than 5 for the same slight headroom the old /110
 * (rather than /100) divisor gave on the 0-100 scale, so a perfect 5 still
 * reads as strong rather than maxed-out/oversaturated.
 */
export const heat = (v: number | null | undefined): string =>
  v === null || v === undefined
    ? "transparent"
    : `rgb(var(--c-emerald) / ${Math.max(0.06, Math.min(0.92, v / 5.5))})`;

/**
 * Map-only tier hues (see the --c-map-* block in globals.css and
 * docs/PALETTE.md §6). The world map, its tier toggle and its legend all read
 * from here, so the button you press is the colour the countries fill with.
 * Tiers are looked up by key, so an unknown tier falls back to coral rather
 * than breaking — a new tier added in config still renders.
 */
const mapVar = (tier: string) => (TIERS as readonly string[]).includes(tier) ? `map-${tier}` : "emerald";

/** Solid tier colour, e.g. for a selected button or a legend swatch. */
export const tierMapColour = (tier: string): string => `rgb(var(--c-${mapVar(tier)}))`;

/** Text colour that meets AA on a solid tierMapColour() fill. */
export const tierMapInk = (tier: string): string =>
  (TIERS as readonly string[]).includes(tier) ? `rgb(var(--c-map-${tier}-fg))` : INK;

/**
 * The four map-tier hues as numbers, for the one job CSS variables can't do:
 * working out, per cell, whether ink or white text reads on a tinted fill.
 * These MUST equal the --c-map-* triplets in src/app/globals.css —
 * tests/palette.test.ts parses that file and fails if they ever drift, so the
 * stylesheet stays the single source of truth for what is actually painted.
 */
export const MAP_TIER_RGB: Record<string, [number, number, number]> = {
  exposure: [46, 131, 88],
  response: [144, 32, 253],
  formation: [74, 108, 194],
  multiplication: [188, 46, 58],
};

/** Same alpha curve heat() and tierHeat() use, exported so the maths is shared. */
export const heatAlpha = (v: number): number => Math.max(0.06, Math.min(0.92, v / 5.5));

const INK_RGB: [number, number, number] = [34, 37, 43];
const channel = (c: number) => {
  const x = c / 255;
  return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
};
const luminance = ([r, g, b]: [number, number, number]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/**
 * Ink or white — whichever has the higher contrast against a J12 cell filled
 * with tierHeat(tier, v) over a white card. Returns a CSS colour.
 */
export const tierCellInk = (tier: string, v: number | null | undefined): string => {
  const hue = MAP_TIER_RGB[tier];
  if (!hue || v === null || v === undefined) return INK;
  const a = heatAlpha(v);
  const mix = hue.map((c) => Math.round(255 + (c - 255) * a)) as [number, number, number];
  const L = luminance(mix);
  return contrast(L, 1) > contrast(L, luminance(INK_RGB)) ? PLATE : INK;
};

/** Same intensity curve as heat(), but in the tier's own hue. */
export const tierHeat = (tier: string, v: number | null | undefined): string =>
  v === null || v === undefined
    ? "transparent"
    : `rgb(var(--c-${mapVar(tier)}) / ${heatAlpha(v)})`;

/** A figure, or an em dash. Never a zero standing in for "we don't know". */
export const fig = (n: number | null | undefined): string =>
  n === null || n === undefined ? "—" : String(n);

/**
 * Signed delta with the semantic arrow. "Up" is GREEN, not the brand colour —
 * coral sits too close to vermillion's hue for the two to stay legible as
 * opposites in the same view. Vermillion is reserved for "down", full stop.
 * See docs/PALETTE.md.
 */
export const delta = (d: number | null | undefined) =>
  d === null || d === undefined
    ? { text: "—", colour: MUTED }
    : d >= 0
      ? { text: `▲ ${d.toFixed(1)}`, colour: GREEN }
      : { text: `▼ ${Math.abs(d).toFixed(1)}`, colour: VERMILLION };

/** The shape every dashboard surface consumes — live RPC or sample alike. */
export interface DashboardItem {
  key: string;
  domain: string;
  tier: string;
  mean: number | null;
  n: number;
}

export interface DashboardData {
  org: { slug: string; name: string; verified: boolean };
  n: number;
  index: number | null;
  tiers: Record<string, number | null>;
  domains: Record<string, number | null>;
  matrix: Record<string, Record<string, number | null>>;
  items: DashboardItem[];
  trend?: { year: number; index: number }[] | null;
  demo?: boolean;
  /**
   * The Exploration Index — v4's parallel figure for respondents who took the
   * Unengaged branch (see instrument.v4.json's version note and
   * src/lib/scoring.ts). Always a SEPARATE figure with its own sample size;
   * never averaged, summed or otherwise blended with `index`/`n` above.
   * Optional because it's absent from org_dashboard_demo() and any RPC
   * response captured before this field existed.
   */
  explorationN?: number;
  explorationIndex?: number | null;
  explorationTiers?: Record<string, number | null>;
  explorationDomains?: Record<string, number | null>;
  explorationMatrix?: Record<string, Record<string, number | null>>;
}
