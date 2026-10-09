import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CONSENT_STATEMENT, SURVEY_CONSENT_STATEMENT_VERSION, CONSENT_STATEMENT_VERSION, surveyConsentStatement } from "../src/lib/consent.ts";
import { WHY_CONSENT_VERSION } from "../src/content/consent/why-consent.ts";

const resource = readFileSync("src/content/consent/ConsentResource.tsx", "utf8");
const countries = JSON.parse(readFileSync("src/data/consent-countries.json", "utf8"));

test("every statement and the Why Consent text is versioned", () => {
  for (const v of [CONSENT_STATEMENT_VERSION, SURVEY_CONSENT_STATEMENT_VERSION, WHY_CONSENT_VERSION]) {
    assert.match(v, /^\d{4}-\d{2}-v\d+$/);
  }
});

test("the resource renders the statements from code, never a copy", () => {
  assert.match(resource, /CONSENT_STATEMENT\.map/);
  assert.match(resource, /surveyConsentStatement\(/);
  assert.match(resource, /<WhyConsentBlock \/>/);
  for (const line of CONSENT_STATEMENT) {
    assert.ok(!resource.includes(line.slice(0, 40)), "statement text is not pasted into the resource");
  }
});

test("the country reference is complete and well-formed", () => {
  const list = countries.countries as { country_code: string; care_level: string; parental_consent_under: number }[];
  assert.equal(list.length, 21);
  assert.equal(new Set(list.map((c) => c.country_code)).size, 21, "codes are unique");
  for (const c of list) {
    assert.ok(["standard", "care", "high", "block_until_advice"].includes(c.care_level), c.country_code);
    assert.ok(c.parental_consent_under >= 12 && c.parental_consent_under <= 18, c.country_code);
  }
  const blocked = list.filter((c) => c.care_level === "block_until_advice").map((c) => c.country_code).sort();
  assert.deepEqual(blocked, ["CN", "PK", "SA"]);
  assert.match(countries.disclaimer, /not legal advice/);
});

test("the survey statement fills in this survey's details", () => {
  const lines = surveyConsentStatement({ countries: ["Argentina", "Brazil"], ageBands: ["13–17", "18–22"], method: "written_form", ethicsReference: "REC-12" });
  assert.match(lines[0], /Argentina and Brazil/);
  assert.match(lines[1], /signed written form/);
  assert.ok(lines.some((l) => l.includes("REC-12")));
  const adults = surveyConsentStatement({ countries: ["Mexico"], ageBands: ["18–22"], method: "not_applicable_adults_only" });
  assert.match(adults[1], /adults only/);
});
