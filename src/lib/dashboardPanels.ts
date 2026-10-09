/**
 * What an organisation chooses to show on its own dashboard ("Edit your
 * dashboard" → Your dashboard, migration 0054). Pure, no imports, unit-tested
 * (tests/dashboardPanels.test.ts).
 *
 * Every view and control is always available; an organisation admin decides
 * which ones are switched on. Stored as organisations.dashboard_panels — a
 * JSON object of { key: boolean }. A missing key means ON, so a panel added
 * later appears for everyone until they turn it off, and a database without
 * 0054 shows everything exactly as before.
 *
 * What a choice can never do:
 *   - hide the sample size: wherever a score is drawn its n and the "of those
 *     who have completed the Index" line stay with it (non-negotiable #1);
 *   - leave the dashboard empty: at least one of the three views stays on.
 *     If every view is switched off, the J12 matrix comes back.
 * These are display choices only — they never change what is collected,
 * scored or gated, and never show anything an organisation couldn't already see.
 */

export type PanelKey =
  | "figures"
  | "matrix"
  | "unengaged"
  | "heatmap"
  | "overlay"
  | "consult"
  | "who_answered"
  | "export"
  | "share";

export type PanelDef = { key: PanelKey; group: "Views" | "Tools" | "Below the results"; label: string; description: string };

export const PANELS: PanelDef[] = [
  { key: "matrix", group: "Views", label: "J12 matrix", description: "The twelve cells — Follow, Mission, World across the four tiers." },
  { key: "unengaged", group: "Views", label: "Unengaged matrix", description: "The same shape for those not yet following, scored apart." },
  { key: "heatmap", group: "Views", label: "Heat map", description: "Where your links reached, against the Collab's world map." },
  { key: "figures", group: "Tools", label: "Headline figures", description: "J12 index, completions and countries active, across the top." },
  { key: "overlay", group: "Tools", label: "Overlay the Collab", description: "The Collab's pooled figure in the corner of every cell." },
  { key: "consult", group: "Tools", label: "What does this mean?", description: "Ask a Collab facilitator about the view you're looking at." },
  { key: "who_answered", group: "Below the results", label: "Who answered", description: "Age groups, gender and places, grouped." },
  { key: "export", group: "Below the results", label: "Export your results", description: "CSV and PDF downloads, plus the per-question detail." },
  { key: "share", group: "Below the results", label: "Share about the JFINDX", description: "Documents and a QR code to pass on." },
];

export const VIEW_KEYS: PanelKey[] = ["matrix", "unengaged", "heatmap"];

export type Panels = Record<PanelKey, boolean>;

/** Stored choices → a full set, every unknown or missing key ON, never zero views. */
export function resolvePanels(stored: unknown): Panels {
  const src = stored && typeof stored === "object" && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {};
  const out = Object.fromEntries(PANELS.map((p) => [p.key, src[p.key] !== false])) as Panels;
  if (!VIEW_KEYS.some((k) => out[k])) out.matrix = true;
  return out;
}

/** Only the known keys, as booleans — what is sent to the database. */
export function panelsPatch(p: Panels): Record<PanelKey, boolean> {
  return Object.fromEntries(PANELS.map((d) => [d.key, Boolean(p[d.key])])) as Record<PanelKey, boolean>;
}
