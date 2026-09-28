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
const v4 = load("v5"); // the live instrument (name kept so the history below reads the same)

test("every integrity check passes on the live instrument (v5)", () => {
  for (const c of runChecks(v4.items, v4.locales)) assert.ok(c.ok, `${c.label} — ${c.detail}`);
});

test("four scored items per cell in the live instrument", () => {
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
  const d = diffKeys(load("v4").items, v4.items);
  assert.equal(d.removed.length, 0, "v5 only adds to v4");
  assert.ok(Array.isArray(d.added) && Array.isArray(d.removed));
});

test("v5 is a strict, identically-scored superset of v4 (safe to adopt, migration 0039)", () => {
  const v4old = load("v4");
  const next = new Map(v4.items.map((i: { key: string }) => [i.key, i]));
  for (const o of v4old.items) {
    const n = next.get(o.key) as typeof o | undefined;
    assert.ok(n, `${o.key} dropped`);
    for (const f of ["question_domain", "tier", "type", "scored", "reverse_scored"]) assert.deepEqual(n[f], o[f], `${o.key}.${f}`);
  }
});
