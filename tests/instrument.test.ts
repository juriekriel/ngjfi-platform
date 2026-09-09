import { strict as assert } from "node:assert";
import { test } from "node:test";

import { readFileSync } from "node:fs";

import {
  failedAttentionChecks as failedChecks,
  inOrder,
  isVisible,
  nextVisibleIndex as nextIdx,
  visibleItems as visible,
  type AnswerValue,
} from "../src/lib/branching.ts";

// Read the canonical instrument the same way the seeder does, so the tests are
// asserting about the file that actually ships — not a fixture that can drift.
type InstrumentItem = {
  key: string;
  question_domain: string;
  tier: string;
  type: string;
  scored: boolean;
  order?: number;
  core?: boolean;
  belief?: boolean;
  core_activity?: boolean;
  session_field?: string;
  max_length?: number;
  help?: unknown;
  attention_check?: { expected: number | string };
  show_if?: { all?: { key: string }[]; any?: { key: string }[] };
};

const instrument = JSON.parse(
  readFileSync(new URL("../src/data/instrument.v2.json", import.meta.url), "utf8"),
) as { version: string; items: InstrumentItem[] };

const orderedItems = () => inOrder(instrument.items);
const visibleItems = (a: Record<string, AnswerValue>) => visible(instrument.items, a);
const nextVisibleIndex = (from: number, a: Record<string, AnswerValue>) =>
  nextIdx(instrument.items, from, a);
const failedAttentionChecks = (a: Record<string, AnswerValue>) =>
  failedChecks(instrument.items, a);

const byKey = (k: string): InstrumentItem => {
  const it = instrument.items.find((i) => i.key === k);
  assert.ok(it, `instrument is missing item "${k}"`);
  return it!;
};

const DOMAINS = ["follow", "mission", "world"] as const;
const TIERS = ["exposure", "response", "formation", "multiplication"] as const;

// A respondent who is all the way in — used as the "everything visible" baseline.
const committed: Record<string, AnswerValue> = {
  age_band: "18_22",
  heard_story: "yes",
  orientation: "committed_growing",
  identify_as_follower: 5,
};

// Someone who has heard of Jesus but is not engaged.
const notEngaged: Record<string, AnswerValue> = {
  age_band: "18_22",
  heard_story: "yes",
  orientation: "confident_no_god",
};

// Someone who has never heard the story.
const neverHeard: Record<string, AnswerValue> = {
  age_band: "13_17",
  heard_story: "no",
  orientation: "open_not_exploring",
};

// Someone on the exploration branch who has also answered its two follow-up
// gates — needed so explore_who_talked / explore_pray_to are reachable at all.
const notEngagedFollowUp: Record<string, AnswerValue> = {
  ...notEngaged,
  explore_heard_about_jesus: true,
  explore_pray: "yes",
};

test("every domain × tier cell has at least one scored item", () => {
  for (const d of DOMAINS) {
    for (const t of TIERS) {
      const n = instrument.items.filter(
        (i) => i.question_domain === d && i.tier === t && i.scored,
      ).length;
      assert.ok(n > 0, `${d} × ${t} has no scored item — the matrix would render empty`);
    }
  }
});

test("the four beliefs are present as separate, single-claim items", () => {
  const beliefs = instrument.items.filter((i) => i.belief).map((i) => i.key);
  assert.deepEqual(beliefs.sort(), [
    "bible_is_word",
    "forgiveness_through_jesus",
    "god_exists",
    "jesus_is_son_of_god",
  ]);
});

test("both core activities remain measurable", () => {
  const acts = instrument.items.filter((i) => i.core_activity).map((i) => i.key).sort();
  assert.deepEqual(acts, ["pray_frequency", "scripture_frequency"]);
});

test("reproductive discipleship is measured on both sides", () => {
  assert.equal(byKey("being_mentored").tier, "formation");
  assert.equal(byKey("mentoring_someone").tier, "multiplication");
  assert.equal(byKey("mentoring_someone").question_domain, "follow");
});

test("the NGC12 core is exactly twelve items and covers all three domains", () => {
  const core = instrument.items.filter((i) => i.core);
  assert.equal(core.length, 12);
  for (const d of DOMAINS) {
    assert.ok(
      core.some((i) => i.question_domain === d),
      `the core set never asks about ${d}`,
    );
  }
});

test("no single respondent path exceeds the agreed ceiling for a fielded set", () => {
  // "1 question is best, 12 can be done, 20 is the max" applies to the SHORT,
  // exploratory paths. The full Index (committed_growing / new_follower) was
  // already 25 items before v2 and is unchanged here — that ceiling is the
  // one the original test enforced (instrument.items.length <= 25), carried
  // forward per-path instead of as a raw total.
  const full = visibleItems(committed).length;
  assert.ok(full <= 25, `the full Index path asks ${full} questions — grew past 25`);
  for (const [name, answers] of Object.entries({ notEngaged, neverHeard })) {
    const n = visibleItems(answers).length;
    assert.ok(n <= 20, `the "${name}" (exploration) path asks ${n} questions — over the agreed ceiling`);
  }
});

test("item order is unique and every item is reachable by someone", () => {
  const orders = orderedItems().map((i) => i.order);
  assert.equal(new Set(orders).size, orders.length, "duplicate order values");
  // v2 has two mutually exclusive branches — the Index (committed) and the
  // exploration branch (notEngaged / notEngagedFollowUp) — so no single
  // persona sees everything any more. An item is reachable if any reference
  // persona reaches it.
  for (const item of instrument.items) {
    assert.ok(
      isVisible(item, committed) || isVisible(item, notEngaged) || isVisible(item, notEngagedFollowUp),
      `"${item.key}" is visible to no reference persona — unreachable`,
    );
  }
});

test("gate items are asked before anything that depends on them", () => {
  const pos = new Map(orderedItems().map((i, idx) => [i.key, idx]));
  for (const item of instrument.items) {
    const clauses = [...(item.show_if?.all ?? []), ...(item.show_if?.any ?? [])];
    for (const c of clauses) {
      assert.ok(pos.has(c.key), `"${item.key}" gates on unknown item "${c.key}"`);
      assert.ok(
        pos.get(c.key)! < pos.get(item.key)!,
        `"${item.key}" gates on "${c.key}", which is asked later — it could never pass`,
      );
    }
  }
});

test("someone who has never heard the story is not asked about following", () => {
  assert.equal(isVisible(byKey("god_exists"), neverHeard), false);
  assert.equal(isVisible(byKey("pray_frequency"), neverHeard), false);
  assert.equal(isVisible(byKey("shared_faith_6mo"), neverHeard), false);
  assert.equal(isVisible(byKey("who_is_jesus"), neverHeard), false);

  // …but exposure is still measured, which is the whole point of the tier.
  assert.equal(isVisible(byKey("heard_story"), neverHeard), true);
  assert.equal(isVisible(byKey("someone_shared_with_me"), neverHeard), true);
  assert.equal(isVisible(byKey("seen_faith_do_good"), neverHeard), true);

  // …and instead of a dead end, they land in the exploration branch.
  assert.equal(isVisible(byKey("explore_believe_god"), neverHeard), true);
});

test("only new_follower / committed_growing reach the Index — everyone else gets the exploration branch", () => {
  for (const key of [
    "god_exists", "jesus_is_son_of_god", "identify_as_follower", "jesus_only_way",
    "pray_frequency", "scripture_frequency", "being_mentored", "mentoring_someone",
    "acted_on_need_6mo", "who_is_jesus",
  ]) {
    assert.equal(isVisible(byKey(key), notEngaged), false, `"${key}" leaked to a non-Index orientation`);
  }
  for (const key of [
    "explore_believe_god", "explore_open_experience", "explore_had_experience",
    "explore_influences", "explore_heard_about_jesus", "explore_pray",
    "explore_open_to_prayer", "explore_open_to_gathering", "explore_describe_jesus",
  ]) {
    assert.equal(isVisible(byKey(key), notEngaged), true, `"${key}" did not open for a non-Index orientation`);
  }
  // The two-level exploration items only open once their own gate is answered.
  assert.equal(isVisible(byKey("explore_who_talked"), notEngaged), false);
  assert.equal(isVisible(byKey("explore_who_talked"), notEngagedFollowUp), true);
  assert.equal(isVisible(byKey("explore_pray_to"), notEngaged), false);
  assert.equal(isVisible(byKey("explore_pray_to"), notEngagedFollowUp), true);
});

test("the exploration branch is entirely unscored", () => {
  const exploration = instrument.items.filter((i) => i.question_domain === "exploration");
  assert.ok(exploration.length > 0, "the exploration branch should not be empty");
  for (const i of exploration) {
    assert.equal(i.scored, false, `"${i.key}" is tagged exploration but scored — it must not feed the Index`);
  }
});


test("branching genuinely shortens the survey", () => {
  // v2: everyone answers the same four unconditional screener items, then
  // splits into exactly one of two paths. Both non-Index orientations land
  // on the same exploration branch and so ask the same count; the real
  // comparison is exploration vs. the (much longer) Index.
  const full = visibleItems(committed).length;
  const exploreShort = visibleItems(neverHeard).length;
  const exploreMid = visibleItems(notEngaged).length;
  assert.equal(exploreShort, exploreMid, "both non-Index orientations should reach the same branch");
  assert.ok(exploreShort < full, "the exploration branch should ask fewer questions than the full Index");
});

test("nextVisibleIndex walks the path and terminates", () => {
  const items = orderedItems();
  let i = -1;
  const walked: string[] = [];
  for (let guard = 0; guard < 200; guard++) {
    i = nextVisibleIndex(i, neverHeard);
    if (i === -1) break;
    walked.push(items[i].key);
  }
  assert.equal(i, -1, "walk did not terminate");
  assert.deepEqual(walked, visibleItems(neverHeard).map((it) => it.key));
});

test("yes/no gates tolerate boolean and string forms", () => {
  assert.equal(isVisible(byKey("god_exists"), { ...committed, heard_story: true }), true);
  assert.equal(isVisible(byKey("god_exists"), { ...committed, heard_story: "yes" }), true);
  assert.equal(isVisible(byKey("god_exists"), { ...committed, heard_story: false }), false);
  assert.equal(isVisible(byKey("god_exists"), { ...committed, heard_story: "no" }), false);
});

test("an unanswered gate hides the item rather than leaking it through", () => {
  assert.equal(isVisible(byKey("god_exists"), {}), false);
  assert.equal(isVisible(byKey("pray_frequency"), { heard_story: "yes" }), false);
});

test("attention check is unscored and detects inattentive answers", () => {
  const check = byKey("attention_check");
  assert.equal(check.scored, false);
  assert.deepEqual(failedAttentionChecks({ attention_check: 2 }), []);
  assert.deepEqual(failedAttentionChecks({ attention_check: 5 }), ["attention_check"]);
  assert.deepEqual(failedAttentionChecks({}), []);
});

test("every free-text item is unscored and length-capped", () => {
  const open = instrument.items.filter((i) => i.type === "open_text");
  assert.deepEqual(
    open.map((i) => i.key).sort(),
    ["explore_describe_jesus", "who_is_jesus"],
    "a new open_text item showed up without an update here — confirm it belongs",
  );
  for (const item of open) {
    assert.equal(item.scored, false, `"${item.key}" is free text but scored`);
    assert.ok((item.max_length ?? 0) > 0, `"${item.key}" must be length-bounded`);
    assert.ok(item.help, `"${item.key}" must warn the respondent not to identify anyone`);
  }
});

test("the open prompt comes before the leading belief items", () => {
  assert.ok(byKey("who_is_jesus").order! < byKey("god_exists").order!);
  assert.ok(byKey("who_is_jesus").order! < byKey("jesus_is_son_of_god").order!);
});

test("age band is mapped onto the session, not just stored as a response", () => {
  assert.equal(byKey("age_band").session_field, "age_band");
});

/* ── the promises the console makes out loud ─────────────────────────── */

test("the NGC12 is exactly twelve items and carries the 4 beliefs + 2 activities", () => {
  const core = instrument.items.filter((i) => i.core);
  assert.equal(core.length, 12, "the console tells people 'the twelve' — it has to be twelve");

  // The twelve are shaped by the Collab's metrics, not by the grid: the four
  // beliefs and both weekly activities must survive any future edit, because
  // they are what the coalition actually agreed to measure.
  assert.equal(core.filter((i) => i.belief).length, 4, "all four beliefs must be in the core set");
  assert.equal(
    core.filter((i) => i.core_activity).length,
    2,
    "weekly prayer and weekly scripture must be in the core set",
  );
});

test("the core set covers 8 of the 12 cells — and the UI must not claim otherwise", () => {
  // This is a REAL asymmetry, not a bug. Four of the twelve are the beliefs,
  // which all sit in follow × response, so the short set cannot fill the grid.
  // Consequence: an organisation fielding core-only gets an index and a funnel
  // weighted towards `follow`, and four empty matrix cells —
  // mission × exposure/response and world × exposure/response.
  //
  // The test exists so nobody writes "one item per cell" in a tooltip again,
  // and so a future panel decision to rebalance shows up here first.
  const core = instrument.items.filter((i) => i.core);
  const cells = new Set(core.map((i) => `${i.question_domain}×${i.tier}`));
  assert.equal(cells.size, 8, "core-set cell coverage changed — update the console copy with it");

  for (const missing of [
    "mission×exposure",
    "mission×response",
    "world×exposure",
    "world×response",
  ]) {
    assert.ok(!cells.has(missing), `${missing} is now covered — the honest-copy note can be relaxed`);
  }
});

test("the seed script cannot put a synthetic organisation in the live space", () => {
  const src = readFileSync(new URL("../scripts/sync-instrument.mjs", import.meta.url), "utf8");
  assert.match(src, /is_demo:\s*true/, "the demo persona must be seeded into the sandbox");
  assert.match(
    src,
    /existing\.is_demo === false/,
    "the script must refuse to overwrite an organisation already in the live space",
  );
  assert.match(
    src,
    /WITH_DEMO_ORG/,
    "creating an organisation must be opt-in — seeding the instrument is not",
  );
});

test("both links the console hands out have a route to land on", () => {
  // org_links() has published /<short_name>/open since migration 0011 and the
  // console now shows it with a Copy button. For a while the route did not
  // exist and every public link 404'd, which is the kind of thing you only
  // notice after someone has already pasted it into Instagram.
  const app = new URL("../src/app/", import.meta.url);
  for (const route of ["[org]/page.tsx", "[org]/open/page.tsx"]) {
    const src = readFileSync(new URL(route, app), "utf8");
    assert.match(src, /from "@\/components\/survey\/Survey"/, `${route} must mount the one survey`);
  }
  const community = readFileSync(new URL("[org]/page.tsx", app), "utf8");
  const open = readFileSync(new URL("[org]/open/page.tsx", app), "utf8");
  assert.match(community, /audience="community"/);
  assert.match(open, /audience="public"/);

  // And the slugs the survey looks for must match the ones campaign_upsert
  // writes, or the console would publish a link to a campaign nothing serves.
  const survey = readFileSync(new URL("../src/components/survey/Survey.tsx", import.meta.url), "utf8");
  assert.match(survey, /community:\s*"default"/);
  assert.match(survey, /public:\s*"open"/);
  const sql = readFileSync(
    new URL("../supabase/migrations/0014_waves_and_survey_setup.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /p_audience = 'public' then 'open' else 'default'/);
});
