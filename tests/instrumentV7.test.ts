import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { runChecks } from "../src/lib/instrumentChecks.ts";
import { endsSurvey, inOrder } from "../src/lib/branching.ts";
import { canonical, lockProjection, type Json } from "../src/lib/instrumentLock.ts";

/*
 * v7 — the launch instrument: v6 (locked 16 Oct 2026) plus an over-30 exit on
 * the age question (23 Oct 2026). Adults who try the survey at a camp — leaders,
 * parents, volunteers — are thanked and leave, exactly as an under-13 does, and
 * nothing about them is kept.
 */
type Opt = { value: string | number; text: Record<string, string>; ends_survey?: boolean };
type Item = Parameters<typeof runChecks>[0][number] & { key: string; options?: Opt[]; text: Record<string, string> };
type Inst = { version: string; scoringVersion: string; locales: string[]; items: Item[]; lock?: { locked?: boolean; locked_on?: string }; adopts_from?: Record<string, { drops_unscored: string[] }> };
const load = (v: string) => JSON.parse(readFileSync(`src/data/instrument.${v}.json`, "utf8")) as Inst;
const v6 = load("v6");
const v7 = load("v7");
const age = (i: Inst) => i.items.find((x) => x.key === "age_band")!;

test("v7 is the live instrument, locked, and passes every integrity check", () => {
  assert.equal(v7.version, "v7");
  assert.equal(v7.lock?.locked, true);
  assert.match(readFileSync("src/lib/instrument.ts", "utf8"), /from "@\/data\/instrument\.v7\.json"/);
  assert.match(readFileSync("scripts/seed-instrument.mjs", "utf8"), /process\.argv\[2\] \?\? "v7"/);
  for (const c of runChecks(v7.items, v7.locales)) assert.ok(c.ok, `${c.label} — ${c.detail}`);
});

test("'31 or older' ends the survey, last on the list; 12 or younger still does too", () => {
  const a = age(v7);
  const last = a.options![a.options!.length - 1];
  assert.equal(last.value, "over_30");
  assert.equal(last.text.en, "31 or older");
  assert.ok(last.text.es, "Spanish text present for review");
  assert.equal(endsSurvey(a, "over_30"), true);
  assert.equal(endsSurvey(a, "under_13"), true);
  for (const v of ["13_17", "18_22", "23_30"]) assert.equal(endsSurvey(a, v), false, `${v} continues`);
  const enders = v7.items.flatMap((i) => (i.options ?? []).filter((o) => o.ends_survey).map((o) => `${i.key}.${o.value}`));
  assert.deepEqual(enders, ["age_band.under_13", "age_band.over_30"], "nothing else can end a survey");
  assert.equal(inOrder(v7.items)[0].key, "age_band", "the age question is still the very first screen");
});

test("the over-30 exit is the ONLY frozen change from v6", () => {
  const strip = (i: Inst) => {
    const c = JSON.parse(JSON.stringify(i)) as Inst;
    const a = age(c);
    a.options = a.options!.filter((o) => o.value !== "over_30");
    c.version = "v6"; // the version label is part of the projection, so compare like with like
    return c;
  };
  const fp = (d: Inst) => createHash("sha256").update(canonical(lockProjection(d as unknown as { [k: string]: Json }))).digest("hex");
  assert.equal(fp(strip(v7)), fp(v6), "remove the one option and v7's frozen content is v6's");
  assert.equal(v7.scoringVersion, v6.scoringVersion, "scoring is unchanged");
  assert.deepEqual(v7.adopts_from?.v6?.drops_unscored, [], "a v6 campaign moves to v7 dropping nothing");
});

test("the respondent's closing screen fits both ends of the age range", () => {
  const en = (JSON.parse(readFileSync("src/data/i18n/en.json", "utf8")) as { ui: Record<string, string> }).ui;
  assert.ok(!/13 and over/.test(en.ended_body), "the closing words don't only speak to under-13s");
  assert.match(en.ended_body, /13 to 30/);
});
