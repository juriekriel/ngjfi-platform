// Destination in the repo: src/app/join/JoinForm.tsx (replaces the existing file)
// Only change from the current version: submitExpress() now fires a
// best-effort call to /api/waitlist-notify after a successful waitlist_join()
// RPC, so the signee gets a confirmation email and the team gets a heads-up.
// It never blocks or fails the signup UI — see route.ts's own comment.
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";

/**
 * Two tracks, by choice.
 *
 * Express is three fields and about thirty seconds — nobody is lost to a long
 * form. "Shape it" is optional and offered immediately AFTER signup (Miguel,
 * Oct 2026: the decision and Collab questions never stand between someone and
 * joining). The Index is available now, so the confirmation is "You're in",
 * with next steps — not a place in a queue.
 *
 * "Shape it" is four optional questions: where, how many, which languages,
 * and whether they'd like a 30-minute setup call (Oct 2026: the discipleship,
 * decision and Collab questions were retired). A yes or maybe is listed for
 * administrators in the console (Setup calls, migration 0055) and emails the
 * team at once.
 */

/** A real contact for the "You're in" screen; unset → "reply to the welcome email". */
const CONTACT = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "";

const REACH_BANDS = ["Under 100", "100–500", "500–2,000", "2,000–10,000", "10,000+"];

export default function JoinForm() {
  const sb = useMemo(() => getSupabaseBrowser(), []);
  const [stage, setStage] = useState<"express" | "shape" | "done">("express");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shapeError, setShapeError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [org, setOrg] = useState("");
  const [role, setRole] = useState("");

  const [countries, setCountries] = useState("");
  const [reach, setReach] = useState("");
  const [languages, setLanguages] = useState("");
  const [wantsCall, setWantsCall] = useState("");
  // The monthly newsletter opt-in is retired (Oct 2026): nobody is signed up to updates.
  const consent = false;

  async function submitExpress(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    if (!sb) {
      // Supabase isn't configured in this environment — this must be visible,
      // never a silent "success" that leaves the visitor believing they're on
      // the list when nothing was ever attempted.
      setBusy(false);
      setError("Sign-up isn't wired up in this environment yet — nothing was saved. Please email us directly.");
      return;
    }
    let referralCode: string | null = null;
    try {
      const { data, error } = await sb.rpc("waitlist_join", {
        p_email: email.trim(),
        p_org_name: org.trim(),
        p_role: role.trim(),
        p_consent: consent,
      });
      if (error) {
        setBusy(false);
        setError(
          "We could not record that just now. The list is still being wired up — try again shortly, or email us directly.",
        );
        return;
      }
      referralCode = typeof data === "string" ? data : null;
    } catch {
      // A thrown network error behaves the same as an RPC error above — never
      // silently advance to the next stage on a failure we didn't see coming.
      setBusy(false);
      setError("We could not reach the server just now. Check your connection and try again.");
      return;
    }

    // Best-effort confirmation + internal notification email. The signup is
    // already committed above — a failure or timeout here must never block
    // advancing to the next stage or be shown as an error to the visitor.
    fetch("/api/waitlist-notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.trim(),
        orgName: org.trim(),
        role: role.trim(),
        referralCode,
      }),
    }).catch(() => {});

    setBusy(false);
    setStage("shape");
  }

  async function submitShape(e: React.FormEvent) {
    e.preventDefault();
    setShapeError(null);
    setBusy(true);
    if (!sb) {
      setBusy(false);
      setShapeError("This part isn't wired up in this environment yet — nothing extra was saved, but you're already on the list.");
      return;
    }
    try {
      const { error } = await sb.rpc("waitlist_qualify", {
        p_email: email.trim(),
        p_payload: {
          countries: countries.split(",").map((s) => s.trim()).filter(Boolean),
          reach_band: reach || null,
          languages: languages.split(",").map((s) => s.trim()).filter(Boolean),
          // yes / maybe / no, kept as said (0055) — "maybe" used to be lost.
          setup_call: wantsCall || null,
          // Older databases (before 0055) only know the boolean.
          wants_setup_call: wantsCall === "yes" ? true : wantsCall === "no" ? false : null,
        },
      });
      // This track was silently discarded on failure before — the two most
      // useful free-text fields on the whole site (measures_today,
      // decision_it_changes) were lost with no sign anything went wrong.
      // Surface it instead, and let the visitor retry rather than lose it.
      if (error) {
        setBusy(false);
        setShapeError(
          "We could not save that just now — your spot on the list is safe, but these answers weren't recorded. Try again, or skip for now.",
        );
        return;
      }
    } catch {
      setBusy(false);
      setShapeError("We could not reach the server just now. Try again, or skip for now.");
      return;
    }
    // A yes (or maybe) to the setup call tells the team straight away, so
    // someone can email to book it. Best effort, like the welcome email: the
    // answer is already saved and listed in the admin console (Setup calls).
    if (wantsCall === "yes" || wantsCall === "maybe") {
      fetch("/api/waitlist-notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "setup_call", email: email.trim(), orgName: org.trim(), role: role.trim(), setupCall: wantsCall, countries, reach }),
      }).catch(() => {});
    }
    setBusy(false);
    setStage("done");
  }

  const field =
    "w-full border border-rule bg-plate px-3 py-2 text-[15px] text-ink outline-none focus:border-ink";
  const label = "tabular block text-[10px] uppercase tracking-[0.14em] text-ink-2";

  if (stage === "done")
    return (
      <div className="rounded-xl border-2 border-ink p-6">
        <p className="figcap">Welcome</p>
        <span aria-hidden className="mt-3 block h-1 rounded-full bg-gradient-to-r from-emerald via-emerald-deep to-violet" />
        <h2 className="mt-3 text-[28px] font-bold leading-tight tracking-tight">You&apos;re in{org.trim() ? `, ${org.trim()}` : ""}.</h2>
        <span aria-hidden className="mt-3 block h-1 rounded-full bg-gradient-to-r from-emerald via-emerald-deep to-violet" />
        <p className="mt-3 text-[16px] leading-relaxed text-ink-2">Here&apos;s what happens next:</p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-[15.5px] leading-relaxed text-ink-2">
          <li>
            <Link href="/access" className="font-semibold text-ink underline underline-offset-2">Sign in</Link>{" "}
            with your ministry email to set up your page — your logo, colour and welcome.
          </li>
          <li>Try your survey with a test link. Answers on a test link are never kept.</li>
          <li>
            Read the{" "}
            <Link href="/resources/consent" className="font-semibold text-ink underline underline-offset-2">consent resource</Link>{" "}
            and confirm consent — for your organisation, and for each survey you send.
          </li>
          <li>We&apos;ll email you the day live answers start recording, when the pilots open.</li>
          {wantsCall === "yes" || wantsCall === "maybe" ? <li>You asked about a setup call — we&apos;ll email you to find a time.</li> : null}
        </ol>
        <p className="mt-4 text-[15px] leading-relaxed text-ink-2">
          Questions? {CONTACT ? <>Write to <a href={`mailto:${CONTACT}`} className="font-semibold text-ink underline underline-offset-2">{CONTACT}</a>.</> : "Reply to the welcome email — a person reads it."}
        </p>
        <p className="margin-note mt-5 border-l-2 border-emerald pl-3">
          Nothing on this list is ever joined to respondent data. Respondents are anonymous; this is a
          contact list for adults at organisations. Those two things live apart by design.
        </p>
      </div>
    );

  if (stage === "shape")
    return (
      <form onSubmit={submitShape} className="rounded-xl border-2 border-ink p-6">
        <p className="figcap">Optional · about a minute</p>
        <p className="figcap mt-1 text-emerald">You&apos;re in — this part is optional</p>
        <h2 className="mt-3 text-[24px] leading-tight">Help us set you up</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
          Four questions, all optional. Where you work tells us when your city and country comparisons
          can open, and a setup call gets your team reading results with a person beside them.
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <label className={label} htmlFor="countries">Which country or countries do you work in?</label>
            <input id="countries" className={`${field} mt-1.5`} value={countries}
              onChange={(e) => setCountries(e.target.value)} placeholder="Argentina, Uruguay" />
          </div>
          <div>
            <label className={label} htmlFor="reach">
              Roughly how many different 13–30-year-olds are part of your programs in a year?
            </label>
            <select id="reach" className={`${field} mt-1.5`} value={reach} onChange={(e) => setReach(e.target.value)}>
              <option value="">Select a band</option>
              {REACH_BANDS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
            <p className="margin-note mt-1">
              A rough headcount of people, not events or attendances — your best estimate is fine.
            </p>
          </div>
          <div>
            <label className={label} htmlFor="langs">What languages would you need?</label>
            <input id="langs" className={`${field} mt-1.5`} value={languages}
              onChange={(e) => setLanguages(e.target.value)} placeholder="Spanish, Guaraní" />
          </div>
          <div>
            <label className={label} htmlFor="call">Would you like a 30-minute setup call?</label>
            <select id="call" className={`${field} mt-1.5`} value={wantsCall} onChange={(e) => setWantsCall(e.target.value)}>
              <option value="">—</option><option value="yes">Yes</option>
              <option value="maybe">Maybe</option><option value="no">No</option>
            </select>
            <p className="margin-note mt-1">Say yes and a person will email you to find a time.</p>
          </div>
        </div>

        {shapeError && <p className="mt-4 text-[14px] leading-snug text-vermillion">{shapeError}</p>}

        <div className="mt-6 flex flex-wrap gap-3">
          <button type="submit" disabled={busy}
            className="rounded-lg border-2 border-emerald bg-emerald px-5 py-2.5 text-[14px] font-semibold text-plate disabled:opacity-50">
            {busy ? "Saving…" : "Send it →"}
          </button>
          <button type="button" onClick={() => setStage("done")}
            className="rounded-lg border border-rule px-5 py-2.5 text-[14px] font-semibold text-ink-2 hover:border-ink hover:text-ink">
            Skip this
          </button>
        </div>
        <p className="margin-note mt-3">Skip it if you would rather. You will still hear from us.</p>
      </form>
    );

  return (
    <form onSubmit={submitExpress} className="rounded-xl border-2 border-ink p-6">
      <p className="figcap">Three fields · about thirty seconds</p>
      <h2 className="mt-3 text-[24px] leading-tight">Join the JFINDX — free</h2>

      <div className="mt-5 space-y-4">
        <div>
          <label className={label} htmlFor="email">Work email</label>
          <input id="email" type="email" required className={`${field} mt-1.5`} value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="you@yourministry.org" />
        </div>
        <div>
          <label className={label} htmlFor="org">Organisation, church or ministry name</label>
          <input id="org" required className={`${field} mt-1.5`} value={org} onChange={(e) => setOrg(e.target.value)}
            placeholder="e.g. Riverside Youth, First Baptist Dallas, Young Life Argentina" />
          <p className="margin-note mt-1">
            Whatever you&apos;d call it — a local church, a youth ministry, a network, an NGO. No
            wrong answer here.
          </p>
        </div>
        <div>
          <label className={label} htmlFor="role">Your role</label>
          <input id="role" required className={`${field} mt-1.5`} value={role} onChange={(e) => setRole(e.target.value)} />
        </div>
      </div>

      {error && <p className="mt-4 text-[14px] leading-snug text-vermillion">{error}</p>}

      <button type="submit" disabled={busy}
        className="mt-6 w-full rounded-lg border-2 border-emerald bg-emerald px-5 py-3 text-[14px] font-semibold text-plate disabled:opacity-50">
        {busy ? "Saving…" : "Join now →"}
      </button>
      <p className="margin-note mt-3">
        Free for ministries, and it stays free. No obligation. A few optional questions come next —
        they help us set you up.
      </p>
    </form>
  );
}
