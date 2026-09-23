/**
 * "What does this mean?" — the view snapshot a consulting request carries.
 *
 * Pure functions, so they're unit-tested (tests/consult.test.ts) and so the
 * shape sent to submit_consulting_question() (migration 0033) is decided in
 * one place. The database whitelists the same keys again server-side: this
 * describes the aggregate VIEW someone was looking at, never respondent data.
 */

export type ConsultView = {
  tab: "org" | "collab";
  /** Display name of the organisation whose dashboard this is. */
  orgName: string;
  /** Null for the whole house. */
  roomName: string | null;
  view: "matrix" | "heatmap";
  tier: string;
  /** Display label for `tier` (TIER_LABEL from model.ts) — passed in so this file has no imports and tests can load it directly. */
  tierLabel: string;
  overlay: boolean;
  /** n behind the figure currently on screen. */
  n: number | null;
};

export type ConsultContext = {
  tab: string;
  scope: string;
  room?: string;
  view: string;
  tier?: string;
  overlay: boolean;
  summary: string;
};

export function consultContext(v: ConsultView): ConsultContext {
  const scope = v.tab === "collab" ? "Collab Intelligence · every organisation" : v.roomName ? `${v.orgName} · ${v.roomName}` : `${v.orgName} · the whole house`;
  const viewLabel =
    v.view === "heatmap"
      ? `Heat map, ${v.tierLabel}`
      : `J12 matrix${v.overlay ? (v.tab === "collab" ? `, ${v.orgName} overlay on` : ", Collab overlay on") : ""}`;
  const ctx: ConsultContext = {
    tab: v.tab,
    scope,
    view: v.view,
    overlay: v.overlay,
    summary: `${scope} · ${viewLabel}${v.n != null ? ` · n ${v.n.toLocaleString("en")}` : ""}`,
  };
  if (v.roomName && v.tab === "org") ctx.room = v.roomName;
  if (v.view === "heatmap") ctx.tier = v.tier;
  return ctx;
}

/** Three starting questions, matched to what is on screen. */
export function consultSuggestions(v: ConsultView): string[] {
  const tier = v.tierLabel;
  if (v.view === "heatmap")
    return [
      "Why is our country still grey on the map?",
      `What does ${tier} look like in the countries that are active?`,
      "How do we help our country reach the threshold?",
    ];
  if (v.tab === "collab")
    return [
      "Why does Multiplication drop so sharply across the Collab?",
      "Where do organisations usually differ most?",
      "What should we focus on next season?",
    ];
  return [
    "Why does Multiplication drop so sharply for us?",
    v.n != null ? `Is our gap to the Collab meaningful at n ${v.n.toLocaleString("en")}?` : "Is our gap to the Collab meaningful?",
    "What should we focus on next season?",
  ];
}
