/**
 * Integrity checks on an instrument definition — the rules the brief sets
 * for the item bank (CLAUDE.md §2–3), computed from the JSON itself so the
 * instrument admin UI shows them live and tests/instrumentChecks.test.ts
 * holds the shipped file to them.
 *
 * No imports: tests load this file directly.
 */
export type CheckItem = {
  key: string;
  question_domain: string;
  tier: string;
  type: string;
  scored: boolean;
  core?: boolean;
  core_activity?: boolean;
  reverse_scored?: boolean;
  measure?: string;
  section?: string;
  attention_check?: unknown;
  text: Record<string, string>;
  options?: { value: string | number; text: Record<string, string> }[];
};

export type Check = { id: string; label: string; ok: boolean; detail: string };

export const QUESTIONS = ["follow", "mission", "world"] as const;
export const TIER_ORDER = ["exposure", "response", "formation", "multiplication"] as const;

export function cellCounts(items: CheckItem[]): Record<string, Record<string, number>> {
  const m: Record<string, Record<string, number>> = {};
  for (const q of QUESTIONS) m[q] = Object.fromEntries(TIER_ORDER.map((t) => [t, 0]));
  for (const it of items) if (it.scored && m[it.question_domain] && it.tier in m[it.question_domain]) m[it.question_domain][it.tier]++;
  return m;
}

export function runChecks(items: CheckItem[], locales: string[]): Check[] {
  const scored = items.filter((i) => i.scored && (QUESTIONS as readonly string[]).includes(i.question_domain));
  const cells = cellCounts(items);
  const counts = QUESTIONS.flatMap((q) => TIER_ORDER.map((t) => cells[q][t]));
  const emptyCells = QUESTIONS.flatMap((q) => TIER_ORDER.filter((t) => cells[q][t] === 0).map((t) => `${q} × ${t}`));
  const core = items.filter((i) => i.core);
  const coreCells = new Set(core.map((i) => `${i.question_domain}:${i.tier}`));
  const keys = items.map((i) => i.key);
  const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);

  const missingText: string[] = [];
  for (const it of items)
    for (const l of locales) {
      if (!it.text?.[l]?.trim()) missingText.push(`${it.key} (${l})`);
      for (const o of it.options ?? []) if (!o.text?.[l]?.trim()) missingText.push(`${it.key}·${o.value} (${l})`);
    }

  const internal = scored.filter((i) => i.measure === "internal").length;
  const external = scored.filter((i) => i.measure === "external").length;
  const noMeasure = scored.filter((i) => !i.measure).map((i) => i.key);
  const coreActivities = items.filter((i) => i.core_activity);
  // The brief (non-negotiable #5) allows either a scored frequency item or an
  // explicit decision to measure through the insight layers. What must always
  // hold is that both are ASKED as frequencies — so they can be reported.
  const coreActivitiesOk = coreActivities.length >= 2 && coreActivities.every((i) => i.type === "frequency");
  const noSection = items.filter((i) => !i.section).map((i) => i.key);
  const insightScored = items.filter((i) => (i.section === "driver" || i.section === "journey") && i.scored).map((i) => i.key);

  return [
    {
      id: "matrix",
      label: "Every cell of the 3 × 4 model has scored items",
      ok: emptyCells.length === 0,
      detail: emptyCells.length ? `Empty: ${emptyCells.join(", ")}` : `${scored.length} scored items · ${Math.min(...counts)}–${Math.max(...counts)} per cell`,
    },
    {
      id: "core",
      label: "The core set covers all twelve cells",
      ok: coreCells.size === 12,
      detail: `${core.length} core items across ${coreCells.size} of 12 cells`,
    },
    {
      id: "core_activities",
      label: "Weekly prayer and scripture are measurable (non-negotiable #5)",
      ok: coreActivitiesOk,
      detail: coreActivities.length
        ? coreActivities.map((i) => `${i.key} (${i.type}, ${i.scored ? "scored into the Index" : "unscored — reported alongside the Index"})`).join(" · ")
        : "No item is marked core_activity",
    },
    {
      id: "orientation",
      label: "Every scored item carries an orientation tag (internal / external)",
      ok: noMeasure.length === 0,
      detail: noMeasure.length ? `Missing: ${noMeasure.join(", ")}` : `${internal} internal · ${external} external`,
    },
    {
      id: "section",
      label: "Every question carries a section tag",
      ok: noSection.length === 0,
      detail: noSection.length ? `Missing: ${noSection.join(", ")}` : `${items.length} questions tagged`,
    },
    {
      id: "insight",
      label: "Drivers and Journey stay unscored (non-negotiable #9)",
      ok: insightScored.length === 0,
      detail: insightScored.length ? `Scored: ${insightScored.join(", ")}` : "Reported alongside the Index, never folded in",
    },
    {
      id: "translations",
      label: `Every question and option is translated (${locales.join(", ")})`,
      ok: missingText.length === 0,
      detail: missingText.length ? `${missingText.length} missing: ${missingText.slice(0, 6).join(", ")}${missingText.length > 6 ? "…" : ""}` : "Complete",
    },
    {
      id: "keys",
      label: "Item keys are unique",
      ok: dupes.length === 0,
      detail: dupes.length ? `Duplicated: ${[...new Set(dupes)].join(", ")}` : `${keys.length} unique keys`,
    },
  ];
}

/** Keys added and removed between two versions. */
export function diffKeys(a: CheckItem[], b: CheckItem[]): { added: string[]; removed: string[]; retagged: string[] } {
  const A = new Map(a.map((i) => [i.key, i]));
  const B = new Map(b.map((i) => [i.key, i]));
  return {
    added: [...B.keys()].filter((k) => !A.has(k)),
    removed: [...A.keys()].filter((k) => !B.has(k)),
    retagged: [...B.keys()].filter((k) => {
      const x = A.get(k);
      const y = B.get(k)!;
      return x && (x.question_domain !== y.question_domain || x.tier !== y.tier || !!x.scored !== !!y.scored || !!x.reverse_scored !== !!y.reverse_scored);
    }),
  };
}
