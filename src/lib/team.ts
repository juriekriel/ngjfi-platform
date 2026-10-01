/**
 * Organisation team tiers (migration 0043) — pure, unit-tested (tests/team.test.ts).
 * The rules themselves live in the database; this is labels and arithmetic.
 */
export type TeamRole = "org_admin" | "coordinator";

export const TEAM_ROLE_LABEL: Record<TeamRole, string> = {
  org_admin: "Org Administrator",
  coordinator: "Coordinator",
};

/** Places left for coordinators, counting pending invitations. Null = no limit (sandbox). */
export function seatsLeft(limit: number | null | undefined, used: number): number | null {
  if (limit == null) return null;
  return Math.max(0, limit - used);
}

/** Older rows and callers may still say "facilitator" — it means coordinator now. */
export function normaliseRole(role: string | null | undefined): TeamRole | null {
  if (role === "org_admin") return "org_admin";
  if (role === "coordinator" || role === "facilitator") return "coordinator";
  return null;
}
