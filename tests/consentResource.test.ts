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

test("the country reference covers every country, and is well-formed", () => {
  type Row = { country_code: string; country: string; care_level: string; parental_consent_under: number; reference_version: string; parental_consent_note: string };
  const list = countries.countries as Row[];
  // Every UN member state, plus Vatican City, Palestine, Taiwan, Kosovo, Hong Kong, Macau and Puerto Rico.
  const UN = `AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI CV KH CM CA CF TD CL CN CO KM CG CD CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KW KG LA LV LB LS LR LY LI LT LU MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG KP MK NO OM PK PW PA PG PY PE PH PL PT QA KR RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA SS ES LK SD SR SE CH SY TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VE VN YE ZM ZW`.split(" ");
  assert.equal(UN.length, 193);
  const codes = new Set(list.map((c) => c.country_code));
  assert.equal(codes.size, list.length, "codes are unique");
  for (const c of [...UN, "VA", "PS", "TW", "XK", "HK", "MO", "PR"]) assert.ok(codes.has(c), `${c} is in the reference`);
  for (const c of list) {
    assert.match(c.country_code, /^[A-Z]{2}$/);
    assert.ok(["standard", "care", "high", "block_until_advice"].includes(c.care_level), c.country_code);
    assert.ok(c.parental_consent_under >= 12 && c.parental_consent_under <= 21, c.country_code);
    assert.ok(["2026-10-v1", "2026-10-v2"].includes(c.reference_version), c.country_code);
  }
  // The original 21 are unchanged; everything else is marked as a first pass.
  assert.equal(list.filter((c) => c.reference_version === "2026-10-v1").length, 21);
  assert.match(countries.first_pass_note, /first-pass/i);
  assert.match(countries.first_pass_note, /counsel/);
  // Blocked: the original three, plus the countries added in 0058.
  const blocked = list.filter((c) => c.care_level === "block_until_advice").map((c) => c.country_code).sort();
  assert.deepEqual(blocked, ["AF", "BN", "CN", "DZ", "ER", "IR", "KP", "LY", "MM", "MR", "MV", "PK", "SA", "SD", "SO", "SY", "TJ", "TM", "YE"]);
  // Where a parent's consent may be needed past 17, the resource says so (read from data, not typed).
  assert.deepEqual(list.filter((c) => c.parental_consent_under > 18).map((c) => c.country_code), ["TH"]);
  assert.match(countries.disclaimer, /not legal advice/);
});

test("the resource and the consent step can handle every country", () => {
  assert.match(resource, /<CountryReference \/>/);
  assert.match(resource, /CONSENT_PAST_17/);
  assert.ok(!resource.includes("seven countries"), "the advice count is computed, not typed");
  const table = readFileSync("src/content/consent/CountryReference.tsx", "utf8");
  assert.match(table, /print:table-row/, "every row prints, whatever the filter");
  assert.match(table, /isFirstPass\(c\)/);
  const step = readFileSync("src/components/index/SurveyConsentStep.tsx", "utf8");
  assert.match(step, /type="search"/, "the consent step searches countries rather than listing 200 checkboxes");
  assert.ok(!/CONSENT_COUNTRIES\.map\(\(c\) => \(\s*<label/.test(step));
  assert.match(step, /parental_consent_under > 18/);
});

test("the survey statement fills in this survey's details", () => {
  const lines = surveyConsentStatement({ countries: ["Argentina", "Brazil"], ageBands: ["13–17", "18–22"], method: "written_form", ethicsReference: "REC-12" });
  assert.match(lines[0], /Argentina and Brazil/);
  assert.match(lines[1], /signed written form/);
  assert.ok(lines.some((l) => l.includes("REC-12")));
  const adults = surveyConsentStatement({ countries: ["Mexico"], ageBands: ["18–22"], method: "not_applicable_adults_only" });
  assert.match(adults[1], /adults only/);
});

test("the consent resource names a real privacy contact, and prints branded", () => {
  assert.ok(!resource.includes("[privacy contact email]"), "no placeholder contact");
  assert.match(resource, /PRIVACY_CONTACT_EMAIL = "ulrich@nxtmove\.global"/);
  assert.match(resource, /<PrintBrand/);
  const css = readFileSync("src/app/globals.css", "utf8");
  assert.match(css, /print-color-adjust: exact/);
  assert.match(css, /--print-accent/);
});
