#!/usr/bin/env node
/**
 * Language reach — how many young people each language reaches, how
 * accessible they are, and so which languages to translate first.
 *
 *   node scripts/language-reach.mjs      → src/data/languages.reach.json
 *
 * Feeds the admin console's Translations tile. Never reaches respondents,
 * and holds no respondent data: only published, country-level statistics.
 *
 * SOURCES (all open; re-run when a new edition is out)
 *   1. Under-30 population per country — UN World Population Prospects 2024,
 *      medium variant, 2025 estimate, 5-year age groups 0–29. The UN builds
 *      WPP from each country's most recent census and surveys; it is the
 *      standard way to compare countries on one footing.
 *   2. Who speaks what, per country — Unicode CLDR territory–language data
 *      (share of each country's population that speaks a language, first or
 *      second; and, where CLDR records it, how many of them can READ it).
 *   3. Online — ITU individuals using the internet (% of population), via the
 *      World Bank API (IT.NET.USER.ZS), latest year since 2018.
 *   4. Open to field — Open Doors World Watch List (src/data/wwl.json).
 *
 * METHOD (per language, summed over every country where CLDR lists it)
 *   under-30 speakers  = country under-30 population × share who speak it
 *   who can read it    = × CLDR's literacy/writing share for that language,
 *                        where recorded (this is a written survey)
 *   online             = × internet use in that country
 *   open               = × a factor for the country's World Watch List band
 *   accessibility      = (readers × online × open) ÷ readers   (0–100%)
 *   priority           = readers × online × open — young people a
 *                        translation could actually reach. Highest first.
 *
 * ASSUMPTIONS (flagged in the tile; for researchers to refine)
 *   - A language's share of a country is the same at every age (CLDR gives
 *     one figure for the whole population). Young people are likelier than
 *     average to speak English and the national language, so minority-
 *     language figures are, if anything, high.
 *   - Speakers are counted in every language they speak, so the totals
 *     across languages add up to more than the world's young people.
 *   - The open factor is a judgement about fielding a faith survey among
 *     young people safely, not about where the Church should be. See OPEN.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import readline from "node:readline";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = new URL("../", import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, ROOT), "utf8"));
const world = read("src/data/languages.world.json");
const registry = read("src/data/locales.json").locales;
const wwl = read("src/data/wwl.json");

/** World Watch List band → how open a country is to fielding (Open Doors' own bands). */
const OPEN = [
  { min: 81, factor: 0.25, label: "extreme persecution (81–100)" },
  { min: 61, factor: 0.5, label: "very high (61–80)" },
  { min: 50, factor: 0.75, label: "high (50–60)" },
  { min: -1, factor: 1, label: "not on the list (under 50)" },
];
const openFactor = (iso2) => {
  const s = wwl.countries[iso2]?.score ?? -1;
  return OPEN.find((b) => s >= b.min).factor;
};

const CLDR_REF = process.env.CLDR_REF ?? "main";
const WPP_URL =
  "https://population.un.org/wpp/assets/Excel%20Files/1_Indicator%20(Standard)/CSV_FILES/WPP2024_PopulationByAge5GroupSex_Medium.csv.gz";
const WB_URL = "https://api.worldbank.org/v2/country/all/indicator/IT.NET.USER.ZS?format=json&per_page=20000&date=2018:2026";
const YEAR = "2025";

async function get(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r;
}

// ── 1. UN WPP: total and under-30 per country, 2025 ─────────────────────
async function wpp() {
  const cacheDir = join(tmpdir(), "jfindx-reach");
  mkdirSync(cacheDir, { recursive: true });
  const cache = join(cacheDir, "wpp2024-age5.csv.gz");
  if (!existsSync(cache)) {
    process.stdout.write("downloading UN WPP 2024 (≈30 MB) … ");
    writeFileSync(cache, Buffer.from(await (await get(WPP_URL)).arrayBuffer()));
    console.log("ok");
  }
  const out = {};
  const rl = readline.createInterface({ input: Readable.from(readFileSync(cache)).pipe(createGunzip()) });
  let head = null;
  for await (const line of rl) {
    const c = line.replace(/^\uFEFF/, "").split(",");
    if (!head) { head = c; continue; }
    const r = Object.fromEntries(head.map((h, i) => [h, c[i]]));
    if (r.LocTypeName !== "Country/Area" || r.Time !== YEAR || !r.ISO2_code) continue;
    const o = (out[r.ISO2_code] ??= { name: r.Location, pop: 0, u30: 0 });
    const n = Number(r.PopTotal) * 1000;
    o.pop += n;
    if (Number(r.AgeGrpStart) < 30) o.u30 += n;
  }
  return out;
}

// ── 2. CLDR: language shares per territory ──────────────────────────────
async function cldr() {
  const xml = await (await get(`https://raw.githubusercontent.com/unicode-org/cldr/${CLDR_REF}/common/supplemental/supplementalData.xml`)).text();
  const dtd = await (await get(`https://raw.githubusercontent.com/unicode-org/cldr/${CLDR_REF}/common/dtd/ldmlSupplemental.dtd`)).text();
  const version = dtd.match(/cldrVersion CDATA #FIXED "([\d.]+)"/)?.[1] ?? "?";
  const info = xml.slice(xml.indexOf("<territoryInfo>"), xml.indexOf("</territoryInfo>"));
  const attrs = (s) => Object.fromEntries([...s.matchAll(/(\w+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
  const terr = {};
  for (const m of info.matchAll(/<territory ([^>]*)>([\s\S]*?)<\/territory>/g)) {
    const t = attrs(m[1]);
    terr[t.type] = {};
    for (const l of m[2].matchAll(/<languagePopulation ([^/]*)\/>/g)) {
      const a = attrs(l[1]);
      const reads = [a.literacyPercent, a.writingPercent].filter(Boolean).map(Number);
      terr[t.type][a.type] = { share: Number(a.populationPercent) / 100, reads: reads.length ? Math.min(...reads) / 100 : 1 };
    }
  }
  return { version, terr };
}

// ── 3. Internet use ─────────────────────────────────────────────────────
async function internet() {
  const [, rows] = await (await get(WB_URL)).json();
  const out = {};
  for (const r of rows ?? []) {
    if (r.value == null || !/^[A-Z]{2}$/.test(r.country?.id ?? "")) continue;
    const y = Number(r.date);
    if (!out[r.country.id] || y > out[r.country.id].year) out[r.country.id] = { pct: r.value / 100, year: y };
  }
  return out;
}

// ── compute ─────────────────────────────────────────────────────────────
const [pop, { version: cldrVersion, terr }, net] = await Promise.all([wpp(), cldr(), internet()]);

// Countries with no internet figure take the under-30-weighted world average (flagged per language).
let wNum = 0, wDen = 0;
for (const [iso, p] of Object.entries(pop)) if (net[iso]) { wNum += p.u30 * net[iso].pct; wDen += p.u30; }
const NET_FALLBACK = wNum / wDen;

function reach(spec) {
  const rows = [];
  for (const [iso, langs] of Object.entries(terr)) {
    if (spec.territories && !spec.territories.includes(iso)) continue;
    const p = pop[iso];
    if (!p) continue;
    // A territory counts once, at its largest share among this language's codes.
    const best = spec.cldr.map((c) => langs[c]).filter(Boolean).sort((a, b) => b.share - a.share)[0];
    if (!best || !best.share) continue;
    const speakers = p.u30 * best.share;
    const readers = speakers * best.reads;
    const online = net[iso]?.pct ?? NET_FALLBACK;
    rows.push({ iso, name: p.name, speakers, readers, online, imputed: !net[iso], open: openFactor(iso) });
  }
  const sum = (f) => rows.reduce((s, r) => s + f(r), 0);
  const speakers = sum((r) => r.speakers);
  const readers = sum((r) => r.readers);
  const reachable = sum((r) => r.readers * r.online * r.open);
  return {
    u30: Math.round(speakers),
    u30_readers: Math.round(readers),
    online: readers ? +(sum((r) => r.readers * r.online) / readers).toFixed(3) : 0,
    open: readers ? +(sum((r) => r.readers * r.open) / readers).toFixed(3) : 0,
    access: readers ? +(reachable / readers).toFixed(3) : 0,
    reach: Math.round(reachable),
    countries: rows.length,
    imputed_online: rows.filter((r) => r.imputed).length,
    top: rows.sort((a, b) => b.speakers - a.speakers).slice(0, 5).map((r) => ({ iso2: r.iso, name: r.name, u30: Math.round(r.speakers) })),
  };
}

const languages = {};
for (const w of world.languages) languages[w.code] = reach({ cldr: w.cldr });
for (const l of registry) {
  if (languages[l.code]) continue;
  const v = world.variants?.[l.code];
  const base = world.languages.find((w) => w.code === l.code.split("-")[0]);
  languages[l.code] = reach(v ?? { cldr: base?.cldr ?? [l.code] });
}

const priority = world.languages.map((w) => w.code).sort((a, b) => languages[b].reach - languages[a].reach);

const doc = {
  $comment: "GENERATED by scripts/language-reach.mjs — do not edit by hand; re-run the script. Country-level public statistics only, no respondent data. Read by the admin Translations tile.",
  generated: new Date().toISOString().slice(0, 10),
  sources: {
    population: `UN World Population Prospects 2024, medium variant, ${YEAR} estimate, ages 0–29 (built from national censuses)`,
    languages: `Unicode CLDR ${cldrVersion} territory–language populations`,
    online: "ITU individuals using the internet, % of population, latest year 2018+ (World Bank IT.NET.USER.ZS)",
    open: `${wwl.edition} (Open Doors), countries scoring ${wwl.threshold}+`,
  },
  open_factors: OPEN.map(({ label, factor }) => ({ band: label, factor })),
  online_fallback: +NET_FALLBACK.toFixed(3),
  priority,
  languages,
};
writeFileSync(new URL("src/data/languages.reach.json", ROOT), JSON.stringify(doc, null, 1) + "\n");
const M = (n) => (n / 1e6).toFixed(0) + "M";
console.log(`src/data/languages.reach.json — CLDR ${cldrVersion}, ${Object.keys(pop).length} countries`);
priority.forEach((c, i) => {
  const l = languages[c];
  console.log(`${String(i + 1).padStart(2)}. ${c.padEnd(4)} u30 ${M(l.u30).padStart(5)}  readers ${M(l.u30_readers).padStart(5)}  online ${Math.round(l.online * 100)}%  open ${Math.round(l.open * 100)}%  access ${Math.round(l.access * 100)}%  reach ${M(l.reach)}`);
});
