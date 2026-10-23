import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { canonical, lockProjection, type Json } from "../src/lib/instrumentLock.ts";

const load = (v: string) =>
  JSON.parse(readFileSync(new URL(`../src/data/instrument.${v}.json`, import.meta.url), "utf8")) as { [k: string]: Json };
const locks = JSON.parse(readFileSync(new URL("../src/data/instrument.locks.json", import.meta.url), "utf8")) as Record<
  string,
  { locked_on: string; sha256: string }
>;
const fingerprint = (d: { [k: string]: Json }) => createHash("sha256").update(canonical(lockProjection(d))).digest("hex");

test("every locked instrument version is unchanged — a change means a new version, not an edit", () => {
  for (const [v, lock] of Object.entries(locks)) {
    if (v.startsWith("_")) continue;
    assert.equal(
      fingerprint(load(v)),
      lock.sha256,
      `${v} is LOCKED (${lock.locked_on}). Its items, English wording, scoring or survey versions changed. ` +
        `Put the change in a new version (e.g. instrument.v6.json) instead — responses bind to the version they were captured under.`,
    );
  }
});

test("v5 is locked and stays the record; the live instrument is v7", () => {
  const v5 = load("v5") as { lock?: { locked?: boolean; locked_on?: string; decisions_recorded?: string[] } };
  assert.equal(v5.lock?.locked, true);
  assert.equal(v5.lock?.locked_on, locks.v5.locked_on);
  assert.ok((v5.lock?.decisions_recorded ?? []).some((d) => /pray_frequency/.test(d)), "the prayer/scripture decision (#5) is on the record");
  const src = readFileSync(new URL("../src/lib/instrument.ts", import.meta.url), "utf8");
  assert.match(src, /from "@\/data\/instrument\.v7\.json"/, "the app fields v7");
  const seed = readFileSync(new URL("../scripts/seed-instrument.mjs", import.meta.url), "utf8");
  assert.match(seed, /process\.argv\[2\] \?\? "v7"/, "the seed script defaults to v7");
});

test("v6 is locked as the confirmed pilot instrument (16 Oct 2026)", () => {
  const v6 = load("v6") as { lock?: { locked?: boolean; locked_on?: string; decisions_recorded?: string[] } };
  assert.equal(v6.lock?.locked, true, "v6 carries its lock");
  assert.equal(v6.lock?.locked_on, locks.v6?.locked_on, "the JSON lock and the fingerprint agree on the date");
  assert.ok((v6.lock?.decisions_recorded ?? []).some((d) => /Decision 7/.test(d)), "decision 7's outcome is on the record");
});

test("translations stay editable under a lock; English wording and scoring don't", () => {
  const base = load("v5");
  const clone = () => JSON.parse(JSON.stringify(base)) as { items: { text: Record<string, string>; scored?: boolean }[] };
  const es = clone();
  es.items[1].text.es = "una traducción corregida";
  assert.equal(fingerprint(es as unknown as { [k: string]: Json }), locks.v5.sha256, "a Spanish fix is not a new version");
  const en = clone();
  en.items[1].text.en = en.items[1].text.en + "!";
  assert.notEqual(fingerprint(en as unknown as { [k: string]: Json }), locks.v5.sha256);
  const sc = clone();
  sc.items[5].scored = !sc.items[5].scored;
  assert.notEqual(fingerprint(sc as unknown as { [k: string]: Json }), locks.v5.sha256);
});

test("the SQL lock projects the same fields as the TypeScript one", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0045_instrument_lock.sql", import.meta.url), "utf8");
  for (const f of ["scoringVersion", "field_draft_items", "item_sets", "sections", "exclude_keys", "items"]) {
    assert.match(sql, new RegExp(`'${f}'`), `instrument_lock_projection() must include ${f}`);
  }
});
