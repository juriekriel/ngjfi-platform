"use client";

/**
 * /auth/confirm — where every sign-in email lands.
 *
 * The email link carries a one-time token (token_hash). Verifying it here
 * creates the session in WHATEVER browser opens the link — the phone's mail
 * app, a different browser, a different device — unlike the default PKCE
 * link, which only works in the exact browser tab that requested it and
 * breaks when a newer link has been requested since. That fragility was the
 * "sign-in loop": the link arrived, no session was made, /build said "Not
 * signed in".
 *
 * Needs the Supabase email templates to point here — see docs/AUTH_EMAILS.md.
 * The old ?code= (PKCE) links still work through /build as before.
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import { linkError, otpType, safeNext } from "@/lib/authLinks";

export default function ConfirmPage() {
  return (
    <Suspense fallback={<Frame><p className="text-[15px] text-ink-2">Signing you in…</p></Frame>}>
      <Confirm />
    </Suspense>
  );
}

function Confirm() {
  const q = useSearchParams();
  const sb = useMemo(() => getSupabaseBrowser(), []);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const next = safeNext(q.get("next"));
    const fromUrl = linkError(window.location.search, window.location.hash);
    if (fromUrl) return setErr(fromUrl);
    const tokenHash = q.get("token_hash");
    if (!sb) return setErr("Sign-in isn't configured for this site.");
    if (!tokenHash) return setErr("This link is missing its sign-in token. Request a fresh one.");

    sb.auth.verifyOtp({ token_hash: tokenHash, type: otpType(q.get("type")) }).then(({ error }) => {
      if (error) setErr(linkError("", `error_description=${encodeURIComponent(error.message)}`) ?? error.message);
      else window.location.replace(next);
    });
  }, [q, sb]);

  return (
    <Frame>
      {err ? (
        <>
          <h1 className="text-[24px] font-bold leading-tight tracking-tight">That link didn&apos;t sign you in</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{err}</p>
          <Link href="/access" className="mt-5 inline-block rounded-lg bg-ink px-5 py-3 text-[14px] font-semibold text-paper no-underline">
            Send me a new link →
          </Link>
        </>
      ) : (
        <p className="text-[15px] text-ink-2" role="status">Signing you in…</p>
      )}
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-lg px-6 py-20">{children}</main>;
}
