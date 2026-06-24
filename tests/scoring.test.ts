import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  computeScores,
  normalizeValue,
  type Item,
  type RawResponse,
} from "../src/lib/scoring.ts";

const near = (a: number | null, b: number, eps = 0.05) =>
  a !== null && Math.abs(a - b) < eps;

test("normalizeValue: likert_5", () => {
  const it: Item = { key: "x", question_domain: "follow", tier: "response", type: "likert_5", scored: true };
  assert.equal(normalizeValue(it, 1), 0);
  assert.equal(normalizeValue(it, 3), 50);
  assert.equal(normalizeValue(it, 5), 100);
  assert.equal(normalizeValue(it, 0), null); // out of range
  assert.equal(normalizeValue(it, null), null);
});

test("normalizeValue: reverse-scored inverts", () => {
  const it: Item = { key: "x", question_domain: "follow", tier: "response", type: "likert_5", scored: true, reverse_scored: true };
  assert.equal(normalizeValue(it, 5), 0);
  assert.equal(normalizeValue(it, 1), 100);
});

test("normalizeValue: yes_no accepts bool/string", () => {
  const it: Item = { key: "x", question_domain: "mission", tier: "multiplication", type: "yes_no", scored: true };
  assert.equal(normalizeValue(it, true), 100);
  assert.equal(normalizeValue(it, "yes"), 100);
  assert.equal(normalizeValue(it, false), 0);
  assert.equal(normalizeValue(it, "no"), 0);
  assert.equal(normalizeValue(it, "maybe"), null);
});

test("normalizeValue: frequency ordinal across points", () => {
  const it: Item = { key: "x", question_domain: "follow", tier: "formation", type: "frequency", scored: true, scale: { points: 4 } };
  assert.equal(normalizeValue(it, 0), 0);
  assert.ok(near(normalizeValue(it, 2), 66.6667));
  assert.equal(normalizeValue(it, 3), 100);
  assert.equal(normalizeValue(it, 4), null); // out of range
});

test("computeScores: tiers, domains, matrix, index, n", () => {
  const items: Item[] = [
    { key: "a", question_domain: "follow", tier: "response", type: "likert_5", scored: true },
    { key: "b", question_domain: "follow", tier: "formation", type: "frequency", scored: true, scale: { points: 4 } },
    { key: "c", question_domain: "mission", tier: "multiplication", type: "yes_no", scored: true },
    { key: "d", question_domain: "world", tier: "response", type: "likert_5", scored: true, reverse_scored: true },
    { key: "e", question_domain: "follow", tier: "response", type: "single_select", scored: false }, // diagnostic
  ];
  const responses: RawResponse[] = [
    { key: "a", value: 5 },          // 100
    { key: "b", value: 2 },          // 66.67  (weekly)
    { key: "c", value: "yes" },      // 100
    { key: "d", value: 1 },          // likert 0 -> reverse 100
    { key: "e", value: "whatever" }, // ignored (diagnostic)
  ];

  const r = computeScores(items, responses);

  assert.equal(r.n, 4);
  assert.equal(r.tiers.exposure, null);
  assert.equal(r.tiers.response, 100);
  assert.ok(near(r.tiers.formation, 66.7));
  assert.equal(r.tiers.multiplication, 100);

  assert.ok(near(r.domains.follow, 83.3)); // mean(100, 66.67)
  assert.equal(r.domains.mission, 100);
  assert.equal(r.domains.world, 100);

  assert.equal(r.matrix.follow.response, 100);
  assert.ok(near(r.matrix.follow.formation, 66.7));
  assert.equal(r.matrix.mission.multiplication, 100);
  assert.equal(r.matrix.world.response, 100);
  assert.equal(r.matrix.world.formation, null);

  // index = mean of available tier scores (100, 66.7, 100)
  assert.ok(near(r.index, 88.9));
  assert.equal(r.scoringVersion, "v0.1.0");
});

test("computeScores: empty responses are low-n safe", () => {
  const items: Item[] = [
    { key: "a", question_domain: "follow", tier: "response", type: "likert_5", scored: true },
  ];
  const r = computeScores(items, []);
  assert.equal(r.n, 0);
  assert.equal(r.index, null);
  assert.equal(r.tiers.response, null);
});

test("instrument v0 config is well-formed", () => {
  const inst = JSON.parse(
    readFileSync(new URL("../src/data/instrument.v0.json", import.meta.url), "utf8"),
  );
  assert.ok(Array.isArray(inst.items) && inst.items.length > 10);
  const tiers = new Set(["exposure", "response", "formation", "multiplication", "na"]);
  const domains = new Set(["follow", "mission", "world", "screener", "journey", "demographic"]);
  for (const it of inst.items) {
    assert.ok(it.key, "item has key");
    assert.ok(tiers.has(it.tier), `valid tier: ${it.key}`);
    assert.ok(domains.has(it.question_domain), `valid domain: ${it.key}`);
    if (it.type === "frequency") {
      assert.ok(it.scale && it.scale.points >= 2, `frequency has points: ${it.key}`);
    }
    // every scored item must be answerable by the engine
    if (it.scored) {
      assert.ok(["likert_5", "yes_no", "frequency"].includes(it.type), `scored type supported: ${it.key}`);
    }
  }
  // the two core activities must be present and scored
  const byKey = Object.fromEntries(inst.items.map((i: { key: string }) => [i.key, i]));
  assert.ok(byKey["pray_frequency"]?.scored, "weekly prayer present + scored");
  assert.ok(byKey["scripture_frequency"]?.scored, "weekly scripture present + scored");
});
