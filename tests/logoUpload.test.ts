import { strict as assert } from "node:assert";
import { test } from "node:test";
import { fitWithin, logoPath, logoProblem, ourLogoPath } from "../src/lib/logoUpload.ts";

const ORG = "cfae9be6-2fcc-4b58-9190-8dd5c7c056cc";
const BASE = "https://abc.supabase.co/storage/v1/object/public/org-logos/";

test("logoPath lives in the organisation's own folder", () => {
  assert.equal(logoPath(ORG, 1700000000000, "image/png"), `${ORG}/logo-1700000000000.png`);
  assert.equal(logoPath(ORG, 1, "image/jpeg"), `${ORG}/logo-1.jpg`);
});

test("ourLogoPath recognises only this organisation's uploads", () => {
  assert.equal(ourLogoPath(`${BASE}${ORG}/logo-1.png`, ORG), `${ORG}/logo-1.png`);
  assert.equal(ourLogoPath(`${BASE}${ORG}/logo-1.png?t=2`, ORG), `${ORG}/logo-1.png`);
  assert.equal(ourLogoPath("https://shoreline.org/logo.png", ORG), null, "external logos are never removed");
  assert.equal(ourLogoPath(`${BASE}someone-else/logo.png`, ORG), null);
  assert.equal(ourLogoPath(`${BASE}${ORG}/../x.png`, ORG), null);
  assert.equal(ourLogoPath(null, ORG), null);
});

test("fitWithin shrinks, never enlarges", () => {
  assert.deepEqual(fitWithin(2000, 1000), { w: 512, h: 256 });
  assert.deepEqual(fitWithin(300, 200), { w: 300, h: 200 });
  assert.deepEqual(fitWithin(0, 10), { w: 0, h: 0 });
});

test("logoProblem explains what can't be used", () => {
  assert.equal(logoProblem({ type: "image/png", size: 200_000 }), null);
  assert.match(logoProblem({ type: "image/svg+xml", size: 1 }) ?? "", /SVG/);
  assert.match(logoProblem({ type: "application/pdf", size: 1 }) ?? "", /PNG, JPG or WebP/);
  assert.match(logoProblem({ type: "image/png", size: 50 * 1024 * 1024 }) ?? "", /over 10 MB/);
});
