#!/usr/bin/env node
/**
 * Translation sheets — how a language's text gets written and brought back in.
 *
 *   node scripts/translation-sheet.mjs export <code>        → translations/<code>.csv
 *   node scripts/translation-sheet.mjs export --all         → one sheet per language
 *   node scripts/translation-sheet.mjs import <code> <csv>  → src/data/i18n/<code>.json
 *
 * A sheet has one row per piece of text a respondent can see: every survey
 * screen string (ui:…), every question (item:…), its help text (help:…) and
 * every answer option (option:…:<value>). Columns:
 *
 *   id · context · english · translation · note
 *
 * "translation" arrives pre-filled with whatever the language already has
 * (its own text, or the instrument's), so a reviewer edits rather than starts
 * over. Opens in Excel, Google Sheets or Numbers; save back as CSV (UTF-8).
 *
 * Importing writes ONLY the language's own file. It never touches the
 * instrument (src/data/instrument.v4.json — researcher-owned) and never
 * changes a language's status: going live is a separate, reviewed change to
 * src/data/locales.json, and CI refuses it unless the language is complete
 * (tests/i18n.test.ts). See docs/TRANSLATION.md.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const ROOT = new URL("../", import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, ROOT), "utf8"));
const registry = read("src/data/locales.json").locales;
const inst = read("src/data/instrument.v4.json");
const en = read("src/data/i18n/en.json");

// ── CSV (RFC 4180: quotes, commas, newlines inside fields) ──────────────
const cell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows) => "\uFEFF" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
function parseCsv(text) {
  const rows = []; let row = []; let f = ""; let q = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { f += '"'; i++; }
      else if (c === '"') q = false;
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(f); rows.push(row); row = []; f = "";
    } else f += c;
  }
  if (f !== "" || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

// ── the rows for one language ───────────────────────────────────────────
function rowsFor(code) {
  const own = read(`src/data/i18n/${code}.json`);
  const item = (key) => own.items?.[key] ?? {};
  const rows = [["id", "context", "english", "translation", "note"]];
  for (const [k, v] of Object.entries(en.ui)) {
    const note = /\{\w+\}/.test(v) ? "Keep {placeholders} exactly as written." : k === "welcome_title" ? "Keep the [square brackets] around the highlighted words." : "";
    rows.push([`ui:${k}`, "survey screen", v, own.ui?.[k] ?? "", note]);
  }
  for (const it of [...inst.items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    const ctx = [it.section, it.question_domain, it.tier !== "na" ? it.tier : null, it.scored ? "scored" : null].filter(Boolean).join(" · ");
    rows.push([`item:${it.key}`, ctx, it.text?.en ?? "", item(it.key).text ?? it.text?.[code] ?? "", it.scored ? "A scored question: keep the meaning exact — a researcher checks this one." : ""]);
    if (it.help?.en) rows.push([`help:${it.key}`, ctx + " · help", it.help.en, item(it.key).help ?? it.help?.[code] ?? "", ""]);
    for (const o of it.options ?? [])
      rows.push([`option:${it.key}:${o.value}`, `${it.key} · answer`, o.text?.en ?? "", item(it.key).options?.[String(o.value)] ?? o.text?.[code] ?? "", ""]);
  }
  return rows;
}

function exportSheet(code) {
  if (!registry.some((l) => l.code === code)) throw new Error(`unknown language ${code}`);
  mkdirSync(new URL("translations/", ROOT), { recursive: true });
  const rows = rowsFor(code);
  writeFileSync(new URL(`translations/${code}.csv`, ROOT), toCsv(rows));
  const filled = rows.slice(1).filter((r) => r[3].trim()).length;
  console.log(`translations/${code}.csv — ${rows.length - 1} rows, ${filled} already translated`);
}

function importSheet(code, csvPath) {
  if (code === "en") throw new Error("English is the source; edit src/data/i18n/en.json and the instrument directly");
  const path = new URL(`src/data/i18n/${code}.json`, ROOT);
  const doc = JSON.parse(readFileSync(path, "utf8"));
  const rows = parseCsv(readFileSync(csvPath, "utf8"));
  const [head, ...body] = rows;
  const col = (name) => head.findIndex((h) => h.trim().toLowerCase() === name);
  const iId = col("id"), iTr = col("translation");
  if (iId < 0 || iTr < 0) throw new Error("the sheet needs 'id' and 'translation' columns");
  const problems = [];
  let n = 0;
  doc.ui ??= {}; doc.items ??= {};
  for (const r of body) {
    const id = r[iId]?.trim(); const tr = (r[iTr] ?? "").trim();
    if (!id || !tr) continue;
    const [kind, key, value] = id.split(":");
    if (kind === "ui") {
      if (!(key in en.ui)) { problems.push(`unknown screen string ${id}`); continue; }
      const want = (en.ui[key].match(/\{\w+\}/g) ?? []).sort().join();
      if ((tr.match(/\{\w+\}/g) ?? []).sort().join() !== want) { problems.push(`${id}: placeholders must be ${want || "none"}`); continue; }
      doc.ui[key] = tr;
    } else {
      const it = inst.items.find((x) => x.key === key);
      if (!it) { problems.push(`unknown question ${id}`); continue; }
      const slot = (doc.items[key] ??= {});
      if (kind === "item") slot.text = tr;
      else if (kind === "help") slot.help = tr;
      else if (kind === "option") {
        if (!(it.options ?? []).some((o) => String(o.value) === value)) { problems.push(`unknown answer ${id}`); continue; }
        (slot.options ??= {})[value] = tr;
      } else { problems.push(`unknown row ${id}`); continue; }
    }
    n++;
  }
  if (problems.length) {
    console.error(`Not imported — fix these ${problems.length} rows first:\n  ` + problems.slice(0, 20).join("\n  "));
    process.exit(1);
  }
  doc.ui_status = doc.ui_status === "source" ? "source" : "imported — awaiting review";
  writeFileSync(path, JSON.stringify(doc, null, 1) + "\n");
  console.log(`src/data/i18n/${code}.json — ${n} strings imported. Status unchanged in src/data/locales.json (going live is a separate reviewed change).`);
}

const [cmd, a, b] = process.argv.slice(2);
if (cmd === "export" && a === "--all") registry.filter((l) => l.code !== "en").forEach((l) => exportSheet(l.code));
else if (cmd === "export" && a) exportSheet(a);
else if (cmd === "import" && a && b) importSheet(a, b);
else {
  console.log("usage:\n  node scripts/translation-sheet.mjs export <code>|--all\n  node scripts/translation-sheet.mjs import <code> <file.csv>");
  process.exit(cmd ? 1 : 0);
}
