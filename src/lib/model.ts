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
 * The tier ramp. Colour means depth, and only depth — a single emerald
 * deepening as the journey goes on, so the grid reads as a progression at a
 * glance rather than as decoration. Text flips to paper on the darker two.
 */
export const TIER_TINT: Record<string, { bg: string; fg: string }> = {
  exposure:       { bg: "#E4F1EA", fg: "#1B1F27" },
  response:       { bg: "#B6DCC8", fg: "#1B1F27" },
  formation:      { bg: "#4FA684", fg: "#FFFDF8" },
  multiplication: { bg: "#0B8A60", fg: "#FFFDF8" },
};

export const INK = "#1B1F27";
export const EMERALD = "#0B8A60";
export const NAVY = "#35639C";
export const VERMILLION = "#B5451B";
export const RULE = "#D9D2C4";

/** Emerald wash for heat cells. Colour only ever means something. */
export const heat = (v: number | null | undefined): string =>
  v === null || v === undefined
    ? "transparent"
    : `rgba(11, 138, 96, ${Math.max(0.06, Math.min(0.92, v / 110))})`;

/** A figure, or an em dash. Never a zero standing in for "we don't know". */
export const fig = (n: number | null | undefined): string =>
  n === null || n === undefined ? "—" : String(n);

/** Signed delta with the semantic arrow. Vermillion is reserved for "down". */
export const delta = (d: number | null | undefined) =>
  d === null || d === undefined
    ? { text: "—", colour: "#8A8F9B" }
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
