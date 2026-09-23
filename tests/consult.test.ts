import { strict as assert } from "node:assert";
import { test } from "node:test";
import { consultContext, consultSuggestions, type ConsultView } from "../src/lib/consult.ts";

/**
 * What a "What does this mean?" request carries. The database whitelists
 * these same keys (migration 0033); these tests pin the client side of that
 * contract — in particular that a room's name never travels on the Collab
 * tab, and that nothing but a description of the view is ever built.
 */
const base: ConsultView = {
  tab: "org", orgName: "Shoreline Church", roomName: null,
  view: "matrix", tier: "formation", tierLabel: "Formation", overlay: true, n: 186,
};

const ALLOWED = new Set(["tab", "scope", "room", "view", "tier", "overlay", "summary"]);

test("house view, matrix with overlay", () => {
  const c = consultContext(base);
  assert.equal(c.scope, "Shoreline Church · the whole house");
  assert.equal(c.summary, "Shoreline Church · the whole house · J12 matrix, Collab overlay on · n 186");
  assert.equal(c.room, undefined);
  assert.equal(c.tier, undefined);
});

test("room view names the room", () => {
  const c = consultContext({ ...base, roomName: "Kenya mission team", overlay: false, n: 54 });
  assert.equal(c.room, "Kenya mission team");
  assert.match(c.summary, /Kenya mission team · J12 matrix · n 54$/);
});

test("heat map carries the tier", () => {
  const c = consultContext({ ...base, view: "heatmap", overlay: false });
  assert.equal(c.tier, "formation");
  assert.match(c.summary, /Heat map, Formation/);
});

test("collab tab never carries a room", () => {
  const c = consultContext({ ...base, tab: "collab", roomName: "Kenya mission team" });
  assert.equal(c.room, undefined);
  assert.match(c.scope, /^Collab Intelligence/);
  assert.match(c.summary, /Shoreline Church overlay on/);
});

test("only whitelisted keys are ever built", () => {
  for (const v of [base, { ...base, view: "heatmap" as const }, { ...base, tab: "collab" as const }, { ...base, roomName: "X" }]) {
    for (const k of Object.keys(consultContext(v))) assert.ok(ALLOWED.has(k), `unexpected key ${k}`);
  }
});

test("three suggestions for every view", () => {
  for (const v of [base, { ...base, view: "heatmap" as const }, { ...base, tab: "collab" as const }]) {
    assert.equal(consultSuggestions(v).length, 3);
  }
  assert.match(consultSuggestions(base)[1], /n 186/);
});
