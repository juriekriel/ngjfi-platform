/**
 * What changed between two instrument versions — for the console's
 * "Instrument versions" band, which steps through every version file in
 * src/data (v1 → the live one) one tab at a time.
 *
 * Pure functions over the version JSON, no network and no database, so the
 * console and tests/instrumentDiff.test.ts read the same answer. A respondent
 * never sees any of this: older versions stay in the repo as the record and
 * are shown only to administrators (CLAUDE.md non-negotiable #3).
 */

type Localized = { en?: string; [lang: string]: string | undefined };
type Option = { value: string | number; text?: Localized; ends_survey?: boolean };

export type DiffItem = {
  key: string;
  text?: Localized;
  section?: string;
  question_domain?: string;
  tier?: string;
  type?: string;
  scored?: boolean;
  reverse_scored?: boolean;
  measure?: string;
  branch?: string;
  options?: Option[];
  show_if?: unknown;
  archived?: boolean;
  draft?: boolean;
  attention_check?: unknown;
};

export type DiffInstrument = {
  version: string;
  scoringVersion?: string;
  note?: string;
  welcome_minutes?: number;
  field_draft_items?: boolean;
  item_sets?: Record<string, { welcome_minutes?: number; label?: Localized }>;
  locales?: string[];
  lock?: { locked?: boolean; locked_on?: string; decided_by?: string; decisions_recorded?: string[] };
  items: DiffItem[];
};

/** The tags that decide how an answer is scored or routed. A change to any of them is a "re-tag". */
const TAGS = ["section", "question_domain", "tier", "type", "scored", "reverse_scored", "measure", "branch"] as const;

export type Retag = { key: string; text: string; changes: { field: string; from: string; to: string }[] };
export type Reword = { key: string; from: string; to: string };
export type OptionChange = { key: string; text: string; added: string[]; removed: string[]; relabelled: string[] };

export type VersionSummary = {
  version: string;
  items: number;
  /** What a respondent can actually be asked: not archived, and not a draft unless the version fields drafts. */
  fielded: number;
  scored: number;
  archived: number;
  draft: number;
  minutes: { full?: number; j12?: number };
  locked_on: string | null;
  decided_by: string | null;
  scoring_version: string | null;
  locales: string[];
  decisions: string[];
  note: string | null;
};

export type VersionDiff = {
  from: string;
  to: string;
  added: { key: string; text: string; section?: string; scored: boolean }[];
  removed: { key: string; text: string; section?: string; scored: boolean }[];
  reworded: Reword[];
  retagged: Retag[];
  options: OptionChange[];
  routing: { key: string; text: string }[];
  archived: { key: string; text: string }[];
  restored: { key: string; text: string }[];
  /** Version-level changes: minutes, survey versions, scoring version, languages, drafts. */
  meta: { label: string; from: string; to: string }[];
  /** True when nothing a respondent is asked, or how it is scored, changed. */
  same: boolean;
};

const en = (t?: Localized) => (t?.en ?? "").trim();
const show = (v: unknown) => (v === undefined || v === null || v === "" ? "—" : String(v));
const canon = (v: unknown): string => JSON.stringify(v ?? null, (_k, x) =>
  x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x);

export function isFielded(i: DiffItem, inst: Pick<DiffInstrument, "field_draft_items">): boolean {
  return !i.archived && (!i.draft || Boolean(inst.field_draft_items));
}

export function summarize(inst: DiffInstrument): VersionSummary {
  const fielded = inst.items.filter((i) => isFielded(i, inst));
  return {
    version: inst.version,
    items: inst.items.length,
    fielded: fielded.length,
    scored: fielded.filter((i) => i.scored).length,
    archived: inst.items.filter((i) => i.archived).length,
    draft: inst.items.filter((i) => i.draft).length,
    minutes: {
      full: inst.item_sets?.full?.welcome_minutes ?? inst.welcome_minutes,
      j12: inst.item_sets?.j12?.welcome_minutes,
    },
    locked_on: inst.lock?.locked ? inst.lock.locked_on ?? null : null,
    decided_by: inst.lock?.decided_by ?? null,
    scoring_version: inst.scoringVersion ?? null,
    locales: inst.locales ?? [],
    decisions: inst.lock?.decisions_recorded ?? [],
    note: inst.note ?? null,
  };
}

export function versionDiff(prev: DiffInstrument, next: DiffInstrument): VersionDiff {
  const before = new Map(prev.items.map((i) => [i.key, i]));
  const after = new Map(next.items.map((i) => [i.key, i]));
  const brief = (i: DiffItem) => ({ key: i.key, text: en(i.text), section: i.section, scored: Boolean(i.scored) });

  const added = next.items.filter((i) => !before.has(i.key)).map(brief);
  const removed = prev.items.filter((i) => !after.has(i.key)).map(brief);
  const reworded: Reword[] = [];
  const retagged: Retag[] = [];
  const options: OptionChange[] = [];
  const routing: { key: string; text: string }[] = [];
  const archived: { key: string; text: string }[] = [];
  const restored: { key: string; text: string }[] = [];

  for (const b of next.items) {
    const a = before.get(b.key);
    if (!a) continue;
    const text = en(b.text);
    if (en(a.text) !== text) reworded.push({ key: b.key, from: en(a.text), to: text });

    const changes = TAGS.filter((f) => canon(a[f] ?? null) !== canon(b[f] ?? null)).map((f) => ({
      field: f,
      from: show(a[f]),
      to: show(b[f]),
    }));
    if (changes.length) retagged.push({ key: b.key, text, changes });

    const oa = new Map((a.options ?? []).map((o) => [String(o.value), o]));
    const ob = new Map((b.options ?? []).map((o) => [String(o.value), o]));
    const optAdded = [...ob.keys()].filter((v) => !oa.has(v)).map((v) => en(ob.get(v)!.text) || v);
    const optRemoved = [...oa.keys()].filter((v) => !ob.has(v)).map((v) => en(oa.get(v)!.text) || v);
    const relabelled = [...ob.keys()]
      .filter((v) => oa.has(v) && (en(oa.get(v)!.text) !== en(ob.get(v)!.text) || Boolean(oa.get(v)!.ends_survey) !== Boolean(ob.get(v)!.ends_survey)))
      .map((v) => `${en(oa.get(v)!.text) || v} → ${en(ob.get(v)!.text) || v}${ob.get(v)!.ends_survey ? " (ends the survey)" : ""}`);
    if (optAdded.length || optRemoved.length || relabelled.length)
      options.push({ key: b.key, text, added: optAdded, removed: optRemoved, relabelled });

    if (canon(a.show_if) !== canon(b.show_if)) routing.push({ key: b.key, text });
    if (!a.archived && b.archived) archived.push({ key: b.key, text });
    if (a.archived && !b.archived) restored.push({ key: b.key, text });
  }

  const sa = summarize(prev);
  const sb = summarize(next);
  const meta: VersionDiff["meta"] = [];
  const m = (label: string, from: unknown, to: unknown) => {
    if (canon(from ?? null) !== canon(to ?? null)) meta.push({ label, from: show(from), to: show(to) });
  };
  m("Full survey length (minutes)", sa.minutes.full, sb.minutes.full);
  m("J12-only length (minutes)", sa.minutes.j12, sb.minutes.j12);
  m("Survey versions", Object.keys(prev.item_sets ?? {}).join(", ") || undefined, Object.keys(next.item_sets ?? {}).join(", ") || undefined);
  m("Scoring version", prev.scoringVersion, next.scoringVersion);
  m("Languages", (prev.locales ?? []).join(", "), (next.locales ?? []).join(", "));
  m("Draft items fielded", prev.field_draft_items ?? false, next.field_draft_items ?? false);

  const same =
    !added.length && !removed.length && !reworded.length && !retagged.length && !options.length && !routing.length &&
    !archived.length && !restored.length && !meta.length;
  return { from: prev.version, to: next.version, added, removed, reworded, retagged, options, routing, archived, restored, meta, same };
}

/** "v5" → 5; anything else sorts last. */
export function versionNumber(v: string): number {
  const n = Number(/^v(\d+)$/.exec(v)?.[1]);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}
