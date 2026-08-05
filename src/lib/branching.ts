/**
 * NGJFI branching engine — pure, dependency-free, and driven entirely by config.
 *
 * The instrument declares, per item, a `show_if` rule referring to earlier
 * answers. Nothing about the survey's shape is hard-coded here or in the UI:
 * adding, removing or re-gating a question is a change to the instrument JSON.
 *
 * Because visibility is a pure function of (instrument version, answers), a
 * skipped item needs no database row. "Was this skipped, or abandoned?" is
 * always recomputable after the fact from the answers that were stored and the
 * instrument version the responses bind to.
 */

export type AnswerValue = string | number | boolean | string[] | null | undefined;

export type Answers = Record<string, AnswerValue>;

/**
 * One clause of a visibility rule, evaluated against an earlier answer.
 * Operators combine with AND within a clause; normally only one is set.
 */
export interface ShowIfCondition {
  key: string;
  in?: AnswerValue[];
  not_in?: AnswerValue[];
  gte?: number;
  lte?: number;
}

/**
 * An item is shown when EVERY clause in `all` passes AND AT LEAST ONE clause in
 * `any` passes. A missing group counts as satisfied, so `{all: […]}` and
 * `{any: […]}` each work alone.
 */
export interface ShowIf {
  all?: ShowIfCondition[];
  any?: ShowIfCondition[];
}

/** The minimum an item must expose for branching; the full type lives in instrument.ts. */
export interface BranchableItem {
  key: string;
  order?: number;
  show_if?: ShowIf;
  attention_check?: { expected: number | string };
}

/** Compare answers tolerantly across the yes/no and string/number round-trips. */
export function sameAnswer(a: AnswerValue, b: AnswerValue): boolean {
  if (a === b) return true;
  const asBool = (v: AnswerValue): AnswerValue =>
    v === true || v === 1 || v === "1" || v === "true" || v === "yes"
      ? true
      : v === false || v === 0 || v === "0" || v === "false" || v === "no"
        ? false
        : v;
  if (typeof a === "boolean" || typeof b === "boolean") return asBool(a) === asBool(b);
  if (typeof a === "number" || typeof b === "number") {
    const na = Number(a);
    const nb = Number(b);
    return Number.isFinite(na) && Number.isFinite(nb) && na === nb;
  }
  return false;
}

function conditionPasses(c: ShowIfCondition, answers: Answers): boolean {
  const v = answers[c.key];
  // An unanswered gate never passes: rules must reference items asked earlier,
  // so an item behind an unanswered gate stays hidden rather than leaking through.
  if (v === undefined || v === null || v === "") return false;
  if (c.in && !c.in.some((x) => sameAnswer(x, v))) return false;
  if (c.not_in && c.not_in.some((x) => sameAnswer(x, v))) return false;
  if (c.gte !== undefined && !(Number(v) >= c.gte)) return false;
  if (c.lte !== undefined && !(Number(v) <= c.lte)) return false;
  return true;
}

/** Should this item be asked, given what the respondent has already answered? */
export function isVisible(item: BranchableItem, answers: Answers): boolean {
  const rule = item.show_if;
  if (!rule) return true;
  if (rule.all && !rule.all.every((c) => conditionPasses(c, answers))) return false;
  if (rule.any && rule.any.length > 0 && !rule.any.some((c) => conditionPasses(c, answers)))
    return false;
  return true;
}

/** Items sorted by display order. */
export function inOrder<T extends BranchableItem>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/** The items a respondent with these answers should see, in order. */
export function visibleItems<T extends BranchableItem>(items: T[], answers: Answers): T[] {
  return inOrder(items).filter((i) => isVisible(i, answers));
}

/**
 * Index (into the ordered list) of the next item to ask after `fromIndex`,
 * or -1 when the respondent is done. Re-evaluated against answers as they
 * stand, so a later answer can open a branch not yet reached.
 */
export function nextVisibleIndex<T extends BranchableItem>(
  items: T[],
  fromIndex: number,
  answers: Answers,
): number {
  const ordered = inOrder(items);
  for (let i = fromIndex + 1; i < ordered.length; i++) {
    if (isVisible(ordered[i], answers)) return i;
  }
  return -1;
}

/** Index of the previous visible item before `fromIndex`, or -1 if there is none. */
export function prevVisibleIndex<T extends BranchableItem>(
  items: T[],
  fromIndex: number,
  answers: Answers,
): number {
  const ordered = inOrder(items);
  for (let i = Math.min(fromIndex, ordered.length) - 1; i >= 0; i--) {
    if (isVisible(ordered[i], answers)) return i;
  }
  return -1;
}

/**
 * Items the respondent has answered that a later change has made irrelevant.
 * The survey withdraws these so a stored session never holds answers to
 * questions the instrument's own rules say were not asked.
 */
export function orphanedAnswers<T extends BranchableItem>(
  items: T[],
  answers: Answers,
): T[] {
  return items.filter((i) => answers[i.key] !== undefined && !isVisible(i, answers));
}

/** Attention-check items answered with something other than the expected value. */
export function failedAttentionChecks<T extends BranchableItem>(
  items: T[],
  answers: Answers,
): string[] {
  return items
    .filter((i) => i.attention_check && answers[i.key] !== undefined)
    .filter((i) => !sameAnswer(i.attention_check!.expected, answers[i.key]))
    .map((i) => i.key);
}
