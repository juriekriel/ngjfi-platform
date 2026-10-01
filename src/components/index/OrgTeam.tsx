"use client";

/**
 * Team & access — who can open this organisation's dashboard (migration 0043).
 *
 *   Org Administrator  exactly one. Adds and removes coordinators, hands the
 *                      role over, and is the only one who can change survey
 *                      settings, consent and branding.
 *   Coordinator        up to the platform's limit (5 by default, config).
 *                      Uses the dashboard as it is — results, rooms, links,
 *                      QR codes, exports, "What does this mean?".
 *
 * Every rule here is enforced in the database (org_team / org_add_coordinator
 * / org_remove_member / org_transfer_admin); this component only explains
 * them. Only adult staff appear here — never a respondent.
 */
import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendError } from "@/lib/authLinks";
import { TEAM_ROLE_LABEL, seatsLeft, type TeamRole } from "@/lib/team";

type Member = { email: string; role: TeamRole; since: string; is_me: boolean };
type Invite = { email: string; role: TeamRole; created_at: string };
type Team = {
  my_role: TeamRole | "administrator" | null;
  can_manage: boolean;
  coordinator_limit: number | null;
  coordinators_used: number;
  members: Member[];
  invites: Invite[];
};

const input = "min-w-0 flex-1 rounded-lg border border-rule-2 bg-plate px-3 py-2 text-[14px] text-ink";
const small = "rounded-md border border-rule-2 px-2.5 py-1 text-[12px] font-semibold text-ink hover:border-ink disabled:opacity-50";

export default function OrgTeam({ sb, orgSlug, orgName }: { sb: SupabaseClient; orgSlug: string; orgName: string }) {
  const [team, setTeam] = useState<Team | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmHandover, setConfirmHandover] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await sb.rpc("org_team", { p_org_slug: orgSlug });
    if (error) setErr(/org_team/.test(error.message) ? "Team access needs migration 0043, which isn't applied to this database yet." : error.message);
    else { setErr(null); setTeam(data as Team); }
  }, [sb, orgSlug]);
  useEffect(() => { load(); }, [load]);

  /** A sign-in link to the address — the invitation turns into access the moment they use it. */
  async function sendLink(to: string): Promise<string | null> {
    const { error } = await sb.auth.signInWithOtp({
      email: to,
      options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/${orgSlug}/dashboard` },
    });
    return error ? sendError(error) ?? error.message : null;
  }

  async function add() {
    const to = email.trim().toLowerCase();
    if (!to) return;
    setBusy(true); setErr(null); setMsg(null);
    const { data, error } = await sb.rpc("org_add_coordinator", { p_org_slug: orgSlug, p_email: to });
    if (error) { setBusy(false); setErr(error.message); return; }
    const attached = Boolean((data as { attached?: boolean })?.attached);
    const sendErr = await sendLink(to);
    setBusy(false);
    setEmail("");
    setMsg(
      sendErr
        ? `${to} is on your team, but the sign-in email didn't send (${sendErr}). They can sign in themselves at ${window.location.host}/${orgSlug}/dashboard with that address.`
        : attached
          ? `${to} has access now. We've emailed them a sign-in link.`
          : `${to} is invited. We've emailed them a sign-in link — access starts the moment they use it.`,
    );
    load();
  }

  async function remove(to: string, self: boolean) {
    setBusy(true); setErr(null); setMsg(null);
    const { error } = await sb.rpc("org_remove_member", { p_org_slug: orgSlug, p_email: to });
    setBusy(false);
    if (error) return setErr(error.message);
    if (self) { window.location.href = "/build"; return; }
    setMsg(`${to} no longer has access.`);
    load();
  }

  async function resend(to: string) {
    setBusy(true); setErr(null);
    const e = await sendLink(to);
    setBusy(false);
    if (e) setErr(e); else setMsg(`Sign-in link sent again to ${to}.`);
  }

  async function handover(to: string) {
    setBusy(true); setErr(null); setMsg(null);
    const { error } = await sb.rpc("org_transfer_admin", { p_org_slug: orgSlug, p_email: to });
    setBusy(false);
    setConfirmHandover(null);
    if (error) return setErr(error.message);
    setMsg(`${to} is now the Org Administrator. You stay on the team as a coordinator.`);
    load();
  }

  if (err && !team) return <p className="rounded-2xl border border-rule bg-plate p-5 text-[14px] text-vermillion">{err}</p>;
  if (!team) return <p className="rounded-2xl border border-rule bg-plate p-5 text-[14px] text-ink-2">Loading your team…</p>;

  const left = seatsLeft(team.coordinator_limit, team.coordinators_used);
  const admin = team.members.find((m) => m.role === "org_admin");

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <section className="flex flex-col gap-3 rounded-2xl border border-rule bg-plate p-5 shadow-sm lg:col-span-2">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">Who can open this dashboard</p>
          <h2 className="mt-0.5 text-[18px] font-bold tracking-tight">Team &amp; access</h2>
        </div>

        <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule">
          {team.members.map((m) => (
            <li key={m.email} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5">
              <span className="min-w-0 break-all text-[14px]">
                {m.email}
                {m.is_me && <span className="ml-1.5 text-ink-2">(you)</span>}
              </span>
              <span className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${m.role === "org_admin" ? "bg-violet/15 text-violet-deeper" : "bg-paper-deep text-ink"}`}>
                  {TEAM_ROLE_LABEL[m.role]}
                </span>
                {team.can_manage && m.role === "coordinator" && (
                  confirmHandover === m.email ? (
                    <>
                      <button disabled={busy} onClick={() => handover(m.email)} className={`${small} border-violet-deep`}>Yes, hand over</button>
                      <button onClick={() => setConfirmHandover(null)} className={small}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <button disabled={busy} onClick={() => setConfirmHandover(m.email)} className={small}>Make Org Administrator</button>
                      <button disabled={busy} onClick={() => remove(m.email, false)} className={`${small} hover:text-vermillion`}>Remove</button>
                    </>
                  )
                )}
                {!team.can_manage && m.is_me && m.role === "coordinator" && (
                  <button disabled={busy} onClick={() => remove(m.email, true)} className={small}>Leave</button>
                )}
              </span>
            </li>
          ))}
          {team.invites.map((i) => (
            <li key={i.email} className="flex flex-wrap items-center justify-between gap-2 bg-paper-deep/50 px-3.5 py-2.5">
              <span className="min-w-0 break-all text-[14px] text-ink-2">{i.email}</span>
              <span className="flex items-center gap-2">
                <span className="rounded-full border border-dashed border-rule-2 px-2.5 py-0.5 text-[12px] font-semibold text-ink-2">
                  Invited · {TEAM_ROLE_LABEL[i.role]}
                </span>
                {team.can_manage && (
                  <>
                    <button disabled={busy} onClick={() => resend(i.email)} className={small}>Resend link</button>
                    <button disabled={busy} onClick={() => remove(i.email, false)} className={`${small} hover:text-vermillion`}>Cancel invite</button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>

        {confirmHandover && (
          <p className="rounded-lg border border-violet/40 bg-violet/5 px-3 py-2 text-[13px] leading-relaxed text-ink-2">
            Handing over makes <b className="text-ink">{confirmHandover}</b> the one Org Administrator for {orgName}. You keep
            dashboard access as a coordinator, but you won&apos;t be able to change settings, consent or the team any more.
          </p>
        )}

        {team.can_manage ? (
          <div className="flex flex-col gap-2">
            <label htmlFor="team-email" className="font-mono text-[10.5px] uppercase tracking-wider text-ink-2">
              Add a coordinator by email
              {left != null && ` · ${left} of ${team.coordinator_limit} places left`}
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                id="team-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
                placeholder="colleague@example.org"
                disabled={busy || left === 0}
                className={input}
              />
              <button
                onClick={add}
                disabled={busy || !email.trim() || left === 0}
                className="rounded-lg bg-gradient-to-r from-violet via-violet-deep to-violet-deeper px-4 py-2.5 text-[14px] font-semibold text-plate disabled:opacity-50"
              >
                {busy ? "Adding…" : "Add & send link"}
              </button>
            </div>
            {left === 0 && <p className="text-[13px] text-ink-2">Your team is full. Remove a coordinator or cancel an invitation to add someone else.</p>}
          </div>
        ) : (
          <p className="rounded-xl bg-paper-deep px-4 py-3 text-[13.5px] text-ink-2">
            {admin ? <><b className="text-ink">{admin.email}</b> manages who has access. </> : "Your Org Administrator manages who has access. "}
            Ask them to add a colleague.
          </p>
        )}

        {msg && <p className="text-[13px] text-ink-2">{msg}</p>}
        {err && <p className="text-[13px] text-vermillion">{err}</p>}
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-rule bg-plate p-5 shadow-sm">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">How access works</p>
          <h2 className="mt-0.5 text-[18px] font-bold tracking-tight">Three tiers</h2>
        </div>
        <dl className="flex flex-col gap-2.5 text-[13.5px] leading-relaxed">
          <div>
            <dt className="font-semibold">Org Administrator · one</dt>
            <dd className="text-ink-2">Everything coordinators can do, plus survey settings, consent, your look, and this team. Hand it over here — it&apos;s never left empty.</dd>
          </div>
          <div>
            <dt className="font-semibold">Coordinator · up to {team.coordinator_limit ?? "any number in the sandbox"}</dt>
            <dd className="text-ink-2">Sees the dashboard as it is: results, rooms, links and QR codes, exports, and &ldquo;What does this mean?&rdquo;.</dd>
          </div>
          <div>
            <dt className="font-semibold">Respondents</dt>
            <dd className="text-ink-2">Never have an account. They answer anonymously, and nobody on this team can see an individual&apos;s answers.</dd>
          </div>
        </dl>
        <p className="text-[12.5px] leading-relaxed text-ink-2">
          A coordinator signs in with the exact address you add — any address works, including a personal one. Every change
          here is recorded.
        </p>
      </section>
    </div>
  );
}
