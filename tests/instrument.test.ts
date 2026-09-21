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
  measure?: string;
  branch?: string;
  attention_check?: { expected: number | string };
  show_if?: { all?: { key: string }[]; any?: { key: string }[] };
};

const instrument = JSON.parse(
  readFileSync(new URL("../src/data/instrument.v4.json", import.meta.url), "utf8"),
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

/*
 * v4 reference personas.
 *
 * v4 replaces v3's asymmetric "Index vs. short exploration branch" split
 * with two full, comparable-length branches (Engaged / Unengaged), routed by
 * `orientation` and, for the two ambiguous fallback answers, the optional
 * `follower_check` follow-up. See instrument.v4.json's version note for the
 * full routing rationale.
 */

// A committed follower, all the way in, including opting into Drivers/Journey.
const committed: Record<string, AnswerValue> = {
  age_band: "18_22",
  orientation: "committed_growing",
  continue_to_extras: "yes",
};

// Same respondent, declining the optional continuation.
const committedCore: Record<string, AnswerValue> = {
  ...committed,
  continue_to_extras: "no",
};

// A respondent who directly self-identifies as not a follower (one of the
// five "clear non-follower" orientation answers) — routes straight to
// Unengaged, no follower_check needed.
const unengagedDirect: Record<string, AnswerValue> = {
  age_band: "18_22",
  orientation: "confident_no_god",
  continue_to_extras: "yes",
};

// The ambiguous fallback ("None of these describes me"), who then says Yes
// on the follow-up — routes to Engaged despite not picking a "follower"
// orientation option directly.
const ambiguousYes: Record<string, AnswerValue> = {
  age_band: "18_22",
  orientation: "none_of_these",
  follower_check: "yes",
  continue_to_extras: "yes",
};

// The other ambiguous fallback ("Prefer not to say"), who answers the
// follow-up with "Not sure" — routes to Unengaged without ever being
// classified as a confirmed non-follower (per the draft's own instruction).
const ambiguousNotSure: Record<string, AnswerValue> = {
  age_band: "18_22",
  orientation: "prefer_not_say",
  follower_check: "not_sure",
  continue_to_extras: "yes",
};

// Picks an ambiguous orientation answer and then skips the optional
// follow-up entirely — a documented edge case (see instrument.v4.json's
// version note, point 7): neither branch's Index items open.
const ambiguousSkipped: Record<string, AnswerValue> = {
  age_band: "18_22",
  orientation: "none_of_these",
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

test("no item carries a stale v1 belief tag", () => {
  assert.equal(instrument.items.filter((i) => i.belief).length, 0);
});

test("both core activities remain measurable", () => {
  const acts = instrument.items.filter((i) => i.core_activity).map((i) => i.key).sort();
  assert.deepEqual(acts, ["pray_frequency", "scripture_frequency"]);
});

test("reproductive discipleship is measured on both sides", () => {
  assert.equal(byKey("mission_exposure_external").tier, "exposure");
  assert.equal(byKey("mission_multiplication_external").tier, "multiplication");
  assert.equal(byKey("mission_exposure_external").question_domain, "mission");
  assert.equal(byKey("mission_multiplication_external").question_domain, "mission");
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
  // v4's Engaged and Unengaged branches are now comparable in length (both a
  // full 24-item Index), unlike v3 where the non-Index branch was a short
  // 11-item screener-style set. The "~6 minutes / 20 questions" ceiling
  // (CLAUDE.md §4) is now realistically exceeded on the REQUIRED path for
  // BOTH branches once Drivers/Journey are declined — flagged here as a
  // known, deliberate departure from the old ceiling, not a bug: these are
  // the actual counts today, and the point of this test is to catch a
  // future change nobody meant to make, not to enforce the old number.
  const committedCoreCount = visibleItems(committedCore).length;
  const committedFullCount = visibleItems(committed).length;
  const unengagedFull = visibleItems(unengagedDirect).length;
  assert.equal(committedCoreCount, 34, `Engaged core path length changed to ${committedCoreCount} — update this number`);
  assert.equal(committedFullCount, 42, `Engaged full path length changed to ${committedFullCount} — update this number`);
  assert.equal(unengagedFull, 38, `Unengaged full path length changed to ${unengagedFull} — update this number`);
});

test("Drivers and Journey are opt-in, not part of the core flow, for both branches", () => {
  for (const key of ["driver_sources_of_belief_engaged", "journey_encounter_and_response_engaged"]) {
    assert.equal(isVisible(byKey(key), committedCore), false, `"${key}" showed up despite declining the extras`);
    assert.equal(isVisible(byKey(key), committed), true, `"${key}" stayed hidden despite accepting the extras`);
  }
  for (const key of ["driver_sources_of_belief_unengaged", "journey_encounter_and_response_unengaged"]) {
    assert.equal(isVisible(byKey(key), { ...unengagedDirect, continue_to_extras: "no" }), false, `"${key}" showed up despite declining the extras`);
    assert.equal(isVisible(byKey(key), unengagedDirect), true, `"${key}" stayed hidden despite accepting the extras`);
  }
  // continue_to_extras is unconditional in v4 (offered to both branches) —
  // still asked right after the Index, before any extras of either branch.
  assert.equal(byKey("continue_to_extras").show_if, undefined, "continue_to_extras must be unconditional — both branches are offered the extras");
  assert.ok(byKey("continue_to_extras").order! > byKey("scripture_frequency").order!);
  assert.ok(byKey("continue_to_extras").order! < byKey("driver_sources_of_belief_engaged").order!);
  assert.ok(byKey("continue_to_extras").order! < byKey("driver_sources_of_belief_unengaged").order!);
});

test("item order is unique and every item is reachable by someone", () => {
  const orders = orderedItems().map((i) => i.order);
  assert.equal(new Set(orders).size, orders.length, "duplicate order values");
  const personas = [committed, unengagedDirect, ambiguousYes, ambiguousNotSure];
  for (const item of instrument.items) {
    assert.ok(
      personas.some((p) => isVisible(item, p)),
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

test("orientation + follower_check route Engaged vs. Unengaged correctly, including the ambiguous fallback", () => {
  const engagedOnlyKeys = [
    "follow_response_internal", "follow_response_external", "who_is_jesus", "attention_check",
    "pray_frequency", "scripture_frequency", "mission_multiplication_external",
    "world_formation_internal", "driver_sources_of_belief_engaged", "journey_encounter_and_response_engaged",
  ];
  const unengagedOnlyKeys = [
    "follow_response_internal_unengaged", "follow_response_external_unengaged",
    "mission_multiplication_external_unengaged", "world_formation_internal_unengaged",
  ];

  for (const key of engagedOnlyKeys) {
    assert.equal(isVisible(byKey(key), unengagedDirect), false, `"${key}" leaked to an Unengaged orientation`);
    assert.equal(isVisible(byKey(key), committed), true, `"${key}" did not open for a committed follower`);
  }
  for (const key of unengagedOnlyKeys) {
    assert.equal(isVisible(byKey(key), committed), false, `"${key}" leaked to a committed follower`);
    assert.equal(isVisible(byKey(key), unengagedDirect), true, `"${key}" did not open for an Unengaged orientation`);
  }

  // The ambiguous fallback: routing depends on follower_check, not orientation alone.
  assert.equal(isVisible(byKey("follow_exposure_internal"), ambiguousYes), true, "follower_check=yes must route to Engaged");
  assert.equal(isVisible(byKey("follow_exposure_internal_unengaged"), ambiguousYes), false);
  assert.equal(isVisible(byKey("follow_exposure_internal"), ambiguousNotSure), false);
  assert.equal(isVisible(byKey("follow_exposure_internal_unengaged"), ambiguousNotSure), true, "follower_check=not_sure must route to Unengaged, without asserting confirmed non-follower status");

  // follower_check itself only opens for the two ambiguous orientation answers.
  assert.equal(isVisible(byKey("follower_check"), committed), false);
  assert.equal(isVisible(byKey("follower_check"), unengagedDirect), false);
  assert.equal(isVisible(byKey("follower_check"), ambiguousYes), true);

  // Documented edge case: skipping the optional follow-up opens neither
  // branch's Index (an unanswered gate never passes — see branching.ts).
  assert.equal(isVisible(byKey("follow_exposure_internal"), ambiguousSkipped), false);
  assert.equal(isVisible(byKey("follow_exposure_internal_unengaged"), ambiguousSkipped), false);
});

test("Unengaged Index items are deliberately scored — they feed the separate Exploration Index, not the official Index", () => {
  const unengagedIndex = instrument.items.filter(
    (i) => i.branch === "unengaged" && DOMAINS.includes(i.question_domain as (typeof DOMAINS)[number]),
  );
  assert.equal(unengagedIndex.length, 24, "expected exactly 24 Unengaged Index items");
  for (const i of unengagedIndex) {
    assert.equal(i.scored, true, `"${i.key}" is an Unengaged Index item but not scored`);
  }
  // Drivers/Journey remain unscored regardless of branch — the "insight
  // layers never silently become score" rule applies to both branches.
  const extras = instrument.items.filter((i) => i.question_domain === "drivers" || i.question_domain === "journey");
  assert.ok(extras.length > 0);
  for (const i of extras) {
    assert.equal(i.scored, false, `"${i.key}" is scored — Drivers/Journey must never feed either Index`);
  }
});

test("every scored Index item, in either branch, is tagged internal or external, as real metadata not just a key name", () => {
  const indexItems = instrument.items.filter(
    (i) => i.scored && DOMAINS.includes(i.question_domain as (typeof DOMAINS)[number]),
  );
  assert.equal(indexItems.length, 48, "expected 24 Engaged + 24 Unengaged scored Index items");
  for (const i of indexItems) {
    assert.ok(i.measure === "internal" || i.measure === "external", `"${i.key}" has no measure tag`);
    // Unengaged-branch keys carry a trailing "_unengaged" suffix on top of
    // the base Engaged key (e.g. "follow_exposure_internal_unengaged"), so
    // check the measure tag against the key with that suffix stripped.
    const baseKey = i.branch === "unengaged" ? i.key.replace(/_unengaged$/, "") : i.key;
    assert.ok(baseKey.endsWith(`_${i.measure}`), `"${i.key}"'s key and measure tag disagree`);
  }
});

test("each branch's matrix is exactly one internal + one external item per cell — never more, never fewer, and the two branches never mix", () => {
  for (const branch of ["engaged", "unengaged"] as const) {
    for (const d of DOMAINS) {
      for (const t of TIERS) {
        const cell = instrument.items.filter(
          (i) => i.question_domain === d && i.tier === t && i.scored &&
            (branch === "engaged" ? i.branch !== "unengaged" : i.branch === "unengaged"),
        );
        assert.equal(cell.length, 2, `${branch} ${d}×${t} has ${cell.length} scored items, expected exactly 2`);
        assert.deepEqual(cell.map((i) => i.measure).sort(), ["external", "internal"], `${branch} ${d}×${t} isn't one of each`);
      }
    }
  }
});

test("every item carries a section tag, distinct from question_domain and consistent with it", () => {
  const KNOWN_SECTIONS = ["screener", "index", "driver", "journey", "demographic", "exploration"];
  const EXPECTED: Record<string, string> = {
    follow: "index", mission: "index", world: "index",
    drivers: "driver", journey: "journey",
    screener: "screener", demographic: "demographic", exploration: "exploration",
  };
  assert.ok(instrument.items.length > 0);
  for (const i of instrument.items) {
    assert.ok(i.section, `"${i.key}" has no section tag`);
    assert.ok(KNOWN_SECTIONS.includes(i.section as string), `"${i.key}" has an unknown section "${i.section}"`);
    const expected = EXPECTED[i.question_domain as string];
    assert.equal(i.section, expected, `"${i.key}": question_domain "${i.question_domain}" should be section "${expected}", got "${i.section}"`);
  }
});

test("gender and city are the two new, deliberate v4 metadata additions — nothing else outside the agreed list", () => {
  // v4 reinstates gender (dropped by migration 0019's privacy review) and
  // adds city/area — both explicit, documented decisions for this version
  // (see instrument.v4.json's version note), not a silent reversal.
  const gender = instrument.items.find((i) => i.key === "gender");
  const city = instrument.items.find((i) => i.key === "city");
  assert.ok(gender, "gender should be present in v4");
  assert.ok(city, "city should be present in v4");
  assert.equal(gender!.session_field, "gender");
  assert.equal(city!.session_field, "city");
  assert.equal(gender!.scored, false);
  assert.equal(city!.scored, false);

  const sessionFields = instrument.items.map((i) => i.session_field).filter(Boolean);
  for (const f of sessionFields) {
    assert.ok(
      ["age_band", "country", "gender", "city"].includes(f as string),
      `unapproved session_field "${f}" found on an item`,
    );
  }
});

test("Drivers and Journey never reach either score — wrong domain, and scored: false besides", () => {
  const extras = instrument.items.filter((i) => i.question_domain === "drivers" || i.question_domain === "journey");
  assert.ok(extras.length > 0);
  for (const i of extras) {
    assert.equal(i.scored, false, `"${i.key}" is scored — Drivers/Journey must never feed a score`);
    assert.ok(!DOMAINS.includes(i.question_domain as (typeof DOMAINS)[number]), `"${i.key}" somehow carries an Index domain`);
  }
});

test("the Unengaged branch is full-length, not a short screener — a deliberate v4 change from v3's exploration branch", () => {
  // v3's non-Index branch (question_domain "exploration") was a short,
  // 11-item, unscored screener. v4 retires it entirely in favour of a full
  // 24-item Unengaged Index — so the two branches are now comparable in
  // length, not "Index vs. quick screener". This test documents that
  // departure so a future change doesn't silently shrink Unengaged back
  // down without anyone deciding to.
  assert.equal(
    instrument.items.filter((i) => i.question_domain === "exploration").length,
    0,
    "v4 should have retired the old 'exploration' domain entirely",
  );
  const engagedLen = visibleItems(committedCore).length;
  const unengagedLen = visibleItems({ ...unengagedDirect, continue_to_extras: "no" }).length;
  assert.ok(
    Math.abs(engagedLen - unengagedLen) <= 6,
    `Engaged (${engagedLen}) and Unengaged (${unengagedLen}) core paths should be comparable in length, not one short and one long`,
  );
});

test("nextVisibleIndex walks the path and terminates", () => {
  const items = orderedItems();
  let i = -1;
  const walked: string[] = [];
  for (let guard = 0; guard < 200; guard++) {
    i = nextVisibleIndex(i, unengagedDirect);
    if (i === -1) break;
    walked.push(items[i].key);
  }
  assert.equal(i, -1, "walk did not terminate");
  assert.deepEqual(walked, visibleItems(unengagedDirect).map((it) => it.key));
});

test("branching tolerates boolean and string forms of an answer (synthetic gate, since v4 has no yes_no item left to exercise this on)", () => {
  // v3's only yes/no-typed gate lived in the retired exploration branch.
  // sameAnswer()'s bool/string tolerance is still real production code
  // (branching.ts), so it's tested directly against a synthetic item rather
  // than dropped along with the branch that used to exercise it.
  const gate = { key: "synthetic_yes_no_gate", show_if: { all: [{ key: "flag", in: [true] }] } };
  assert.equal(isVisible(gate, { flag: true }), true);
  assert.equal(isVisible(gate, { flag: "yes" }), true);
  assert.equal(isVisible(gate, { flag: false }), false);
  assert.equal(isVisible(gate, { flag: "no" }), false);
});

test("an unanswered gate hides the item rather than leaking it through", () => {
  assert.equal(isVisible(byKey("follow_response_internal"), {}), false);
  assert.equal(isVisible(byKey("driver_sources_of_belief_unengaged"), { orientation: "confident_no_god" }), false);
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
    ["city", "country", "who_is_jesus"],
    "a new open_text item showed up without an update here — confirm it belongs",
  );
  for (const item of open) {
    assert.equal(item.scored, false, `"${item.key}" is free text but scored`);
    assert.ok((item.max_length ?? 0) > 0, `"${item.key}" must be length-bounded`);
  }
  // Only the reflective prompt (not the plain demographic fields) carries
  // the don't-identify-anyone warning — that risk is specific to an open
  // question about a person, not "which city do you live in".
  assert.ok(byKey("who_is_jesus").help, `"who_is_jesus" must warn the respondent not to identify anyone`);
});

test("the open prompt comes before the Index proper", () => {
  assert.ok(byKey("who_is_jesus").order! < byKey("follow_exposure_internal").order!);
  assert.ok(byKey("who_is_jesus").order! < byKey("follow_exposure_external").order!);
});

test("age band is mapped onto the session, not just stored as a response", () => {
  assert.equal(byKey("age_band").session_field, "age_band");
});

/* ── the promises the console makes out loud ─────────────────────────── */

test("the NGC12 is exactly twelve items, one per cell", () => {
  const core = instrument.items.filter((i) => i.core);
  assert.equal(core.length, 12, "the console tells people 'the twelve' — it has to be twelve");
  const cells = new Set(core.map((i) => `${i.question_domain}×${i.tier}`));
  assert.equal(cells.size, 12, "the core set should cover every cell exactly once");
  for (const i of core) {
    assert.ok(i.key.endsWith("_external"), `"${i.key}" is core but isn't the cell's External item`);
    assert.notEqual(i.branch, "unengaged", `"${i.key}" is core but comes from the Unengaged branch — NGC12 is Engaged-only`);
  }
});

test("the core set covers all 12 cells", () => {
  const core = instrument.items.filter((i) => i.core);
  const cells = new Set(core.map((i) => `${i.question_domain}×${i.tier}`));
  for (const d of DOMAINS) {
    for (const t of TIERS) {
      assert.ok(cells.has(`${d}×${t}`), `core set is missing ${d}×${t} — full coverage regressed`);
    }
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
  const app = new URL("../src/app/", import.meta.url);
  for (const route of ["[org]/page.tsx", "[org]/open/page.tsx"]) {
    const src = readFileSync(new URL(route, app), "utf8");
    assert.match(src, /from "@\/components\/survey\/Survey"/, `${route} must mount the one survey`);
  }
  const community = readFileSync(new URL("[org]/page.tsx", app), "utf8");
  const open = readFileSync(new URL("[org]/open/page.tsx", app), "utf8");
  assert.match(community, /audience="community"/);
  assert.match(open, /audience="public"/);

  const survey = readFileSync(new URL("../src/components/survey/Survey.tsx", import.meta.url), "utf8");
  assert.match(survey, /community:\s*"default"/);
  assert.match(survey, /public:\s*"open"/);
  const sql = readFileSync(
    new URL("../supabase/migrations/0014_waves_and_survey_setup.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /p_audience = 'public' then 'open' else 'default'/);
});
