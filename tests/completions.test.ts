import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { completionsNote } from "../src/lib/completions.ts";

const sql = readFileSync(new URL("../supabase/migrations/0047_non_followers_counted_scored_apart.sql", import.meta.url), "utf8");

test("completions read as one total with its split", () => {
  assert.equal(completionsNote({ total: 1240, following: 1000, not_following: 240 }), "1,000 following · 240 not yet following");
});

test("0047 keeps non-followers out of every score that isn't theirs", () => {
  for (const fn of ["blended_trend", "org_benchmark", "network_console", "org_dashboard_admin"]) {
    const i = sql.indexOf(`function public.${fn}(`);
    assert.ok(i > 0, `${fn} is redefined`);
    const body = sql.slice(i, sql.indexOf("$function$;", i));
    assert.match(body, /branch is distinct from 'unengaged'/, `${fn} filters the Unengaged branch`);
  }
  assert.match(sql, /primary key \(org_id, year, question_domain, tier, branch\)/, "the archive keeps branches apart");
});

test("0047 unlocks the Unengaged matrix at the same floors, never a new one", () => {
  const room = sql.slice(sql.indexOf("function public._link_dashboard_core("));
  assert.match(room, /if v_explore_n >= v_min then/, "a room's Unengaged matrix uses room_min_n, the floor its J12 uses");
  assert.match(sql, /'exploration_suppressed', v_explore_n < v_min_group_n/, "the house uses min_group_n");
  assert.doesNotMatch(sql, /unengaged_min|exploration_gate/, "no separate threshold");
});

test("the demo preview reads the product's own core", () => {
  const demo = sql.slice(sql.indexOf("function public.org_dashboard_demo("));
  assert.match(demo, /_org_dashboard_core\(v_org\.id, null, null\)/);
});
