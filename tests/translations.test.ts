import { strict as assert } from "node:assert";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { chain, type LocaleInfo } from "../src/lib/i18nCore.ts";
import { fieldable } from "../src/lib/branching.ts";
import {
  STAGES,
  coverage,
  sheetRows,
  stageCounts,
  stageOf,
  surveyText,
  toCsv,
  worldRows,
  type LangFileLike,
  type SheetItem,
  type WorldLanguage,
} from "../src/lib/translations.ts";

const json = (p: string) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), "utf8"));
const reg: LocaleInfo[] = json("src/data/locales.json").locales;
const world: WorldLanguage[] = json("src/data/languages.world.json").languages;
const inst = json("src/data/instrument.v7.json");
const items: SheetItem[] = inst.items;
const fielded = fieldable(inst.items, Boolean(inst.field_draft_items)) as SheetItem[];
const en = json("src/data/i18n/en.json");
const file = (c: string): LangFileLike => json(`src/data/i18n/${c}.json`);
const filesFor = (code: string) => Object.fromEntries(chain(code, reg).map((c) => [c, file(c)]));

test("the app and the sheet script read the same instrument", () => {
  assert.match(readFileSync(new URL("../src/lib/instrument.ts", import.meta.url), "utf8"), /import instrumentV7 from "@\/data\/instrument\.v7\.json"/);
  assert.match(readFileSync(new URL("../scripts/translation-sheet.mjs", import.meta.url), "utf8"), /instrument\.v7\.json/);
});

test("four stages, derived from the workflow status — never stored twice", () => {
  assert.deepEqual(STAGES.map((s) => s.key), ["live", "translating", "prospective", "aspirational"]);
  assert.equal(stageOf("live"), "live");
  assert.equal(stageOf("review"), "translating");
  assert.equal(stageOf("draft"), "translating");
  assert.equal(stageOf("requested"), "prospective");
  // A registered language is never aspirational: aspirational means not on the site.
  for (const l of reg) assert.notEqual(stageOf(l.status), "aspirational");
});

test("the world list is clean and matches the site's languages by base code", () => {
  const codes = world.map((w) => w.code);
  assert.equal(new Set(codes).size, codes.length, "no duplicates");
  for (const w of world) assert.ok(w.dir === "ltr" || w.dir === "rtl");
  const rows = worldRows(world, reg);
  const by = (c: string) => rows.find((r) => r.code === c)!;
  assert.equal(by("en").stage, "live");
  // Spanish is in review; the Arabic dialects are only requested but MSA is a draft — furthest-along wins.
  assert.equal(by("es").stage, stageOf(reg.find((l) => l.code === "es")!.status));
  assert.deepEqual(by("ar").variants.sort(), reg.filter((l) => l.code.startsWith("ar")).map((l) => l.code).sort());
  assert.equal(by("ar").stage, "translating");
  assert.ok(by("zh").variants.includes("zh-Hans"));
  assert.equal(by("bn").stage, "aspirational");
  const n = stageCounts(rows);
  assert.equal(n.live + n.translating + n.prospective + n.aspirational, world.length);
});

test("the CSV download is exactly the sheet scripts/translation-sheet.mjs exports", () => {
  for (const code of ["fr", "es-419", "ar-EG"]) {
    execFileSync("node", ["scripts/translation-sheet.mjs", "export", code], { cwd: new URL("../", import.meta.url) });
    const script = readFileSync(new URL(`../translations/${code}.csv`, import.meta.url), "utf8");
    assert.equal(toCsv(sheetRows(code, items, en.ui, file(code))), script, code);
  }
});

test("a starter sheet for a language not on the site has an empty translation column", () => {
  const rows = sheetRows("bn", items, en.ui, {});
  assert.ok(rows.length > 100);
  for (const r of rows.slice(1)) assert.equal(r[3], "", r[0]);
});

test("coverage: English is whole, every live language is whole, inheritance counts", () => {
  const keys = Object.keys(en.ui);
  assert.equal(coverage("en", ["en"], { en }, keys, fielded), 1);
  for (const l of reg.filter((x) => x.status === "live"))
    assert.equal(coverage(l.code, chain(l.code, reg), filesFor(l.code), keys, fielded), 1, l.code);
  const es = coverage("es", chain("es", reg), filesFor("es"), keys, fielded);
  const es419 = coverage("es-419", chain("es-419", reg), filesFor("es-419"), keys, fielded);
  assert.ok(es419 >= es, "a regional variant inherits its parent");
  const fr = coverage("fr", chain("fr", reg), filesFor("fr"), keys, fielded);
  assert.ok(fr > 0 && fr < 1, `fr is partly translated (${fr})`);
});

test("the text download is the whole fielded survey, untranslated lines marked [EN]", () => {
  const base = { stage: "translating" as const, version: inst.version, items: fielded, minutes: 7, coverage: 0.4 };
  const enTxt = surveyText({ ...base, code: "en", name: "English", stage: "live", order: ["en"], files: { en }, coverage: 1 });
  for (const it of fielded) assert.ok(enTxt.includes(it.text!.en!), it.key);
  assert.ok(!enTxt.includes("[EN]"));
  assert.ok(!/\{\w+\}/.test(enTxt.split("\n").slice(4).join("\n")), "placeholders filled");

  const frTxt = surveyText({ ...base, code: "fr", name: "French", order: chain("fr", reg), files: filesFor("fr") });
  assert.ok(frTxt.includes(file("fr").ui!.likert_1), "French screen text used");
  assert.ok(frTxt.includes("[EN] "), "English fallbacks are marked");
  assert.ok(frTxt.includes("in French (fr)"));
});

import { byPriority, people, type Reach } from "../src/lib/translations.ts";
const reachDoc = json("src/data/languages.reach.json");
const R: Record<string, Reach> = reachDoc.languages;

test("reach data covers every world language and every survey language, with its sources", () => {
  for (const w of world) assert.ok(R[w.code], `world ${w.code}`);
  for (const l of reg) assert.ok(R[l.code], `survey ${l.code}`);
  for (const k of ["population", "languages", "online", "open"]) assert.ok(reachDoc.sources[k], k);
  for (const [code, r] of Object.entries(R)) {
    for (const k of ["online", "open", "access"] as const) assert.ok(r[k] >= 0 && r[k] <= 1, `${code}.${k}`);
    assert.ok(r.u30_readers <= r.u30 && r.reach <= r.u30_readers, code);
    assert.ok(r.u30 > 0, `${code} has young speakers`);
  }
});

test("priority is most reachable young people first, and the stored order agrees", () => {
  const ranked = byPriority(world, R).map((w) => w.code);
  assert.deepEqual(ranked, reachDoc.priority);
  for (let i = 1; i < ranked.length; i++) assert.ok(R[ranked[i - 1]].reach >= R[ranked[i]].reach);
  // Unknown codes sink to the end without disturbing the rest.
  assert.equal(byPriority([{ code: "xx" }, { code: "en" }], R)[0].code, "en");
});

test("people() rounds to what the data can bear", () => {
  assert.equal(people(866_123_456), "866M");
  assert.equal(people(4_234_567), "4.2M");
  assert.equal(people(1_460_000_000), "1.5B");
  assert.equal(people(950_400), "950K");
});
