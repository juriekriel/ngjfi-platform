import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COUNTRIES } from "../src/data/countries.ts";

const read = (p: string) => readFileSync(p, "utf8");

test("the country list is complete, unique and in the map's naming", () => {
  assert.ok(COUNTRIES.length >= 240, "every country is selectable");
  const codes = COUNTRIES.map(([c]) => c);
  const names = COUNTRIES.map(([, n]) => n);
  assert.equal(new Set(codes).size, codes.length, "codes are unique");
  assert.equal(new Set(names).size, names.length, "names are unique");
  for (const c of codes) assert.match(c, /^[A-Z]{2}$/);
  // Every country the world map already joins by name stays reachable from the dropdown.
  const geo = read("src/data/worldGeo.ts").match(/COUNTRY_CODE_BY_NAME[^{]*\{([^}]*)\}/)![1];
  for (const [, name, code] of geo.matchAll(/'([^']+)':\s*'([A-Z]{2})'/g)) {
    const row = COUNTRIES.find(([, n]) => n === name);
    assert.ok(row, `${name} is in the dropdown under the map's spelling`);
    assert.equal(row![0], code, `${name} keeps code ${code}`);
  }
});

test("the country question is a dropdown that stores the canonical name; city stays free text", () => {
  const card = read("src/components/survey/QuestionCard.tsx");
  assert.match(card, /item\.session_field === "country"/);
  assert.match(card, /<select/);
  assert.match(card, /value: en, label:/, "submits the English name, shows the localized label");
  assert.match(card, /item\.session_field !== "country" && \(\s*<OpenText/, "every other open_text (city) is still typed");
  assert.ok(JSON.parse(read("src/data/i18n/en.json")).ui.choose_country);
});
