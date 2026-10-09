/**
 * How the pilot-readiness panel reads pilot_readiness() (0042, reshaped in
 * 0049). Kept free of React so it can be tested directly.
 */
export type ReadinessCheck = { check: string; ok: boolean; detail: string; blocking?: boolean };

/** pass = ✓ green · info = • amber (non-blocking) · fail = ✕ red. */
export function checkState(c: ReadinessCheck): "pass" | "info" | "fail" {
  if (c.ok) return "pass";
  // A database that predates 0049 sends no `blocking`: treat it as blocking.
  return c.blocking === false ? "info" : "fail";
}

/** The one-line headline. Only a blocking failure turns it red. */
export function headline(r: { ready: boolean; checks: ReadinessCheck[] }): string {
  if (!r.ready) return "Not ready yet — see the red items.";
  return r.checks.some((c) => checkState(c) === "info")
    ? "Ready to pilot — the amber items are for information. Now confirm the list below by hand."
    : "The database is ready — now confirm the list below by hand.";
}

/** A hand-confirmed item (0051): the things no database can see. */
export type HandCheck = {
  item: string;
  label: string;
  requires_note: boolean;
  confirmed: boolean;
  confirmed_at: string | null;
  confirmed_by: string | null;
  note: string | null;
};

/** "Confirmed by Jurie Kriel · 8 Oct 2026" — or null when not confirmed. */
export function confirmedLine(h: HandCheck, locale = "en-GB"): string | null {
  if (!h.confirmed || !h.confirmed_at) return null;
  const when = new Date(h.confirmed_at).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  return `Confirmed by ${h.confirmed_by ?? "an administrator"} · ${when}`;
}
