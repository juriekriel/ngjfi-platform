import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { normaliseRole, seatsLeft, TEAM_ROLE_LABEL } from "../src/lib/team.ts";

test("seats left counts down to zero and never below", () => {
  assert.equal(seatsLeft(5, 0), 5);
  assert.equal(seatsLeft(5, 5), 0);
  assert.equal(seatsLeft(5, 7), 0);
  assert.equal(seatsLeft(null, 12), null, "sandbox has no limit");
});

test("legacy facilitator rows read as coordinators", () => {
  assert.equal(normaliseRole("facilitator"), "coordinator");
  assert.equal(normaliseRole("org_admin"), "org_admin");
  assert.equal(normaliseRole("researcher"), null);
  assert.equal(TEAM_ROLE_LABEL.org_admin, "Org Administrator");
});

test("migration 0043 holds the one-administrator rule and keeps the limit as config", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0043_org_team_tiers.sql", import.meta.url), "utf8");
  assert.match(sql, /create unique index if not exists org_members_one_admin[\s\S]*where role = 'org_admin' and status = 'active'/);
  assert.match(sql, /'org_coordinator_limit', '5'::jsonb/);
  assert.doesNotMatch(sql, />= 5\b/, "the limit is read from platform_settings, never a literal");
});
