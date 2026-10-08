import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { completionLine, groupLabel, stopPoints, type Completion } from "../src/lib/breakdown.ts";

const inst = JSON.parse(readFileSync("src/data/instrument.v5.json", "utf8"));
const locales = JSON.parse(readFileSync("src/data/locales.json", "utf8")).locales;

test("labels come from the instrument, so new bands need no code", () => {
  assert.equal(groupLabel("age_band", "13_17", inst), "13–17");
  assert.equal(groupLabel("faith_status", "committed_growing", inst), "Committed, actively growing");
  assert.equal(groupLabel("gender", "_not_given", inst), "Not given");
  const withNewBand = { ...inst, items: inst.items.map((i: { key: string; options?: unknown[] }) =>
    i.key === "age_band" ? { ...i, options: [...(i.options ?? []), { value: "31_45", text: { en: "31–45" } }] } : i) };
  assert.equal(groupLabel("age_band", "31_45", withNewBand), "31–45");
  assert.equal(groupLabel("language", "en", inst, locales), "English");
  assert.equal(groupLabel("survey_version", "j12", inst), "J12 only");
});

const base: Completion = { started: 410, completed: 295, pending: 0, rate_base: 410, min_n: 10,
  completion_rate: 0.72, stop_points: { index: 80, screener: 20, extras: 15 }, extras_reached: 200, extras_opt_in_rate: 0.5 };

test("the completion line states the rate with its base", () => {
  assert.equal(completionLine(base), "72% of 410 who started finished.");
  assert.match(completionLine({ ...base, pending: 6 }), /6 started in the last two days aren't counted yet/);
  assert.match(completionLine({ ...base, completion_rate: null, started: 8, completed: 5 }), /^5 of 8 who started have finished/);
  assert.equal(completionLine({ ...base, started: 0 }), "No one has started the survey yet.");
});

test("stop points come back in survey order", () => {
  assert.deepEqual(stopPoints(base).map((s) => s.label), ["Opening questions", "Main questions", "Optional extras"]);
});
