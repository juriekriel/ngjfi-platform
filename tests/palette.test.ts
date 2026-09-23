import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { MAP_TIER_RGB, tierCellInk } from "../src/lib/model.ts";

/**
 * The tier hues exist twice by necessity: as CSS variables (what is painted)
 * and as numbers in model.ts (to pick legible cell text). This keeps the two
 * identical, so the landing page's colours and the J12 matrix can't drift.
 */
const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

test("MAP_TIER_RGB matches the --c-map-* tokens in globals.css", () => {
  for (const [tier, rgb] of Object.entries(MAP_TIER_RGB)) {
    const m = css.match(new RegExp(`--c-map-${tier}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)`));
    assert.ok(m, `--c-map-${tier} not found in globals.css`);
    assert.deepEqual(rgb, [Number(m[1]), Number(m[2]), Number(m[3])], `${tier} drifted from globals.css`);
  }
});

test("cell text picks a legible colour at both ends of the scale", () => {
  for (const tier of Object.keys(MAP_TIER_RGB)) {
    assert.match(tierCellInk(tier, 1), /--c-ink/, `${tier} at 1 should use ink`);
  }
  assert.match(tierCellInk("formation", null), /--c-ink/);
});
