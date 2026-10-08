import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runChecks, diffKeys } from "../src/lib/instrumentChecks.ts";

type Item = { key: string; order: number; section: string; module?: string; origin?: string; draft?: boolean;
  show_if?: { all?: { key: string }[]; any?: { key: string }[] } } & Parameters<typeof runChecks>[0][number];
const load = (v: string) => JSON.parse(readFileSync(`src/data/instrument.${v}.json`, "utf8")) as
  { version: string; lock?: unknown; locales: string[]; field_draft_items: boolean; items: Item[]; item_sets: Record<string, { sections?: string[] }> };
const v5 = load("v5");
const v6 = load("v6");

test("v6 passes every integrity check", () => {
  for (const c of runChecks(v6.items, v6.locales)) assert.ok(c.ok, `${c.label} — ${c.detail}`);
});

test("v6 is a draft: not locked, not fielded, and the app still fields v5", () => {
  assert.equal(v6.version, "v6");
  assert.equal(v6.lock, undefined);
  assert.equal(v6.field_draft_items, false);
  assert.match(readFileSync("src/lib/instrument.ts", "utf8"), /instrument\.v5\.json/);
  assert.match(readFileSync("scripts/seed-instrument.mjs", "utf8"), /--status draft/);
});

test("Belong–Trust sits in the demographics block, for both paths, not behind the extras offer (Matthew)", () => {
  const gender = v6.items.find((i) => i.key === "gender")!;
  const lastDrivers = Math.max(...v6.items.filter((i) => ["driver", "journey"].includes(i.section)).map((i) => i.order));
  const mod = v6.items.filter((i) => i.module === "belong_trust");
  assert.equal(mod.length, 12, "all twelve Belong–Trust items, including the four context items");
  for (const i of mod) {
    assert.ok(i.order > lastDrivers && i.order < gender.order, `${i.key} sits after Drivers & Journey, before About you`);
    assert.equal(i.section, "module", `${i.key} stays out of J12-only`);
    const keys = [...(i.show_if?.all ?? []), ...(i.show_if?.any ?? [])].map((c) => c.key);
    for (const k of ["continue_to_extras", "orientation", "follower_check"])
      assert.ok(!keys.includes(k), `${i.key} is not gated on ${k}`);
  }
  assert.ok(!v6.items.some((i) => i.origin === "belong_trust"), "no item still sits in Drivers & Journey");
  assert.ok(!v6.item_sets.j12.sections?.includes("module"), "J12 only leaves the module out");
});

test("nothing else moved: v6 asks exactly v5's items, with the same scoring", () => {
  const d = diffKeys(v5.items, v6.items);
  assert.deepEqual(d.added, []);
  assert.deepEqual(d.removed, []);
  assert.deepEqual(d.retagged, []);
  const notModule = (v: typeof v5) => v.items.filter((i) => i.module !== "belong_trust" && i.origin !== "belong_trust");
  assert.deepEqual(notModule(v6), notModule(v5));
});
