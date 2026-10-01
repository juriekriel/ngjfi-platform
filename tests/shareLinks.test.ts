import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import {
  EXPIRY_CHOICES,
  isToken,
  labelProblem,
  passcodeProblem,
  scopeLabel,
  shareState,
  shareUrl,
} from "../src/lib/shareLinks.ts";

const sql = readFileSync(new URL("../supabase/migrations/0046_view_only_share_links.sql", import.meta.url), "utf8");
const sw = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

test("share URLs are /view/<token>, whatever the origin's trailing slash", () => {
  const tok = "a".repeat(64);
  assert.equal(shareUrl("https://jfindx.org", tok), `https://jfindx.org/view/${tok}`);
  assert.equal(shareUrl("https://jfindx.org/", tok), `https://jfindx.org/view/${tok}`);
  assert.ok(isToken(tok));
  assert.ok(!isToken("A".repeat(64)), "tokens are lowercase hex");
  assert.ok(!isToken("a".repeat(63)));
  assert.ok(!isToken(undefined));
});

test("form pre-checks mirror create_share_link()", () => {
  assert.equal(passcodeProblem(""), null, "a passcode is optional");
  assert.equal(passcodeProblem("   "), null);
  assert.ok(passcodeProblem("123"));
  assert.equal(passcodeProblem(" 4821 "), null, "trimmed, like the server");
  assert.ok(passcodeProblem("x".repeat(33)));
  assert.ok(labelProblem("  "));
  assert.equal(labelProblem("Field leaders"), null);
  assert.ok(labelProblem("x".repeat(81)));
  assert.ok(EXPIRY_CHOICES.every((c) => c.days >= 1 && c.days <= 365), "never offer what the default max refuses");
});

test("link state: revoked wins, then expiry", () => {
  const now = Date.parse("2026-10-01T12:00:00Z");
  assert.equal(shareState({ revoked_at: null, expires_at: "2026-12-01T00:00:00Z" }, now), "live");
  assert.equal(shareState({ revoked_at: null, expires_at: "2026-09-01T00:00:00Z" }, now), "expired");
  assert.equal(shareState({ revoked_at: "2026-09-30T00:00:00Z", expires_at: "2026-12-01T00:00:00Z" }, now), "revoked");
  assert.equal(scopeLabel({ scope: "house", room_name: null }, "Shoreline"), "All Shoreline surveys");
  assert.equal(scopeLabel({ scope: "room", room_name: "Kenya camp" }, "Shoreline"), "“Kenya camp” only");
});

test("0046 holds the platform's minimums — no share-specific threshold, no literals", () => {
  // Every floor comes from the same platform_settings rows the dashboard reads.
  for (const key of ["min_group_n", "room_min_n", "country_critical_mass_gate"]) {
    assert.match(sql, new RegExp(`setting_int\\('${key}'`), `${key} is read from config`);
  }
  assert.doesNotMatch(sql, /share_link_min|share_min_n/, "a shared view has no threshold of its own");
  assert.doesNotMatch(sql, /n\s*>=\s*\d{2,}/, "no hard-coded n threshold");
  // Limits are config too.
  for (const key of ["share_link_default_days", "share_link_max_days", "share_link_limit",
                     "share_link_passcode_max_failures", "share_link_lockout_minutes"]) {
    assert.match(sql, new RegExp(`'${key}'`), `${key} is a platform setting`);
  }
});

test("0046 never overlays the Collab on the organisation's figures; the map is the dashboard's own", () => {
  const fn = sql.slice(sql.indexOf("create or replace function public.shared_dashboard"));
  assert.doesNotMatch(fn, /collab_intelligence|org_benchmark|benchmark|compare/i);
  assert.match(fn, /_org_dashboard_core\(/, "the house reads the dashboard's own core");
  assert.match(fn, /_link_dashboard_core\(/, "a room reads the room's own core");
  const map = sql.slice(sql.indexOf("function public._scope_country_map("), sql.indexOf("revoke all on function public._scope_country_map"));
  assert.match(map, /collab_intelligence\(\)/, "country colours are the dashboard's map: all data per country");
  assert.match(map, /'published'/, "and respect the same publish switch");
});

test("0046 stores tokens hashed, cascades room deletion, and keeps cores internal", () => {
  assert.match(sql, /token_hash\s+text not null unique/);
  assert.doesNotMatch(sql, /\btoken\s+text not null/, "the raw token is never a column");
  assert.match(sql, /distribution_link_id uuid references public\.distribution_links\(id\) on delete cascade/,
    "a deleted room must take its links with it, never widen them to the house");
  for (const fn of ["_org_dashboard_core(uuid, date, date)", "_link_dashboard_core(uuid)",
                    "_scope_country_map(uuid, uuid)", "_gated_trend(uuid, boolean, int)"]) {
    assert.ok(sql.includes(`revoke all on function public.${fn} from public, anon, authenticated;`), `${fn} is internal`);
  }
  assert.match(sql, /grant execute on function public\.shared_dashboard\(text, text\) to anon, authenticated;/);
});

test("the service worker never caches a share page", () => {
  assert.match(sw, /\\\/view\(\\\/\|\$\)/);
});
