/**
 * Reading org_breakdown() / org_completion() (migration 0052). Pure, so it is
 * tested directly. Group VALUES come from the database; their LABELS come from
 * the instrument — so a new age band or gender option appears with no code
 * change, and nothing here hard-codes a band.
 */

export const DIMENSIONS = [
  { key: "age_band", label: "Age" },
  { key: "gender", label: "Gender" },
  { key: "faith_status", label: "Faith status" },
  { key: "country", label: "Country" },
  { key: "language", label: "Language" },
  { key: "survey_version", label: "Survey version" },
] as const;
export type Dimension = (typeof DIMENSIONS)[number]["key"];

export type BreakdownGroup = {
  value: string;
  n: number | null;
  suppressed: boolean;
  share: number | null;
  following_n: number | null;
  not_following_n: number | null;
  index: number | null;
  exploration_index: number | null;
  tiers?: Record<string, number> | null;
};
export type Breakdown = { dimension: Dimension; total: number; min_n: number; scale: number; groups: BreakdownGroup[] };

export type Completion = {
  started: number;
  completed: number;
  pending: number;
  rate_base: number;
  min_n: number;
  completion_rate: number | null;
  stop_points: Record<string, number> | null;
  extras_reached: number;
  extras_opt_in_rate: number | null;
};

type Opt = { value: string; text: Record<string, string> };
type Inst = {
  items: { key: string; options?: Opt[] }[];
  item_sets?: Record<string, { label?: Record<string, string> }>;
};
type Loc = { code: string; name: string };

/** Which instrument item answers each dimension's values. */
const SOURCE_ITEM: Partial<Record<Dimension, string>> = {
  age_band: "age_band",
  gender: "gender",
  faith_status: "orientation",
};

/** A database error that means "this function doesn't exist yet" (an older database), not a real failure. */
export function isMissingFunction(e: { code?: string; message?: string } | null | undefined): boolean {
  return Boolean(e && (e.code === "PGRST202" || e.code === "42883" || /could not find the function|does not exist/i.test(e.message ?? "")));
}

export function groupLabel(dim: Dimension, value: string, inst: Inst, locales: Loc[] = []): string {
  if (value === "_not_given") return "Not given";
  if (value === "_hidden") return "Other groups — hidden to protect small numbers";
  const key = SOURCE_ITEM[dim];
  if (key) {
    const opt = inst.items.find((i) => i.key === key)?.options?.find((o) => o.value === value);
    return opt?.text.en ?? value;
  }
  if (dim === "language") return locales.find((l) => l.code === value)?.name ?? value;
  if (dim === "survey_version") return inst.item_sets?.[value]?.label?.en ?? (value === "full" ? "Full survey" : value);
  return value;
}

/** "72% of 410 who started finished" — or an honest line when the base is too small. */
export function completionLine(c: Completion): string {
  if (c.started === 0) return "No one has started the survey yet.";
  if (c.completion_rate == null)
    return `${c.completed.toLocaleString("en")} of ${c.started.toLocaleString("en")} who started have finished — the rate shows once ${c.min_n} have had time to finish.`;
  const pct = Math.round(c.completion_rate * 100);
  const pending = c.pending > 0 ? ` (${c.pending.toLocaleString("en")} started in the last two days aren't counted yet)` : "";
  return `${pct}% of ${c.rate_base.toLocaleString("en")} who started finished${pending}.`;
}

/** Stop points in survey order, with friendly names; only stages that occur. */
export const STAGES: { key: string; label: string }[] = [
  { key: "not_started", label: "Before the first question" },
  { key: "age", label: "Age" },
  { key: "screener", label: "Opening questions" },
  { key: "index", label: "Main questions" },
  { key: "extras_offer", label: "Extras offer" },
  { key: "extras", label: "Optional extras" },
  { key: "about_you", label: "About you" },
];

export function stopPoints(c: Completion): { label: string; n: number; share: number }[] {
  if (!c.stop_points) return [];
  const total = Object.values(c.stop_points).reduce((a, b) => a + b, 0);
  return STAGES.filter((s) => c.stop_points![s.key])
    .map((s) => ({ label: s.label, n: c.stop_points![s.key], share: total ? c.stop_points![s.key] / total : 0 }));
}
