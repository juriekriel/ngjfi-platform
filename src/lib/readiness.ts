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
