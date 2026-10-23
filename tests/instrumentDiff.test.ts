import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { summarize, versionDiff, versionNumber, type DiffInstrument } from "../src/lib/instrumentDiff.ts";

/*
 * The console's "Instrument versions" band (VersionHistory.tsx) steps through
 * v1 → the live version. These tests run the same diff over the real files.
 */
const load = (v: string) => JSON.parse(readFileSync(`src/data/instrument.${v}.json`, "utf8")) as DiffInstrument;
const live = /instrument\.(v\d+)\.json/.exec(readFileSync("src/lib/instrument.ts", "utf8"))![1];

test("every version from v1 to the live one exists, so every tab has a file and a predecessor", () => {
  for (let n = 0; n <= versionNumber(live); n++) assert.ok(existsSync(`src/data/instrument.v${n}.json`), `v${n} is missing`);
});

test("v5 → v6: the Collab decisions of 14 Oct show up as removals and archiving", () => {
  const d = versionDiff(load("v5"), load("v6"));
  const removed = d.removed.map((r) => r.key);
  for (const k of ["who_is_jesus", "continue_to_extras", "city"]) assert.ok(removed.includes(k), `${k} dropped in v6`);
  assert.ok(d.added.some((a) => a.key === "attention_check_unengaged"), "Route B's attention check added");
  assert.equal(d.archived.length, 12, "the Belong–Trust module is archived");
  assert.ok(d.meta.some((m) => m.label === "Full survey length (minutes)" && m.from === "6" && m.to === "8"));
  assert.equal(d.same, false);
});

test("v6 → v7: exactly the over-30 exit, nothing else", () => {
  const d = versionDiff(load("v6"), load("v7"));
  assert.deepEqual(d.added, []);
  assert.deepEqual(d.removed, []);
  assert.deepEqual(d.reworded, []);
  assert.deepEqual(d.retagged, []);
  assert.deepEqual(d.routing, []);
  assert.deepEqual(d.meta, []);
  assert.equal(d.options.length, 1);
  assert.equal(d.options[0].key, "age_band");
  assert.deepEqual(d.options[0].added, ["31 or older"]);
});

test("a version compared with itself has no changes", () => {
  assert.equal(versionDiff(load("v6"), load("v6")).same, true);
});

test("summaries count what a respondent can be asked, not the archive", () => {
  const s5 = summarize(load("v5"));
  const s6 = summarize(load("v6"));
  assert.equal(s5.items, 87, "the 87 the console tile shows for v5");
  assert.equal(s6.items, 85);
  assert.equal(s6.fielded, 73, "v6 fields 73 questions (CLAUDE.md §4)");
  assert.equal(s6.scored, 48, "48 scored items across the two routes");
  assert.equal(s6.locked_on, "2026-10-16");
  assert.equal(summarize(load("v1")).locked_on, null, "early drafts were never locked");
});

test("the console marks the live version and the database's active one", () => {
  const src = readFileSync("src/components/console/VersionHistory.tsx", "utf8");
  assert.match(src, /import\(`@\/data\/instrument\.v\$\{n\}\.json`\)/, "versions are discovered, not listed by hand");
  assert.match(src, /activeInDatabase !== live/, "a database on an older version is flagged");
  assert.match(readFileSync("src/app/build/Console.tsx", "utf8"), /<VersionHistory activeInDatabase=/);
  assert.match(readFileSync("src/components/console/Bands.tsx", "utf8"), /in DB · app/, "the Console tile flags it too");
});
