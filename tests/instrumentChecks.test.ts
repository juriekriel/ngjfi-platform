import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { cellCounts, diffKeys, runChecks } from "../src/lib/instrumentChecks.ts";

/**
 * The shipped instrument is held to the brief's rules. If a future edit to
 * instrument.v4.json (or its successor) breaks one, this fails before it can
 * reach a respondent.
 */
const load = (v: string) => JSON.parse(readFileSync(new URL(`../src/data/instrument.${v}.json`, import.meta.url), "utf8"));
const v4 = load("v4");

test("every integrity check passes on the live instrument (v4)", () => {
  for (const c of runChecks(v4.items, v4.locales)) assert.ok(c.ok, `${c.label} — ${c.detail}`);
});

test("four scored items per cell in v4", () => {
  const m = cellCounts(v4.items);
  for (const q of Object.keys(m)) for (const t of Object.keys(m[q])) assert.equal(m[q][t], 4, `${q} × ${t}`);
});

test("checks catch a broken bank", () => {
  const broken = v4.items
    .filter((i: { key: string }) => i.key !== "pray_frequency")
    .map((i: { question_domain: string; tier: string; scored: boolean }) =>
      i.question_domain === "world" && i.tier === "exposure" ? { ...i, scored: false } : i,
    );
  const failed = runChecks(broken, v4.locales).filter((c) => !c.ok).map((c) => c.id);
  assert.ok(failed.includes("matrix"));
  assert.ok(failed.includes("core_activities"));
});

test("diffKeys reports what changed between versions", () => {
  const d = diffKeys(load("v3").items, v4.items);
  assert.ok(Array.isArray(d.added) && Array.isArray(d.removed));
});
