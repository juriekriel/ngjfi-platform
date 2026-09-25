import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { bestMatch, chain, fmt, offered, pick, type LocaleInfo } from "../src/lib/i18nCore.ts";

const reg: LocaleInfo[] = JSON.parse(readFileSync(new URL("../src/data/locales.json", import.meta.url), "utf8")).locales;

test("every requested language is registered once, with a direction", () => {
  const codes = reg.map((l) => l.code);
  assert.equal(new Set(codes).size, codes.length);
  for (const c of ["en", "es", "es-419", "es-ES", "pt", "fr", "de", "it", "ru", "ar", "zh-Hans", "ja", "hi", "id", "th", "sw", "zu", "af", "ar-EG", "ar-LB", "ar-AE", "ar-MA"])
    assert.ok(codes.includes(c), c);
  for (const l of reg) assert.ok(l.dir === "ltr" || l.dir === "rtl");
  assert.equal(reg.find((l) => l.code === "ar")?.dir, "rtl");
});

test("fallback chains end in English and never loop", () => {
  assert.deepEqual(chain("es-419", reg), ["es-419", "es", "en"]);
  assert.deepEqual(chain("ar-EG", reg), ["ar-EG", "ar", "en"]);
  assert.deepEqual(chain("en", reg), ["en"]);
  assert.deepEqual(chain("xx", reg), ["xx", "en"]);
});

test("pick takes the first language that has text", () => {
  assert.equal(pick({ en: "Hello", es: "Hola" }, ["es-419", "es", "en"]), "Hola");
  assert.equal(pick({ en: "Hello", es: "  " }, ["es", "en"]), "Hello");
});

test("only live languages reach respondents; preview shows drafts, never 'requested'", () => {
  const live = offered(reg, false).map((l) => l.code);
  assert.ok(live.includes("en"));
  for (const l of reg) if (l.status !== "live") assert.ok(!live.includes(l.code), `${l.code} must not be offered`);
  const prev = offered(reg, true).map((l) => l.code);
  assert.ok(prev.includes("fr") && !prev.includes("ar-EG"));
});

test("bestMatch reads the phone's language", () => {
  const avail = ["en", "es", "es-419", "es-ES", "pt", "zh-Hans", "ar"];
  assert.equal(bestMatch(["es-MX", "en"], avail), "es-419");
  assert.equal(bestMatch(["es-ES"], avail), "es-ES");
  assert.equal(bestMatch(["pt-BR"], avail), "pt");
  assert.equal(bestMatch(["zh-CN"], avail), "zh-Hans");
  assert.equal(bestMatch(["ko-KR"], avail), "en");
  assert.equal(bestMatch(["es-MX"], ["en", "es"]), "es");
});

test("fmt fills placeholders", () => {
  assert.equal(fmt("Question {n} of {total}", { n: 2, total: 9 }), "Question 2 of 9");
  assert.equal(fmt("Hi {name}"), "Hi {name}");
});

/**
 * The gate: a language may only be "live" when every screen string AND every
 * question and option has text in it (its own, or inherited along its
 * fallback chain before English). Translations are researcher-approved; this
 * test stops a half-translated survey ever reaching a respondent.
 */
const inst = JSON.parse(readFileSync(new URL("../src/data/instrument.v4.json", import.meta.url), "utf8"));
const file = (c: string) => JSON.parse(readFileSync(new URL(`../src/data/i18n/${c}.json`, import.meta.url), "utf8"));
const en = file("en");

function missing(code: string): string[] {
  const order = chain(code, reg).filter((c) => c !== "en");
  const files = order.map(file);
  const has = (get: (f: any, c: string) => string | undefined) => order.some((c, i) => (get(files[i], c) ?? "").trim());
  const out: string[] = [];
  for (const k of Object.keys(en.ui)) if (!has((f) => f.ui?.[k])) out.push(`ui:${k}`);
  for (const it of inst.items) {
    if (!has((f, c) => f.items?.[it.key]?.text ?? it.text?.[c])) out.push(`item:${it.key}`);
    for (const o of it.options ?? []) if (!has((f, c) => f.items?.[it.key]?.options?.[String(o.value)] ?? o.text?.[c])) out.push(`option:${it.key}.${o.value}`);
  }
  return out;
}

test("every live language is complete — screens, questions and options", () => {
  for (const l of reg.filter((x) => x.status === "live" && x.code !== "en")) {
    const m = missing(l.code);
    assert.equal(m.length, 0, `${l.code} is live but missing ${m.length}: ${m.slice(0, 5).join(", ")}`);
  }
});

test("every language file exists and its screen strings keep their {placeholders}", () => {
  for (const l of reg) {
    const f = file(l.code);
    for (const [k, v] of Object.entries<string>(f.ui ?? {})) {
      const want = (en.ui[k].match(/\{\w+\}/g) ?? []).sort().join();
      const got = (v.match(/\{\w+\}/g) ?? []).sort().join();
      assert.equal(got, want, `${l.code} ui.${k} placeholders`);
    }
    if (f.ui?.welcome_title) assert.match(f.ui.welcome_title, /\[.+\]/, `${l.code} welcome_title needs a [highlight]`);
  }
});

test("Spanish is ready for review: nothing missing", () => {
  assert.deepEqual(missing("es"), []);
});
