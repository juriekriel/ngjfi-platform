import instrumentV5 from "@/data/instrument.v5.json";
import {
  endsSurvey as endsRule,
  fieldable,
  inItemSet,
  failedAttentionChecks as failedChecks,
  inOrder,
  isVisible as ruleIsVisible,
  nextVisibleIndex as nextIdx,
  orphanedAnswers as orphaned,
  prevVisibleIndex as prevIdx,
  visibleItems as visible,
  type Answers,
  type AnswerValue,
  type ShowIf,
  type ShowIfCondition,
  type ItemSetDef,
} from "@/lib/branching";

export type { Answers, AnswerValue, ShowIf, ShowIfCondition, ItemSetDef };

export type Locale = "en" | "es";

export interface LocalizedText {
  en: string;
  es?: string;
}

export interface InstrumentOption {
  value: string | number;
  text: LocalizedText;
  /** Choosing this option ends the survey and discards the in-progress session
   * (e.g. an age below the cohort's range). Config, never an if in code. */
  ends_survey?: boolean;
}

export interface InstrumentItem {
  key: string;
  question_domain:
    | "follow" | "mission" | "world" | "screener" | "drivers" | "journey" | "exploration" | "demographic"
    /** Belong–Trust module (v5): unscored insight domains, reported beside the Index. */
    | "belong" | "trust" | "context";
  /** Index items only: which parallel branch of the instrument this item belongs to.
   * "engaged" (or omitted) feeds the official Index; "unengaged" feeds the separate
   * Exploration Index (src/lib/scoring.ts) and must never be blended with the Index. */
  branch?: "engaged" | "unengaged";
  tier: "exposure" | "response" | "formation" | "multiplication" | "na";
  type:
    | "likert_5"
    | "yes_no"
    | "frequency"
    | "single_select"
    | "multi_select"
    | "screener"
    | "open_text";
  scored: boolean;
  reverse_scored?: boolean;
  scale?: { points?: number };
  order?: number;
  core_activity?: boolean;
  /** Part of the NGC12 — the memorable core that can be fielded on its own. */
  core?: boolean;
  /** One of the four beliefs. */
  belief?: boolean;
  /** Only ask this item when the rule passes; otherwise skip it entirely. */
  show_if?: ShowIf;
  /** Also write the answer onto the session row (allow-listed column). */
  session_field?: "age_band" | "country" | "gender" | "city";
  /** Index items only: does this measure an internal belief or an observable/external action? */
  measure?: "internal" | "external";
  /** Quality-control item: `expected` is the value an attentive respondent gives. */
  attention_check?: { expected: number | string };
  max_length?: number;
  /** multi_select only: cap how many options can be chosen at once ("select up to three"). Omit for no cap. */
  max_select?: number;
  help?: LocalizedText;
  text: LocalizedText;
  options?: InstrumentOption[];
  /** Which part of the instrument this is — screener / index / driver / journey /
   * demographic / exploration. Distinct from question_domain: question_domain
   * carries the scoring dimension for Index items (follow/mission/world) and a
   * routing label for everything else; section is the single, versioned answer
   * to "which part of the instrument is this", per CLAUDE.md #3. */
  section?: "screener" | "index" | "driver" | "journey" | "demographic" | "exploration" | "module";
  /** section "module" only: which module this item belongs to (e.g. "belong_trust").
   * Modules are config — a new one needs no code beyond its label (src/lib/modules.ts). */
  module?: string;
  /** Wording is a working draft for co-design; not yet researcher-approved. */
  draft?: boolean;
  /** Where an item was first drafted, when it has since moved section (e.g. "belong_trust"). */
  origin?: string;
}

export interface Instrument {
  version: string;
  scoringVersion: string;
  locales: Locale[];
  items: InstrumentItem[];
  /** What the welcome screen promises for the main set, in minutes (researcher-owned copy). */
  welcome_minutes?: number;
  /** When false (the default), items marked `draft` are kept in the definition but never shown. */
  field_draft_items?: boolean;
  /** Named versions of the survey an organisation can field ("full", "j12"). Config, never code. */
  item_sets?: Record<string, ItemSetDef>;
}

export const instrument = instrumentV5 as unknown as Instrument;

/**
 * How many questions each item set actually asks.
 *
 * Derived, never typed in. The console tells a youth pastor "the twelve, about
 * four minutes" and that sentence has to stay true when the research panel
 * changes the instrument — so it counts the JSON rather than trusting a
 * constant somebody forgot to update.
 */
export const CORE_COUNT = instrument.items.filter((i) => i.core).length;
export const TOTAL_COUNT = fieldedItems().length;

/**
 * The items a respondent can actually be shown. Draft items (wording still in
 * co-design) stay in the definition — so reports, the admin UI and the tour
 * know about them — but are only fielded once a researcher sets
 * `field_draft_items: true` on the instrument. Fielding unapproved wording is a
 * decision, never a side effect of merging it.
 */
export function fieldedItems(inst: Instrument = instrument): InstrumentItem[] {
  return fieldable(inst.items, Boolean(inst.field_draft_items));
}

/** Does choosing `value` on `item` end the survey (an ineligible answer)? */
export function endsSurvey(item: InstrumentItem, value: AnswerValue): boolean {
  return endsRule(item, value);
}

/** Minutes promised on the welcome screen. */
export const WELCOME_MINUTES = instrument.welcome_minutes ?? 7;

/**
 * Item sets — the versions of the survey an organisation can field (instrument
 * config `item_sets`; migration 0044 stores which one each session was shown).
 * "full" always exists, whether or not the instrument spells it out.
 */
export type ItemSetName = string;
export const ITEM_SETS: { name: ItemSetName; label: string; description: string; minutes: number; count: number }[] = (() => {
  const sets = { full: {}, ...(instrument.item_sets ?? {}) } as Record<string, ItemSetDef>;
  return Object.entries(sets).map(([name, d]) => ({
    name,
    label: d.label?.en ?? (name === "full" ? "Full survey" : name),
    description: d.description?.en ?? "",
    minutes: d.welcome_minutes ?? WELCOME_MINUTES,
    count: inItemSet(fieldedItems(), instrument.item_sets, name).length,
  }));
})();

/** A name the instrument knows, or "full". */
export function knownItemSet(name: string | null | undefined): ItemSetName {
  return name && ITEM_SETS.some((s) => s.name === name) ? name : "full";
}

/** The fielded items of one set, in order. */
export function itemSetItems(name: string | null | undefined, inst: Instrument = instrument): InstrumentItem[] {
  return inItemSet(fieldedItems(inst), inst.item_sets, knownItemSet(name));
}

/** Minutes the welcome screen promises for a set. */
export function itemSetMinutes(name: string | null | undefined): number {
  return ITEM_SETS.find((s) => s.name === knownItemSet(name))?.minutes ?? WELCOME_MINUTES;
}

/** The instrument as respondents meet it — the default for every path helper below. */
export const fielded: Instrument = { ...instrument, items: fieldedItems() };

/** Localized string with English fallback. */
export function t(text: LocalizedText, locale: Locale = "en"): string {
  return (locale === "es" && text.es) || text.en;
}

/** Items in display order. */
export function orderedItems(inst: Instrument = instrument): InstrumentItem[] {
  return inOrder(inst.items);
}

export function isVisible(item: InstrumentItem, answers: Answers): boolean {
  return ruleIsVisible(item, answers);
}

export function visibleItems(answers: Answers, inst: Instrument = fielded): InstrumentItem[] {
  return visible(inst.items, answers);
}

export function nextVisibleIndex(
  fromIndex: number,
  answers: Answers,
  inst: Instrument = fielded,
): number {
  return nextIdx(inst.items, fromIndex, answers);
}

export function prevVisibleIndex(
  fromIndex: number,
  answers: Answers,
  inst: Instrument = fielded,
): number {
  return prevIdx(inst.items, fromIndex, answers);
}

export function orphanedAnswers(answers: Answers, inst: Instrument = fielded): InstrumentItem[] {
  return orphaned(inst.items, answers);
}

export function failedAttentionChecks(
  answers: Answers,
  inst: Instrument = instrument,
): string[] {
  return failedChecks(inst.items, answers);
}
