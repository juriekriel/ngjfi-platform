/**
 * View-only share links (migration 0046) — pure, unit-tested
 * (tests/shareLinks.test.ts). Every rule that protects anyone lives in the
 * database: the token hash, the expiry, the minimums, the passcode lockout.
 * This file is labels, URL shape and friendly pre-checks only — a check here
 * that the database didn't also make would be a check that didn't exist.
 */

/** The route a share link opens. 'view' is a reserved short name (0046). */
export const SHARE_PATH = "/view";

/** A token is 64 lowercase hex characters (two v4 UUIDs, 0046). */
export const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

export function shareUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}${SHARE_PATH}/${token}`;
}

export function isToken(s: string | null | undefined): boolean {
  return typeof s === "string" && TOKEN_PATTERN.test(s);
}

/**
 * Lifetimes offered in the form. The server holds the real bounds
 * (share_link_max_days, default 365) and refuses anything outside them.
 */
export const EXPIRY_CHOICES: { days: number; label: string }[] = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 180, label: "6 months" },
  { days: 365, label: "1 year" },
];
export const DEFAULT_EXPIRY_DAYS = 90;

/** Mirrors create_share_link()'s checks, so the form can say so before a round trip. */
export function passcodeProblem(raw: string): string | null {
  const p = raw.trim();
  if (p.length === 0) return null; // optional
  if (p.length < 4 || p.length > 32) return "A passcode is 4 to 32 characters.";
  return null;
}

export function labelProblem(raw: string): string | null {
  const l = raw.trim();
  if (l.length === 0) return "Give the link a name, so you can tell it apart later.";
  if (l.length > 80) return "Keep the name under 80 characters.";
  return null;
}

export type ShareLinkRow = {
  id: string;
  label: string;
  scope: "house" | "room";
  room_name: string | null;
  created_at: string;
  created_by: string | null;
  expires_at: string;
  revoked_at: string | null;
  live: boolean;
  has_passcode: boolean;
  show_map: boolean;
  show_detail: boolean;
  view_count: number;
  last_viewed_at: string | null;
};

export type ShareState = "live" | "expired" | "revoked";

export function shareState(row: Pick<ShareLinkRow, "revoked_at" | "expires_at">, now: number = Date.now()): ShareState {
  if (row.revoked_at) return "revoked";
  return new Date(row.expires_at).getTime() > now ? "live" : "expired";
}

/** "the whole organisation" or the room's name — what a link shows. */
export function scopeLabel(row: Pick<ShareLinkRow, "scope" | "room_name">, orgName: string): string {
  return row.scope === "room" ? `“${row.room_name ?? "a link"}” only` : `All ${orgName} surveys`;
}

/** What shared_dashboard() can answer. Unknown, revoked and expired are one state on purpose. */
export type SharedStatus = "ok" | "unavailable" | "passcode_required" | "passcode_wrong" | "locked";
