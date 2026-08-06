import instrumentV1 from "@/data/instrument.v1.json";
import {
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
} from "@/lib/branching";

export type { Answers, AnswerValue, ShowIf, ShowIfCondition };

export type Locale = "en" | "es";

export interface LocalizedText {
  en: string;
  es?: string;
}

export interface InstrumentOption {
  value: string | number;
  text: LocalizedText;
}

export interface InstrumentItem {
  key: string;
  question_domain: "follow" | "mission" | "world" | "screener" | "journey" | "demographic";
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
  session_field?: "age_band" | "gender" | "country" | "city";
  /** Quality-control item: `expected` is the value an attentive respondent gives. */
  attention_check?: { expected: number | string };
  max_length?: number;
  help?: LocalizedText;
  text: LocalizedText;
  options?: InstrumentOption[];
}

export interface Instrument {
  version: string;
  scoringVersion: string;
  locales: Locale[];
  items: InstrumentItem[];
}

export const instrument = instrumentV1 as unknown as Instrument;

/**
 * How many questions each item set actually asks.
 *
 * Derived, never typed in. The console tells a youth pastor "the twelve, about
 * four minutes" and that sentence has to stay true when the research panel
 * changes the instrument — so it counts the JSON rather than trusting a
 * constant somebody forgot to update.
 */
export const CORE_COUNT = instrument.items.filter((i) => i.core).length;
export const TOTAL_COUNT = instrument.items.length;

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

export function visibleItems(answers: Answers, inst: Instrument = instrument): InstrumentItem[] {
  return visible(inst.items, answers);
}

export function nextVisibleIndex(
  fromIndex: number,
  answers: Answers,
  inst: Instrument = instrument,
): number {
  return nextIdx(inst.items, fromIndex, answers);
}

export function prevVisibleIndex(
  fromIndex: number,
  answers: Answers,
  inst: Instrument = instrument,
): number {
  return prevIdx(inst.items, fromIndex, answers);
}

export function orphanedAnswers(answers: Answers, inst: Instrument = instrument): InstrumentItem[] {
  return orphaned(inst.items, answers);
}

export function failedAttentionChecks(
  answers: Answers,
  inst: Instrument = instrument,
): string[] {
  return failedChecks(inst.items, answers);
}
