/**
 * Instrument lock (migration 0045) — pure, no imports, unit-tested
 * (tests/instrumentLock.test.ts).
 *
 * A locked version is frozen in everything that decides what a respondent is
 * asked and how it is scored: the items (keys, order, sections, tags, branch
 * rules, scales, options, ENGLISH wording), the scoring version, whether draft
 * items are fielded, and which items each survey version contains. Changing
 * any of that means a new version (v6), never an edit — responses bind to the
 * version they were captured under (non-negotiable #3).
 *
 * Deliberately NOT frozen: translations (they follow their own researcher
 * review, docs/TRANSLATION.md), the version note, survey-version labels and
 * descriptions, and the welcome-screen minutes — copy around the instrument,
 * not the instrument.
 *
 * The database holds the same rule with the same projection, written in SQL
 * (instrument_lock_projection(), 0045). Keep the two in step.
 */
export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

/** A localized text object ({en, es, …}) reduced to its English master. */
function enOnly(v: Json): Json {
  if (Array.isArray(v)) return v.map(enOnly);
  if (v && typeof v === "object") {
    if (typeof v.en === "string") return { en: v.en };
    const out: { [k: string]: Json } = {};
    for (const [k, x] of Object.entries(v)) out[k] = enOnly(x);
    return out;
  }
  return v;
}

/** The part of an instrument definition a lock freezes. */
export function lockProjection(def: { [k: string]: Json }): Json {
  const items = ((def.items as Json[]) ?? [])
    .map((i) => enOnly(i) as { [k: string]: Json })
    .sort((a, b) => String(a.key).localeCompare(String(b.key)));
  const sets: { [k: string]: Json } = {};
  for (const [name, s] of Object.entries((def.item_sets as { [k: string]: { [k: string]: Json } }) ?? {})) {
    sets[name] = { sections: s.sections ?? null, exclude_keys: s.exclude_keys ?? null };
  }
  return {
    version: def.version ?? null,
    scoringVersion: def.scoringVersion ?? null,
    field_draft_items: Boolean(def.field_draft_items),
    item_sets: sets,
    items,
  };
}

/** Deterministic JSON: object keys sorted at every level, so a hash is stable. */
export function canonical(v: Json): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
  return JSON.stringify(v);
}
