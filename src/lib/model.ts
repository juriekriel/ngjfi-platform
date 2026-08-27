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
export const NAVY = token("navy");
export const VERMILLION = token("vermillion");
export const RULE = token("rule");

/** Emerald wash for heat cells. Colour only ever means something. */
export const heat = (v: number | null | undefined): string =>
  v === null || v === undefined
    ? "transparent"
    : `rgb(var(--c-emerald) / ${Math.max(0.06, Math.min(0.92, v / 110))})`;

/** A figure, or an em dash. Never a zero standing in for "we don't know". */
export const fig = (n: number | null | undefined): string =>
  n === null || n === undefined ? "—" : String(n);

/** Signed delta with the semantic arrow. Vermillion is reserved for "down". */
export const delta = (d: number | null | undefined) =>
  d === null || d === undefined
    ? { text: "—", colour: MUTED }
    : d >= 0
      ? { text: `▲ ${d.toFixed(1)}`, colour: EMERALD }
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
}
