import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bandIncludesMinors } from "../src/lib/consent.ts";

const json = JSON.parse(readFileSync("src/data/consent-countries.json", "utf8"));
const sql = readFileSync("supabase/migrations/0053_two_level_consent.sql", "utf8");
const q = (s: string | number) => `'${String(s).replace(/'/g, "''")}'`;

test("0053 seeds consent_country_rules from consent-countries.json, row for row", () => {
  for (const c of json.countries) {
    const row = `(${[c.country_code, c.country, c.care_level].map(q).join(", ")}, ${c.parental_consent_under}, ${[
      c.main_law, c.parental_consent_note, c.faith_data, c.ethics_review, c.data_abroad, c.summary, c.reference_version,
    ].map(q).join(", ")})`;
    assert.ok(sql.includes(row), `${c.country_code} in the seed matches the JSON`);
  }
});

test("minors are decided by the band's upper bound — the same rule as _band_is_minor()", () => {
  assert.equal(bandIncludesMinors("13_17"), true);
  assert.equal(bandIncludesMinors("18_22"), false);
  assert.equal(bandIncludesMinors("31_45"), false);
  assert.equal(bandIncludesMinors("under_13"), false, "under_13 ends the survey; it is never invited");
  assert.match(sql, /regexp_match\(p_band, '\^\\d\+_\(\\d\+\)\$'\)\)\[1\]::int < 18/);
});

test("no consent, no participation: both triggers exist and fail closed", () => {
  assert.match(sql, /before insert on public\.sessions\s+for each row execute function public\.refuse_sessions_without_survey_consent/);
  assert.match(sql, /before update of age_band on public\.sessions/);
  assert.match(sql, /if v_demo then return new; end if;/);
});
