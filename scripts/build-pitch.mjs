// Builds the leadership pitch (public/pitch/index.html, served at /pitch) from
// scripts/pitch/template.html and the LIVE instrument, src/data/instrument.v7.json.
//
//   node scripts/build-pitch.mjs
//
// Round 8 (Oct 2026): "show v6 in the pitch link; no older version of the
// survey should exist anywhere else". The pitch used to carry its own,
// hand-typed question set, which drifted from the instrument. Now its Survey
// tab and phone preview are generated, word for word, from the instrument
// file the survey itself runs, so they cannot drift again:
// tests/pitch.test.ts fails if public/pitch/index.html is not what this
// script produces, or if it contains any question a later version retired.
//
// The same file is a drop-in for the standalone pitch site
// (ngjfi-pitch-6-1.netlify.app): it is fully self-contained.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");

export const LIVE = "v7";

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const en = (t) => (t && typeof t === "object" ? t.en : t) ?? "";

const TIER = { exposure: ["t1", "Exposure"], response: ["t2", "Response"], formation: ["t3", "Formation"], multiplication: ["t4", "Multiplication"] };
const DOMAIN = {
  follow: ["Question 01 · Do they follow Jesus?", "Personal faith"],
  mission: ["Question 02 · Do they participate in His mission?", "Outward"],
  world: ["Question 03 · Does their world look different?", "Lived impact"],
};

/** Items a respondent can actually be shown from this version, in survey order. */
export function fieldedItems(inst) {
  return inst.items
    .filter((i) => !i.archived && (!i.draft || inst.field_draft_items))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function scaleLabel(i, likert) {
  if (i.type === "likert_5") return "5 points · how true of me";
  if (i.type === "frequency") return "Frequency";
  if (i.type === "multi_select") return i.max_select ? `Choose up to ${i.max_select}` : "Check all that apply";
  if (i.type === "single_select") return "Single choice";
  if (i.key === "country") return "Pick-list";
  return i.type;
}

function optionsHtml(i, likert) {
  if (i.type === "likert_5") {
    return `<div class="scale-mini">${likert.map((l, n) => `<span class="sm-pill">${n + 1} · ${esc(l)}</span>`).join("")}</div>`;
  }
  if (i.key === "country") return `<div class="chips"><span class="opt">Country ▾ (every country, from a list)</span></div>`;
  if (!i.options?.length) return "";
  return `<div class="chips">${i.options
    .map((o) => `<span class="opt">${esc(en(o.text))}${o.ends_survey ? " → ends the survey, nothing kept" : ""}</span>`)
    .join("")}</div>`;
}

function itemHtml(i, likert, extraTag) {
  const t = TIER[i.tier];
  const cls = t ? t[0] : "t1";
  const chips = [];
  if (i.section === "index" && i.scored !== false && t) {
    chips.push(`<span class="chip ${cls}">${t[1]}</span>`);
    if (i.measure) chips.push(`<span class="chip meas">${i.measure === "internal" ? "Internal" : "External"}</span>`);
  } else if (extraTag) {
    chips.push(`<span class="chip unscored">${esc(extraTag)}</span>`);
  }
  const left = `<span class="ichips">${chips.join("")}</span>`;
  const right = `<span class="chip scale">${esc(scaleLabel(i, likert))}</span>`;
  const rev = i.reverse_scored ? ` <span style="color:var(--accent-soft)">ʳ</span>` : "";
  const help = i.help ? `<div class="route-note">${esc(en(i.help))}</div>` : "";
  return `    <div class="item ${cls}" data-key="${esc(i.key)}"><div class="ihead">${left}${right}</div><div class="qt">${esc(en(i.text))}${rev}</div>${optionsHtml(i, likert)}${help}</div>`;
}

const sect = (n, title, sub) =>
  `    <div class="sect"><div class="sq"><span class="sn">${esc(n)}</span>${esc(title)}</div>${sub ? `<div class="sd">${esc(sub)}</div>` : ""}</div>`;
const route = (k, t, d) =>
  `    <div class="route"><div class="rk">${esc(k)}</div><div class="rt">${esc(t)}</div><div class="rd">${d}</div></div>`;

function indexBlock(items, likert, prefix) {
  const out = [];
  for (const d of ["follow", "mission", "world"]) {
    const inD = items.filter((i) => i.question_domain === d && (i.scored !== false || i.attention_check));
    if (!inD.length) continue;
    out.push(sect(`${prefix}${DOMAIN[d][0]}`, DOMAIN[d][1], null));
    let tier = null;
    for (const i of inD) {
      if (i.tier !== tier) {
        tier = i.tier;
        if (TIER[tier]) out.push(`    <div class="tier-sub">${TIER[tier][1]}</div>`);
      }
      out.push(itemHtml(i, likert, i.attention_check ? "Attention check · unscored" : null));
    }
  }
  return out;
}

export function build() {
  const inst = JSON.parse(read(`src/data/instrument.${LIVE}.json`));
  const i18n = JSON.parse(read("src/data/i18n/en.json"));
  const likert = [1, 2, 3, 4, 5].map((n) => (i18n.ui ?? i18n)[`likert_${n}`]);
  if (likert.some((l) => !l)) throw new Error("likert labels missing from src/data/i18n/en.json");
  const items = fieldedItems(inst);
  const by = (f) => items.filter(f);
  const full = inst.item_sets?.full?.welcome_minutes ?? inst.welcome_minutes;
  const j12 = inst.item_sets?.j12?.welcome_minutes;
  const lock = inst.lock?.locked ? `locked ${inst.lock.locked_on}` : "not yet locked";
  const scored = by((i) => i.section === "index" && i.scored !== false);
  const engaged = by((i) => i.section === "index" && i.branch !== "unengaged");
  const unengaged = by((i) => i.section === "index" && i.branch === "unengaged");
  const ac = (k) => items.find((i) => i.key === k);

  // Keep each route's attention check where the survey asks it.
  const withCheck = (list, key) => {
    const c = ac(key);
    if (!c) return list;
    const at = list.findIndex((i) => (i.order ?? 0) > (c.order ?? 0));
    const out = [...list];
    out.splice(at < 0 ? out.length : at, 0, { ...c, question_domain: list[Math.max(0, at - 1)]?.question_domain, tier: "na" });
    return out;
  };

  const L = [];
  L.push(sect("Getting started", "Who is answering, and which route they take", "Asked of everyone. The answers decide the route; nothing here is scored."));
  for (const i of by((i) => i.key === "age_band" || i.section === "screener").filter((i) => !i.attention_check)) {
    L.push(itemHtml(i, likert, i.section === "screener" ? "Routing · unscored" : "About you · unscored"));
  }
  L.push(`    <div class="route-note"><b>Route A</b> (the Index): "New follower of Jesus" or "Committed, actively growing", or "Yes" to the follow-up. <b>Route B</b> (the Exploration Index): every other answer, including "Not sure" and "Prefer not to say". The follow-up is only asked after "None of these" or "Prefer not to say".</div>`);

  L.push(route("Route A · following Jesus", "The Index", `${engaged.filter((i) => i.scored !== false).length} scored questions, two in every cell of the 3 × 4 grid (one internal, one external), plus the two prayer and scripture questions, which are measured but not scored.`));
  L.push(...indexBlock(withCheck(engaged, "attention_check"), likert, ""));
  const core = engaged.filter((i) => i.scored === false);
  if (core.length) {
    L.push(sect("Route A · Core activities", "Prayer and scripture", "Measured every time and reported as their own figure; 'Weekly' or 'Most days' counts. Not part of the Index score."));
    for (const i of core) L.push(itemHtml(i, likert, "Core activity · measured, unscored"));
  }

  L.push(route("Route B · not currently following", "The Exploration Index", `The same 3 × 4 grid, ${unengaged.length} questions worded for someone exploring. Scored separately and <b>never blended</b> with the Index.`));
  L.push(...indexBlock(withCheck(unengaged, "attention_check_unengaged"), likert, "Route B · "));

  for (const [b, name] of [["engaged", "Route A"], ["unengaged", "Route B"]]) {
    const dj = by((i) => (i.section === "driver" || i.section === "journey") && (i.branch ?? "engaged") === b);
    if (!dj.length) continue;
    L.push(sect(`${name} · Drivers & Journey`, "What shapes the journey", "Asked of everyone on this route. Unscored: reported only as grouped option shares, never folded into a score."));
    for (const i of dj) L.push(itemHtml(i, likert, i.section === "driver" ? "Driver · unscored" : "Journey · unscored"));
  }

  L.push(sect("About you", "A few details to enable benchmarking", "Optional where marked. No names, emails, birthdays or city."));
  for (const i of by((i) => i.section === "demographic" && i.key !== "age_band")) L.push(itemHtml(i, likert, "About you · unscored"));

  // The phone preview: a representative path through Route A, real wording.
  const pick = (k) => items.find((i) => i.key === k);
  const steps = [{ kind: "welcome" }];
  const preview = ["orientation", "follow_response_external", "mission_multiplication_external", "world_formation_external", "pray_frequency", "driver_sources_of_belief_engaged"];
  const tags = { follow: "Following Jesus", mission: "His mission", world: "A different world", screener: "A quick start", drivers: "What shapes you", journey: "Your journey" };
  preview.forEach((k, n) => {
    const i = pick(k);
    if (!i) return;
    const base = { label: `Question ${n + 1} of ${preview.length}`, tag: tags[i.question_domain] ?? "", q: en(i.text) };
    if (i.type === "likert_5") steps.push({ kind: "likert", ...base });
    else if (i.type === "multi_select") steps.push({ kind: "multi", ...base, max: i.max_select ?? i.options.length, opts: i.options.map((o) => en(o.text)) });
    else steps.push({ kind: "single", ...base, opts: i.options.map((o) => en(o.text)) });
  });
  steps.push({ kind: "done" });

  const sub = `Instrument ${inst.version}, the pilot instrument, ${lock}. Every question below is exactly what a young person is asked, generated from the instrument file the survey runs. About ${full} minutes for the full survey${j12 ? `, about ${j12} for the J12 only` : ""}.`;
  const status = `<div class="illus"><span class="tag">${inst.lock?.locked ? "Locked" : "Live"} · ${esc(inst.version)}</span><span>${scored.length} scored questions across both routes. Any change to what is asked or how it is scored is a new version, never an edit.</span></div>`;

  let html = read("scripts/pitch/template.html");
  const put = (marker, value) => {
    if (!html.includes(marker)) throw new Error(`template is missing ${marker}`);
    html = html.split(marker).join(value);
  };
  put("<!--V6:SUB-->", `<p class="demo-sub">${esc(sub)}</p>`);
  put("<!--V6:STATUS-->", status);
  put("<!--V6:ITEMS-->", L.join("\n"));
  put("<!--V6:FOOT-->", `Instrument ${esc(inst.version)} · ${esc(lock)}`);
  put("/*V6:STEPS*/", JSON.stringify(steps));
  put("/*V6:LIKERT*/", JSON.stringify(likert));
  put("/*V6:MINUTES*/", String(full));
  return html;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  mkdirSync(new URL("public/pitch/", root), { recursive: true });
  writeFileSync(new URL("public/pitch/index.html", root), build());
  console.log(`public/pitch/index.html built from instrument.${LIVE}.json`);
}
