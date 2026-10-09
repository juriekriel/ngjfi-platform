import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PANELS, VIEW_KEYS, panelsPatch, resolvePanels } from "../src/lib/dashboardPanels.ts";

const read = (p: string) => readFileSync(p, "utf8");

test("missing or unknown choices mean ON; a stored false turns a panel off", () => {
  const all = resolvePanels(null);
  for (const p of PANELS) assert.equal(all[p.key], true, `${p.key} on by default`);
  const some = resolvePanels({ heatmap: false, share: false, nonsense: false });
  assert.equal(some.heatmap, false);
  assert.equal(some.share, false);
  assert.equal(some.matrix, true);
  assert.equal(resolvePanels([false]).matrix, true, "a non-object is ignored");
});

test("the dashboard is never left with no view", () => {
  const none = resolvePanels(Object.fromEntries(VIEW_KEYS.map((k) => [k, false])));
  assert.ok(VIEW_KEYS.some((k) => none[k]), "a view comes back");
  assert.equal(none.matrix, true);
});

test("only known keys are sent to the database, as booleans", () => {
  const patch = panelsPatch(resolvePanels({ heatmap: false }));
  assert.deepEqual(Object.keys(patch).sort(), PANELS.map((p) => p.key).sort());
  for (const v of Object.values(patch)) assert.equal(typeof v, "boolean");
});

test("the frame and the dashboard page honour every panel", () => {
  const frame = read("src/components/index/SignedInFrame.tsx");
  for (const k of ["figures", "matrix", "unengaged", "heatmap", "overlay", "consult"]) assert.match(frame, new RegExp(`show\\.${k}`), `frame checks ${k}`);
  const page = read("src/app/[org]/dashboard/page.tsx");
  for (const k of ["who_answered", "export", "share"]) assert.match(page, new RegExp(`panels\\.${k}`), `page checks ${k}`);
  // A choice is display only: the scope line (with its n) is still drawn under the matrix.
  assert.match(frame, /\{p\.scopeLine\}/);
});
