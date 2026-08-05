"use client";

import { useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";

/**
 * Early access request → magic link.
 *
 * Reuses the platform's existing auth: a magic link to a ministry email, with
 * domain verification behind it. Two things are deliberate here.
 *
 * First, we never claim the link grants entry — access is approved individually,
 * and saying so plainly is better than letting someone discover it after
 * clicking. Second, the form states what season one means: the build room opens
 * before the Index itself does, and interacting with the real instrument waits on
 * researcher sign-off.
 */
export default function AccessForm() {
  const sb = useMemo(() => getSupabaseBrowser(), []);
  const [email, setEmail] = useState("");
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    if (sb) {
      // Record the request first, so an unapproved address still reaches a human.
      await sb.rpc("access_request", { p_email: email.trim(), p_reason: why.trim() || null });
      const { error } = await sb.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo:
            typeof window !== "undefined" ? `${window.location.origin}/build` : undefined,
        },
      });
      if (error) {
        setBusy(false);
        setError(
          "We recorded the request but could not send the link just now. Someone will follow up by email.",
        );
        setSent(true);
        return;
      }
    }
    setBusy(false);
    setSent(true);
  }

  const field =
    "w-full border border-rule bg-plate px-3 py-2 text-[15px] text-ink outline-none focus:border-ink";
  const label = "tabular block text-[10px] uppercase tracking-[0.14em] text-ink-2";

  if (sent)
    return (
      <div className="border-2 border-ink p-6">
        <p className="figcap">Request recorded</p>
        <h2 className="mt-3 text-[24px] leading-tight">We have it.</h2>
        <p className="mt-4 text-[16px] leading-relaxed text-ink-2">
          If your address is already approved, a sign-in link is on its way. If it is not, this goes to
          a person rather than a queue, and you will hear back.
        </p>
        {error && <p className="mt-3 text-[15px] leading-relaxed text-vermillion">{error}</p>}
        <p className="margin-note mt-5 border-l-2 border-emerald pl-3">
          Season one has to be signed off by the research panel before anyone interacts with the real
          instrument. Until then the build room is documentation, decisions and the repo — which is
          most of what is useful anyway.
        </p>
      </div>
    );

  return (
    <form onSubmit={submit} className="border-2 border-ink p-6">
      <p className="figcap">Ministry email required</p>
      <h2 className="mt-3 text-[24px] leading-tight">Request early access</h2>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
        Use your organisation&apos;s email address — the one on your website domain. That is what the
        platform verifies against.
      </p>

      <div className="mt-5 space-y-4">
        <div>
          <label className={label} htmlFor="ae">Ministry email</label>
          <input id="ae" type="email" required className={`${field} mt-1.5`} value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="you@yourministry.org" />
        </div>
        <div>
          <label className={label} htmlFor="aw">What are you helping build?</label>
          <textarea id="aw" rows={3} className={`${field} mt-1.5`} value={why}
            onChange={(e) => setWhy(e.target.value)}
            placeholder="Research panel · instrument · a pilot cluster · the platform · something else" />
          <p className="margin-note mt-1">Optional, but it is what gets a request approved quickly.</p>
        </div>
      </div>

      <button type="submit" disabled={busy}
        className="tabular mt-6 w-full border-2 border-ink bg-ink px-5 py-3 text-[11px] uppercase tracking-[0.14em] text-paper disabled:opacity-50">
        {busy ? "Sending…" : "Request access →"}
      </button>
      <p className="margin-note mt-3">
        Approved individually. We do not send anything else to this address.
      </p>
    </form>
  );
}
