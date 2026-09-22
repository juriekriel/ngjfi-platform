"use client";

import { useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";

/**
 * Two tracks, by choice.
 *
 * Express is three fields and about thirty seconds — nobody is lost to a long
 * form. "Shape it" is optional and offered immediately afterwards; completing it
 * is not a hurdle, it is the only way we can place an organisation in a country
 * cluster, and the reward for doing so is stated plainly rather than dangled.
 *
 * The two highest-value fields on the whole site are the last two free-text
 * ones. They are pre-launch research, and they are read by the researchers.
 */

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
  const [measuresToday, setMeasuresToday] = useState("");
  const [decision, setDecision] = useState("");
  const [wantsCall, setWantsCall] = useState("");
  const [collabMember, setCollabMember] = useState("");
  const [consent, setConsent] = useState(true);

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
    try {
      const { error } = await sb.rpc("waitlist_join", {
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
    } catch {
      // A thrown network error behaves the same as an RPC error above — never
      // silently advance to the next stage on a failure we didn't see coming.
      setBusy(false);
      setError("We could not reach the server just now. Check your connection and try again.");
      return;
    }
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
          measures_today: measuresToday.trim() || null,
          decision_it_changes: decision.trim() || null,
          wants_setup_call: wantsCall === "yes" ? true : wantsCall === "no" ? false : null,
          is_collab_member: collabMember === "yes" ? true : collabMember === "no" ? false : null,
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
    setBusy(false);
    setStage("done");
  }

  const field =
    "w-full border border-rule bg-plate px-3 py-2 text-[15px] text-ink outline-none focus:border-ink";
  const label = "tabular block text-[10px] uppercase tracking-[0.14em] text-ink-2";

  if (stage === "done")
    return (
      <div className="rounded-xl border-2 border-ink p-6">
        <p className="figcap">You are on the list</p>
        <h2 className="mt-3 text-[26px] leading-tight">Thank you — that helps more than you think.</h2>
        <p className="mt-4 text-[16px] leading-relaxed text-ink-2">
          Once a month you will get <b>Field Notes</b>: what we decided, what broke, and what we still
          have not figured out. When your country&apos;s round opens, you will be among the first to
          know.
        </p>
        <p className="mt-4 text-[16px] leading-relaxed text-ink-2">
          If you told us where you work, we will place you in a cluster. If you did not, we will come
          back and ask — we genuinely cannot do it without that.
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
        <p className="figcap">Optional · about three minutes</p>
        <h2 className="mt-3 text-[24px] leading-tight">Want to be in the first round?</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
          Seven more questions. We are not collecting these to score you — we genuinely cannot place
          you in a country round without knowing where you work, and we cannot tell you what the
          dashboard should show without knowing what decision you would make with it.
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
            <label className={label} htmlFor="measures">How do you measure discipleship today?</label>
            <textarea id="measures" rows={3} className={`${field} mt-1.5`} value={measuresToday}
              onChange={(e) => setMeasuresToday(e.target.value)} />
          </div>
          <div>
            <label className={label} htmlFor="decision">
              If you had this score tomorrow, what decision would it change?
            </label>
            <textarea id="decision" rows={3} className={`${field} mt-1.5`} value={decision}
              onChange={(e) => setDecision(e.target.value)} />
            <p className="margin-note mt-1">
              The most useful field on this site. It is read by the researchers, not the growth side.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="call">Would you join a 30-minute setup call?</label>
              <select id="call" className={`${field} mt-1.5`} value={wantsCall} onChange={(e) => setWantsCall(e.target.value)}>
                <option value="">—</option><option value="yes">Yes</option>
                <option value="maybe">Maybe</option><option value="no">No</option>
              </select>
            </div>
            <div>
              <label className={label} htmlFor="collab">Are you part of the Collab?</label>
              <select id="collab" className={`${field} mt-1.5`} value={collabMember} onChange={(e) => setCollabMember(e.target.value)}>
                <option value="">—</option><option value="yes">Yes</option>
                <option value="no">No</option><option value="unsure">Not sure</option>
              </select>
            </div>
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
      <h2 className="mt-3 text-[24px] leading-tight">Join the first round</h2>

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
        <label className="flex items-start gap-2.5 text-[14px] leading-snug text-ink-2">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}
            className="mt-1 h-3.5 w-3.5 shrink-0 accent-emerald" />
          <span>Send me <b>Field Notes</b> — a monthly note on how the Index is being built. Unsubscribe any time.</span>
        </label>
      </div>

      {error && <p className="mt-4 text-[14px] leading-snug text-vermillion">{error}</p>}

      <button type="submit" disabled={busy}
        className="mt-6 w-full rounded-lg border-2 border-emerald bg-emerald px-5 py-3 text-[14px] font-semibold text-plate disabled:opacity-50">
        {busy ? "Saving…" : "Join the first round →"}
      </button>
      <p className="margin-note mt-3">
        For organisations and churches. No obligation. We will ask a few optional questions next —
        they are what let us place you in a country cluster.
      </p>
    </form>
  );
}
