/**
 * Sign-in link helpers — pure, no imports, unit-tested (tests/authLinks.test.ts).
 */

/**
 * Where to send someone after a sign-in link. Only a same-site path is ever
 * followed ("/build", "/shoreline/dashboard"); anything else — an absolute
 * URL, "//evil.example", a backslash trick — falls back to /build, so a
 * crafted link can't bounce a freshly signed-in person to another site.
 */
export function safeNext(next: string | null | undefined): string {
  if (!next) return "/build";
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /[\u0000-\u001f]/.test(next)) return "/build";
  return next;
}

/** The OTP types a sign-in email can carry (Supabase verifyOtp). */
export const EMAIL_OTP_TYPES = ["email", "magiclink", "signup", "invite", "recovery", "email_change"] as const;
export type EmailOtpType = (typeof EMAIL_OTP_TYPES)[number];
export function otpType(t: string | null | undefined): EmailOtpType {
  return (EMAIL_OTP_TYPES as readonly string[]).includes(t ?? "") ? (t as EmailOtpType) : "email";
}

/**
 * A sign-in failure Supabase reports back in the URL — as ?error=… or
 * #error=… — turned into plain words. Null when there isn't one.
 */
export function linkError(search: string, hash: string): string | null {
  const q = new URLSearchParams(search.replace(/^\?/, ""));
  const h = new URLSearchParams(hash.replace(/^#/, ""));
  const code = q.get("error_code") ?? h.get("error_code");
  const desc = q.get("error_description") ?? h.get("error_description");
  if (!code && !desc && !q.get("error") && !h.get("error")) return null;
  if (code === "otp_expired" || /expired|invalid/i.test(desc ?? ""))
    return "That sign-in link has expired or has already been used. Links work once, for about an hour — request a fresh one.";
  return desc ? desc.replace(/\+/g, " ") : "That sign-in link didn't work. Request a fresh one.";
}

/** Supabase's email rate limit, in words a person can act on. */
export function sendError(err: { message?: string; code?: string; status?: number } | null): string | null {
  if (!err) return null;
  if (err.code === "over_email_send_rate_limit" || err.status === 429 || /rate limit/i.test(err.message ?? ""))
    return "Too many sign-in emails have been sent in the last hour. Wait a few minutes and try again — if you already requested one, use the newest email.";
  if (/only request this after/i.test(err.message ?? ""))
    return "A link was sent less than a minute ago. Check your inbox, or wait a moment and try again.";
  return null;
}
