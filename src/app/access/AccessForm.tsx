"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabaseClient";

/**
 * Two jobs on one form, and the page was only doing one of them.
 *
 * Someone who ALREADY has access needs to sign in — that is the common case
 * once the first people are admitted, and the page had no button for it. Someone
 * who does not yet have access needs to ask. Both are the same magic link; the
 * difference is only whether a request row is recorded for a human to review.
 *
 * Sign in leads, because it is the action that will be taken most often.
 */
export default function AccessForm() {
  const sb = useMemo(() => getSupabaseBrowser(), []);
  const [mode, setMode] = useState<"signin" | "request">("signin");
  const [email, setEmail] = useState("");
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [signedIn, setSignedIn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Someone returning with a live session should not be asked to sign in again.
  useEffect(() => {
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => {
      if (data.session?.user?.email) setSignedIn(data.session.user.email);
    });
  }, [sb]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    if (!sb) {
      setBusy(false);
      setError("Sign-in isn't wired up in this environment yet.");
      return;
    }

    // Requesting also records the ask, so an address we have not admitted still
    // reaches a person rather than silently failing.
    if (mode === "request") {
      await sb.rpc("access_request", { p_email: email.trim(), p_reason: why.trim() || null });
    }

    const { error } = await sb.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo:
          typeof window !== "undefined" ? `${window.location.origin}/build` : undefined,
      },
    });

    setBusy(false);
    if (error) {
      setError(
        mode === "request"
          ? "We recorded the request but could not send the link just now. Someone will follow up by email."
          : "We could not send the link just now. Try again in a moment, or request access below.",
      );
      if (mode === "request") setSent(true);
      return;
    }
    setSent(true);
  }

  async function signOut() {
    if (!sb) return;
    await sb.auth.signOut();
    setSignedIn(null);
  }

  const field =
    "w-full border border-rule bg-plate px-3 py-2 text-[15px] text-ink outline-none focus:border-ink";
  const label = "tabular block text-[10px] uppercase tracking-[0.14em] text-ink-2";

  if (signedIn)
    return (
      <div className="border-2 border-ink p-6">
        <p className="figcap">Signed in</p>
        <h2 className="mt-3 text-[24px] leading-tight">You&apos;re in.</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
          As <b>{signedIn}</b>.
        </p>
        <Link
          href="/build"
          className="tabular mt-5 block border-2 border-ink bg-ink px-5 py-3 text-center text-[11px] uppercase tracking-[0.14em] text-paper no-underline"
        >
          Open the build room →
        </Link>
        <button
          type="button"
          onClick={signOut}
          className="tabular mt-3 w-full border border-rule px-5 py-2.5 text-[11px] uppercase tracking-[0.14em] text-ink-2 hover:border-ink hover:text-ink"
        >
          Sign out
        </button>
      </div>
    );

  if (sent)
    return (
      <div className="border-2 border-ink p-6">
        <p className="figcap">{mode === "signin" ? "Link sent" : "Request recorded"}</p>
        <h2 className="mt-3 text-[24px] leading-tight">
          {mode === "signin" ? "Check your inbox." : "We have it."}
        </h2>
        <p className="mt-4 text-[16px] leading-relaxed text-ink-2">
          {mode === "signin" ? (
            <>
              A sign-in link is on its way to <b>{email}</b>. It opens the build room directly — there
              is no password to remember, and the link works once.
            </>
          ) : (
            <>
              If <b>{email}</b> is already approved, a sign-in link is on its way. If it is not, this
              goes to a person rather than a queue, and you will hear back.
            </>
          )}
        </p>
        {error && <p className="mt-3 text-[15px] leading-relaxed text-vermillion">{error}</p>}
        <button
          type="button"
          onClick={() => {
            setSent(false);
            setError(null);
          }}
          className="tabular mt-5 w-full border border-rule px-5 py-2.5 text-[11px] uppercase tracking-[0.14em] text-ink-2 hover:border-ink hover:text-ink"
        >
          Use a different address
        </button>
      </div>
    );

  return (
    <form onSubmit={submit} className="border-2 border-ink p-6">
      <p className="figcap">{mode === "signin" ? "Ministry email · no password" : "Ministry email required"}</p>
      <h2 className="mt-3 text-[24px] leading-tight">
        {mode === "signin" ? "Sign in" : "Request early access"}
      </h2>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
        {mode === "signin" ? (
          <>
            There is no password. Enter your ministry email and we send a one-time link that takes you
            straight in — which means nothing to share, and nothing to leak.
          </>
        ) : (
          <>
            Use your organisation&apos;s email address — the one on your website domain. That is what
            the platform verifies against.
          </>
        )}
      </p>

      <div className="mt-5 space-y-4">
        <div>
          <label className={label} htmlFor="ae">
            Ministry email
          </label>
          <input
            id="ae"
            type="email"
            required
            autoComplete="email"
            className={`${field} mt-1.5`}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@yourministry.org"
          />
        </div>

        {mode === "request" && (
          <div>
            <label className={label} htmlFor="aw">
              What are you helping build?
            </label>
            <textarea
              id="aw"
              rows={3}
              className={`${field} mt-1.5`}
              value={why}
              onChange={(e) => setWhy(e.target.value)}
              placeholder="Research panel · instrument · a pilot cluster · the platform · something else"
            />
            <p className="margin-note mt-1">
              Optional, but it is what gets a request approved quickly.
            </p>
          </div>
        )}
      </div>

      {error && <p className="mt-4 text-[14px] leading-snug text-vermillion">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="tabular mt-6 w-full border-2 border-ink bg-ink px-5 py-3 text-[11px] uppercase tracking-[0.14em] text-paper disabled:opacity-50"
      >
        {busy
          ? "Sending…"
          : mode === "signin"
            ? "Send me a sign-in link →"
            : "Request access →"}
      </button>

      <div className="mt-4 border-t border-rule pt-3">
        {mode === "signin" ? (
          <p className="margin-note">
            Don&apos;t have access yet?{" "}
            <button
              type="button"
              onClick={() => {
                setMode("request");
                setError(null);
              }}
              className="underline decoration-rule underline-offset-2 hover:text-ink"
            >
              Request it →
            </button>
          </p>
        ) : (
          <p className="margin-note">
            Already have access?{" "}
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setError(null);
              }}
              className="underline decoration-rule underline-offset-2 hover:text-ink"
            >
              Sign in →
            </button>
          </p>
        )}
      </div>
    </form>
  );
}
