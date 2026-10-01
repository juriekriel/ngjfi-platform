/**
 * Completions, segmented (migration 0047) — pure, unit-tested
 * (tests/completions.test.ts).
 *
 * Everyone who completes the Index counts: followers and those not yet
 * following. The total is always shown with its split, and never as one
 * score — followers' answers make the J12, non-followers' the Unengaged
 * matrix, and the two are never combined.
 */
export type Completions = { total: number; following: number; not_following: number };

export function completionsNote(c: Completions): string {
  return `${c.following.toLocaleString("en")} following · ${c.not_following.toLocaleString("en")} not yet following`;
}
