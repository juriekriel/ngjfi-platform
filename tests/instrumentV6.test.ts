import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runChecks, diffKeys } from "../src/lib/instrumentChecks.ts";
import { fieldable, inItemSet, isVisible, visibleItems, failedAttentionChecks, type AnswerValue } from "../src/lib/branching.ts";

/*
 * v6 — the pilot instrument. Collab decisions of 14 Oct 2026 (Jurie Kriel), in
 * the review doc "Instrument v5 for researcher review (Matthew)". v5 stays
 * locked as the record (tests/instrument.test.ts keeps testing it as shipped).
 */
type Item = {
  key: string; order: number; section: string; type: string; scored: boolean; question_domain: string; tier: string;
  module?: string; draft?: boolean; archived?: boolean; branch?: string; measure?: string; reverse_scored?: boolean;
  session_field?: string; attention_check?: { expected: number | string };
  text: Record<string, string>; options?: { value: string | number; text: Record<string, string> }[];
  show_if?: { all?: { key: string; in?: AnswerValue[]; not_in?: AnswerValue[] }[]; any?: { key: string; in?: AnswerValue[]; not_in?: AnswerValue[] }[] };
} & Parameters<typeof runChecks>[0][number];
type Inst = {
  version: string; lock?: unknown; locales: string[]; welcome_minutes: number; field_draft_items: boolean; items: Item[];
  item_sets: Record<string, { sections?: string[]; exclude_keys?: string[]; welcome_minutes?: number }>;
  adopts_from?: Record<string, { drops_unscored: string[] }>;
};
const load = (v: string) => JSON.parse(readFileSync(`src/data/instrument.${v}.json`, "utf8")) as Inst;
const v5 = load("v5");
const v6 = load("v6");
const fielded = fieldable(v6.items, v6.field_draft_items);
const byKey = (k: string) => v6.items.find((i) => i.key === k);
const refs = (i: Item) => [...(i.show_if?.all ?? []), ...(i.show_if?.any ?? [])].map((c) => c.key);

const follower = { age_band: "18_22", orientation: "committed_growing" };
const exploring = { age_band: "18_22", orientation: "open_exploring" };
const ambiguousNo = { age_band: "18_22", orientation: "none_of_these", follower_check: "prefer_not_say" };
const ambiguousYes = { age_band: "18_22", orientation: "prefer_not_say", follower_check: "yes" };

test("v6 passes every integrity check", () => {
  for (const c of runChecks(v6.items, v6.locales)) assert.ok(c.ok, `${c.label} — ${c.detail}`);
});

test("v6 is the live instrument; v5 stays locked as the record", () => {
  assert.equal(v6.version, "v6");
  assert.match(readFileSync("src/lib/instrument.ts", "utf8"), /from "@\/data\/instrument\.v6\.json"/, "the app fields v6");
  assert.match(readFileSync("scripts/seed-instrument.mjs", "utf8"), /process\.argv\[2\] \?\? "v6"/, "the seed script defaults to v6");
  assert.equal((v5 as { lock?: { locked?: boolean } }).lock?.locked, true, "v5 stays locked");
});

test("Q4 who_is_jesus is dropped for the pilot (decision 1)", () => {
  assert.equal(byKey("who_is_jesus"), undefined);
  assert.ok(fielded.every((i) => i.type !== "open_text" || i.session_field === "country"), "no free-text question remains");
});

test("the extras offer is gone: everyone continues into Drivers & Journey for their route (decision 1)", () => {
  assert.equal(byKey("continue_to_extras"), undefined);
  for (const i of v6.items) assert.ok(!refs(i).includes("continue_to_extras"), `${i.key} still waits on the extras offer`);
  const dj = fielded.filter((i) => i.section === "driver" || i.section === "journey");
  assert.equal(dj.length, 16);
  for (const i of dj) {
    const engaged = i.branch !== "unengaged";
    for (const a of [follower, ambiguousYes]) assert.equal(isVisible(i, a), engaged, `${i.key} for a follower`);
    for (const a of [exploring, ambiguousNo]) assert.equal(isVisible(i, a), !engaged, `${i.key} for someone exploring`);
  }
  assert.ok(!(v6.item_sets.j12.exclude_keys ?? []).includes("continue_to_extras"));
});

test("Drivers & Journey are still unscored insight layers, never folded into a score (#9)", () => {
  for (const i of v6.items.filter((i) => ["driver", "journey"].includes(i.section))) {
    assert.equal(i.scored, false, i.key);
    assert.ok(!["follow", "mission", "world"].includes(i.question_domain), `${i.key} must not carry a score dimension`);
  }
});

test("Belong–Trust stays in the file as an archive option, and can't be fielded from v6 (decision 4)", () => {
  const mod = v6.items.filter((i) => i.module === "belong_trust");
  assert.equal(mod.length, 12);
  for (const i of mod) assert.equal(i.archived, true, `${i.key} is archived`);
  assert.equal(v6.field_draft_items, false);
  assert.equal(fieldable(v6.items, true).filter((i) => i.module === "belong_trust").length, 0, "not even with field_draft_items: true");
  for (const i of fielded) for (const r of refs(i)) assert.ok(byKey(r) && !byKey(r)!.archived, `${i.key} depends on archived ${r}`);
});

test("country is the pick-list, city is dropped, gender stays (decision 8)", () => {
  assert.equal(byKey("city"), undefined);
  assert.equal(byKey("country")!.session_field, "country", "rendered as the country dropdown (QuestionCard)");
  assert.equal(byKey("gender")!.session_field, "gender");
  const fields = v6.items.map((i) => i.session_field).filter(Boolean).sort();
  assert.deepEqual(fields, ["age_band", "country", "gender"]);
});

test("Route B has an attention check matching Route A's, in the same place (decision on Q17)", () => {
  const a = byKey("attention_check")!;
  const b = byKey("attention_check_unengaged")!;
  assert.deepEqual(b.text, a.text);
  assert.deepEqual(b.attention_check, a.attention_check);
  assert.equal(b.scored, false);
  assert.equal(b.section, a.section);
  // Each sits after the 12th scored item of its own route.
  const scoredBefore = (it: Item, unengaged: boolean) =>
    v6.items.filter((i) => i.scored && (i.branch === "unengaged") === unengaged && i.order < it.order).length;
  assert.equal(scoredBefore(a, false), 12);
  assert.equal(scoredBefore(b, true), 12);
  // Each route sees exactly its own check.
  for (const x of [follower, ambiguousYes]) assert.deepEqual(visibleItems(fielded, x).filter((i) => i.attention_check).map((i) => i.key), ["attention_check"]);
  for (const x of [exploring, ambiguousNo]) assert.deepEqual(visibleItems(fielded, x).filter((i) => i.attention_check).map((i) => i.key), ["attention_check_unengaged"]);
  assert.deepEqual(failedAttentionChecks(fielded, { attention_check_unengaged: 4 }), ["attention_check_unengaged"]);
  assert.deepEqual(failedAttentionChecks(fielded, { attention_check_unengaged: 2 }), []);
  assert.ok(inItemSet(fielded, v6.item_sets, "j12").some((i) => i.key === "attention_check_unengaged"), "J12 only keeps it");
});

test("every scored item is exactly as in v5 — v6 changes no score", () => {
  const scored = (v: Inst) => v.items.filter((i) => i.scored);
  assert.deepEqual(scored(v6), scored(v5));
  const d = diffKeys(v5.items, v6.items);
  assert.deepEqual(d.retagged, []);
  assert.deepEqual(d.added, ["attention_check_unengaged"]);
  assert.deepEqual([...d.removed].sort(), ["city", "continue_to_extras", "who_is_jesus"]);
});

test("adopts_from names exactly the unscored items v6 drops, so v5 campaigns can move (migration 0059)", () => {
  const drops = v6.adopts_from?.v5?.drops_unscored ?? [];
  const keys6 = new Set(v6.items.map((i) => i.key));
  const gone = v5.items.filter((i) => !keys6.has(i.key));
  assert.deepEqual([...drops].sort(), gone.map((i) => i.key).sort());
  for (const i of gone) assert.equal(i.scored, false, `${i.key} is scored — it can never be dropped`);
  assert.match(readFileSync("supabase/migrations/0059_adopt_dropping_unscored.sql", "utf8"), /p_drop_unscored text\[\]/);
  assert.match(readFileSync("scripts/seed-instrument.mjs", "utf8"), /adopts_from/);
});

test("the anchors shared by both routes are word-for-word identical and documented (method note)", () => {
  for (const k of ["world_exposure_external", "world_formation_external"]) {
    assert.equal(byKey(k)!.text.en, byKey(`${k}_unengaged`)!.text.en, k);
    assert.notEqual(byKey(k)!.branch, byKey(`${k}_unengaged`)!.branch, "still scored apart, never blended");
  }
  assert.match(v6.note as unknown as string ?? "", /anchors/);
});

test("routing gates can't be skipped: single choice with 'Prefer not to say' (proposal for decision 7)", () => {
  // In the survey only free text, the country dropdown and multi-select can be
  // submitted empty; single choice has no Skip. So every question the route
  // depends on must be single choice and offer a dignified way out.
  const gates = new Set(fielded.filter((i) => i.section === "index").flatMap(refs));
  assert.deepEqual([...gates].sort(), ["follower_check", "orientation"]);
  for (const k of gates) {
    const g = byKey(k)!;
    assert.equal(g.type, "single_select", `${k} must not be skippable`);
    assert.ok(g.options!.some((o) => o.value === "prefer_not_say"), `${k} offers "Prefer not to say"`);
  }
  // …and "Prefer not to say" on the follower check leads to Route B, not to neither.
  assert.ok(visibleItems(fielded, ambiguousNo).filter((i) => i.scored).every((i) => i.branch === "unengaged"));
  assert.equal(visibleItems(fielded, ambiguousNo).filter((i) => i.scored).length, 24);
});

test("weekly prayer and scripture stay measurable (#5, decision 5)", () => {
  for (const k of ["pray_frequency", "scripture_frequency"]) {
    const i = byKey(k)! as Item & { core_activity?: boolean };
    assert.equal(i.type, "frequency");
    assert.equal(i.core_activity, true);
    assert.ok(i.options!.some((o) => o.text.en === "Weekly"), "Weekly is an answer");
    assert.ok(i.options!.some((o) => o.text.en === "Most days"), "Weekly + Most days together meet the weekly core activity");
  }
});

test("the welcome promise is honest about the longer default path (decision 3)", () => {
  // Short screens 8–14 s; a multi-select list of 7–13 options 15–35 s.
  for (const [name, set] of [["full", null], ["j12", "j12"]] as const) {
    const items = set ? inItemSet(fielded, v6.item_sets, set) : fielded;
    const m = (set ? v6.item_sets[set].welcome_minutes : v6.welcome_minutes)!;
    for (const a of [follower, exploring, ambiguousNo]) {
      const vis = visibleItems(items, a);
      const multi = vis.filter((i) => i.type === "multi_select").length;
      const short = vis.length - multi;
      const lo = short * 8 + multi * 15;
      const hi = short * 14 + multi * 35;
      assert.ok(m * 60 >= lo && m * 60 <= hi, `${name}: ${m} min for ${vis.length} screens (${multi} multi-select) — plausible range ${(lo / 60).toFixed(1)}–${(hi / 60).toFixed(1)} min`);
    }
  }
  assert.equal(v6.item_sets.full.welcome_minutes, v6.welcome_minutes);
});
