"use client";

/**
 * Onboarding — how an organisation comes into existence and how a person is
 * attached to one (migration 0034).
 *
 *   ApplicationsBand   admin: "Join the JFINDX" applications, access
 *                      requests and self-serve organisations awaiting
 *                      activation, in one list — each turns into an
 *                      organisation with one action.
 *   CreateOrgForm      admin: organisation + survey + owner invitation.
 *   OrgManagePanel     admin: edit an organisation's details and its team.
 *   NoHouse            anyone signed in with no organisation: what they can
 *                      do next — join by email domain, see their
 *                      application, or set their ministry up themselves.
 *
 * Every write here goes through an RPC that checks the caller's tier (or,
 * for self-serve, their own verified email) in the database. Only adult
 * staff contact details are handled; nothing touches respondents.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import { Action, Band, Row, Rows } from "@/components/console/Bands";
import ResponseDeletion from "@/components/console/ResponseDeletion";

type JoinApp = {
  id: string; email: string; org_name: string; role: string; country: string | null;
  countries: string[] | null; reach_band: string | null; languages: string[] | null;
  decision_it_changes: string | null; wants_setup_call: boolean | null; is_collab_member: boolean | null;
  status: string; created_at: string;
};
type AccessReq = { id: string; email: string; reason: string | null; created_at: string };
type PendingOrg = { short_name: string; name: string; website_domain: string | null; country: string | null; created_at: string; members: string[] | null };
type Apps = { join: JoinApp[]; access: AccessReq[]; pending_orgs: PendingOrg[] };

/** A short-name suggestion from a display name: "Shoreline Church" → "shoreline-church". */
export function suggestShortName(name: string): string {
  const s = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/g, "");
  return /^[a-z]/.test(s) ? s : s ? `o-${s}`.slice(0, 32) : "";
}

const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/* ── admin: the applications queue ───────────────────────────────────── */

export function useApplications() {
  const sb = useMemo(() => getSupabaseBrowser(), []);
  const [apps, setApps] = useState<Apps | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!sb) return;
    const { data, error } = await sb.rpc("admin_applications");
    if (error)
      setErr(/admin_applications/.test(error.message) ? "Applications need migration 0034, which isn't applied to this database yet." : error.message);
    else {
      setErr(null);
      setApps(data as Apps);
    }
  }, [sb]);
  useEffect(() => {
    load();
  }, [load]);
  const count = apps ? apps.join.length + apps.access.length + apps.pending_orgs.length : null;
  return { apps, err, load, count };
}

export function ApplicationsBand({
  apps,
  err,
  load,
  onChanged,
}: ReturnType<typeof useApplications> & { onChanged: () => void }) {
  const sb = useMemo(() => getSupabaseBrowser(), []);
  const [creating, setCreating] = useState<{ kind: "join" | "access" | "new"; id?: string; name: string; email: string; country: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function decline(kind: "join" | "access", id: string) {
    if (!sb) return;
    const { error } = await sb.rpc("admin_decline_application", { p_kind: kind, p_id: id });
    if (error) setMsg(error.message);
    else load();
  }
  async function activate(short: string) {
    if (!sb) return;
    const { error } = await sb.rpc("set_org_status", { p_short_name: short, p_status: "active" });
    if (error) setMsg(error.message);
    else {
      setMsg(`${short} is now active and can collect responses.`);
      load();
      onChanged();
    }
  }

  return (
    <Band
      letter="A"
      title="Applications"
      gloss="Everyone who has asked to come in — through “Join the JFINDX”, an access request, or by setting their ministry up themselves. Each becomes a working organisation with one action."
      figure={apps ? `${apps.join.length + apps.access.length + apps.pending_orgs.length} waiting` : "…"}
    >
      {err && <p className="text-[13px] text-vermillion">{err}</p>}
      {msg && <p className="mb-3 text-[13.5px] text-ink-2">{msg}</p>}

      {creating ? (
        <CreateOrgForm
          initial={creating}
          onCancel={() => setCreating(null)}
          onCreated={(r) => {
            setCreating(null);
            setMsg(
              r.attached
                ? `Created ${r.short_name}. ${r.email} already had an account and is attached now.`
                : `Created ${r.short_name}. ${r.email} is invited — they'll be attached the first time they sign in.`,
            );
            load();
            onChanged();
          }}
        />
      ) : (
        <div className="mb-4">
          <Action primary onClick={() => setCreating({ kind: "new", name: "", email: "", country: "" })}>
            + Add an organisation
          </Action>
        </div>
      )}

      {apps && !creating && (
        <div className="space-y-6">
          <section>
            <p className="figcap">Waiting for activation · set up themselves</p>
            {apps.pending_orgs.length ? (
              <Rows>
                {apps.pending_orgs.map((o) => (
                  <Row key={o.short_name} tone="warn" label={<><b>{o.name}</b> <span className="text-ink-2">· {o.website_domain ?? "no domain"}{o.country ? ` · ${o.country}` : ""}</span></>} meta={(o.members ?? []).join(", ")}>
                    <span className="flex gap-2">
                      <a href={`/${o.short_name}/dashboard`} className="rounded-md border border-rule-2 px-2.5 py-1 text-[12.5px] font-semibold text-ink-2 no-underline hover:border-ink hover:text-ink">Look</a>
                      <button onClick={() => activate(o.short_name)} className="rounded-md bg-emerald px-2.5 py-1 text-[12.5px] font-semibold text-plate hover:bg-emerald-deep">Activate</button>
                    </span>
                  </Row>
                ))}
              </Rows>
            ) : (
              <p className="mt-1 text-[14px] text-ink-2">None.</p>
            )}
          </section>

          <section>
            <p className="figcap">Join the JFINDX · applications</p>
            {apps.join.length ? (
              <Rows>
                {apps.join.map((a) => (
                  <Row
                    key={a.id}
                    label={
                      <>
                        <b>{a.org_name}</b> <span className="text-ink-2">· {a.role} · {a.email}</span>
                        <span className="mt-0.5 block text-[12.5px] text-ink-2">
                          {[a.country, a.reach_band, a.languages?.join("/"), a.is_collab_member ? "Collab member" : null, a.wants_setup_call ? "wants a setup call" : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        {a.decision_it_changes && <span className="mt-0.5 block text-[12.5px] italic text-ink-2">“{a.decision_it_changes}”</span>}
                      </>
                    }
                    meta={when(a.created_at)}
                  >
                    <span className="flex gap-2">
                      <button onClick={() => setCreating({ kind: "join", id: a.id, name: a.org_name, email: a.email, country: a.country ?? "" })} className="rounded-md bg-emerald px-2.5 py-1 text-[12.5px] font-semibold text-plate hover:bg-emerald-deep">Create organisation</button>
                      <button onClick={() => decline("join", a.id)} className="rounded-md border border-rule-2 px-2.5 py-1 text-[12.5px] font-semibold text-ink-2 hover:border-ink hover:text-ink">Decline</button>
                    </span>
                  </Row>
                ))}
              </Rows>
            ) : (
              <p className="mt-1 text-[14px] text-ink-2">None.</p>
            )}
          </section>

          <section>
            <p className="figcap">Access requests</p>
            {apps.access.length ? (
              <Rows>
                {apps.access.map((a) => (
                  <Row key={a.id} label={<><b>{a.email}</b>{a.reason && <span className="mt-0.5 block text-[12.5px] text-ink-2">{a.reason}</span>}</>} meta={when(a.created_at)}>
                    <span className="flex gap-2">
                      <button onClick={() => setCreating({ kind: "access", id: a.id, name: "", email: a.email, country: "" })} className="rounded-md bg-emerald px-2.5 py-1 text-[12.5px] font-semibold text-plate hover:bg-emerald-deep">Create organisation</button>
                      <button onClick={() => decline("access", a.id)} className="rounded-md border border-rule-2 px-2.5 py-1 text-[12.5px] font-semibold text-ink-2 hover:border-ink hover:text-ink">Decline</button>
                    </span>
                  </Row>
                ))}
              </Rows>
            ) : (
              <p className="mt-1 text-[14px] text-ink-2">None.</p>
            )}
            <p className="mt-2 text-[12.5px] text-ink-2">
              To attach a requester to an organisation that already exists, open it under “The roll” and add them to its team.
            </p>
          </section>
        </div>
      )}
    </Band>
  );
}

export function CreateOrgForm({
  initial,
  onCancel,
  onCreated,
}: {
  initial: { kind: "join" | "access" | "new"; id?: string; name: string; email: string; country: string };
  onCancel: () => void;
  onCreated: (r: { short_name: string; email: string; attached: boolean }) => void;
}) {
  const sb = useMemo(() => getSupabaseBrowser(), []);
  const [name, setName] = useState(initial.name);
  const [short, setShort] = useState(suggestShortName(initial.name));
  const [shortTouched, setShortTouched] = useState(false);
  const [email, setEmail] = useState(initial.email);
  const [domain, setDomain] = useState(initial.email.includes("@") ? initial.email.split("@")[1] : "");
  const [country, setCountry] = useState(initial.country);
  const [status, setStatus] = useState<"active" | "pending">("active");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!sb) return;
    setBusy(true);
    setErr(null);
    const { data, error } = await sb.rpc("admin_create_org", {
      p_name: name,
      p_short_name: short,
      p_owner_email: email,
      p_website_domain: domain || null,
      p_country: country || null,
      p_status: status,
      p_waitlist_id: initial.kind === "join" ? initial.id : null,
      p_access_id: initial.kind === "access" ? initial.id : null,
    });
    setBusy(false);
    if (error) setErr(error.message);
    else {
      const r = data as { short_name: string; owner: { email: string; attached: boolean } };
      onCreated({ short_name: r.short_name, email: r.owner.email, attached: r.owner.attached });
    }
  }

  return (
    <form onSubmit={submit} className="mb-6 rounded-xl border-2 border-ink bg-plate p-4 sm:p-5">
      <p className="text-[16px] font-semibold">New organisation</p>
      <p className="mt-1 text-[13px] text-ink-2">Creates the organisation, an active survey on the current instrument, and invites the owner.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Organisation name">
          <input required value={name} onChange={(e) => { setName(e.target.value); if (!shortTouched) setShort(suggestShortName(e.target.value)); }} className="w-full rounded-lg border border-rule-2 px-3 py-2 text-[14px]" />
        </Field>
        <Field label="Short name · its survey link, printed on QR cards — can't be changed later">
          <input required value={short} onChange={(e) => { setShortTouched(true); setShort(e.target.value.toLowerCase()); }} pattern="[a-z][a-z0-9-]{1,31}" className="w-full rounded-lg border border-rule-2 px-3 py-2 font-mono text-[14px]" />
        </Field>
        <Field label="Owner's email · invited as organisation admin">
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg border border-rule-2 px-3 py-2 text-[14px]" />
        </Field>
        <Field label="Website domain · lets colleagues join by email domain">
          <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="shoreline.org" className="w-full rounded-lg border border-rule-2 px-3 py-2 text-[14px]" />
        </Field>
        <Field label="Country">
          <input value={country} onChange={(e) => setCountry(e.target.value)} className="w-full rounded-lg border border-rule-2 px-3 py-2 text-[14px]" />
        </Field>
        <Field label="Starts">
          <select value={status} onChange={(e) => setStatus(e.target.value as "active" | "pending")} className="w-full rounded-lg border border-rule-2 bg-plate px-3 py-2 text-[14px]">
            <option value="active">Active — can collect responses now</option>
            <option value="pending">Pending — can set up, not collect yet</option>
          </select>
        </Field>
      </div>
      <p className="mt-3 font-mono text-[12px] text-ink-2">jfindx.org/{short || "…"}</p>
      {err && <p className="mt-2 text-[13px] text-vermillion">{err}</p>}
      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={busy} className="rounded-lg bg-emerald px-4 py-2.5 text-[14px] font-semibold text-plate hover:bg-emerald-deep disabled:opacity-50">
          {busy ? "Creating…" : "Create organisation"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-rule-2 px-4 py-2.5 text-[14px] font-semibold text-ink hover:border-ink">Cancel</button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[10.5px] uppercase tracking-wider text-ink-2">{label}</span>
      {children}
    </label>
  );
}

/* ── admin: edit one organisation and its team ───────────────────────── */

type OrgRow = {
  name: string; website_domain: string | null; country: string | null; region: string | null;
  brand_color: string | null; logo_url: string | null; welcome_message: string | null; closing_message: string | null;
  membership_tier: string | null;
};
type Team = { members: { email: string; role: string; status: string }[]; invites: { email: string; role: string }[] };

export function OrgManagePanel({ shortName, onChanged }: { shortName: string; onChanged?: () => void }) {
  const sb = useMemo(() => getSupabaseBrowser(), []);
  const [row, setRow] = useState<OrgRow | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<"org_admin" | "facilitator">("org_admin");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sb) return;
    const [o, t] = await Promise.all([
      sb.from("organisations").select("name,website_domain,country,region,brand_color,logo_url,welcome_message,closing_message,membership_tier").eq("short_name", shortName).maybeSingle(),
      sb.rpc("admin_org_members", { p_short_name: shortName }),
    ]);
    if (o.data) setRow(o.data as OrgRow);
    if (t.error) setErr(t.error.message);
    else setTeam(t.data as Team);
  }, [sb, shortName]);

  useEffect(() => {
    load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!sb || !row) return;
    setErr(null);
    const { error } = await sb.rpc("admin_update_org", { p_short_name: shortName, p_patch: row });
    if (error) setErr(error.message);
    else {
      setMsg("Saved.");
      onChanged?.();
    }
  }
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!sb || !newEmail.trim()) return;
    setErr(null);
    const { data, error } = await sb.rpc("admin_add_member", { p_short_name: shortName, p_email: newEmail.trim(), p_role: newRole });
    if (error) setErr(error.message);
    else {
      const r = data as { email: string; attached: boolean };
      setMsg(r.attached ? `${r.email} is on the team now.` : `${r.email} is invited — attached the first time they sign in.`);
      setNewEmail("");
      load();
    }
  }
  async function remove(email: string) {
    if (!sb) return;
    const { error } = await sb.rpc("admin_remove_member", { p_short_name: shortName, p_email: email });
    if (error) setErr(error.message);
    else load();
  }

  const set = (k: keyof OrgRow) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setRow((r) => (r ? { ...r, [k]: e.target.value } : r));

  return (
    <div className="mt-4 grid gap-6 lg:grid-cols-2">
      <form onSubmit={save} className="rounded-xl border border-rule bg-plate p-4">
        <p className="figcap">Details</p>
        {!row ? (
          <p className="mt-2 text-[13px] text-muted">Loading…</p>
        ) : (
          <div className="mt-2 grid gap-3">
            <Field label="Name"><input value={row.name ?? ""} onChange={set("name")} className="rounded-lg border border-rule-2 px-3 py-2 text-[14px]" /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Website domain"><input value={row.website_domain ?? ""} onChange={set("website_domain")} className="rounded-lg border border-rule-2 px-3 py-2 text-[14px]" /></Field>
              <Field label="Country"><input value={row.country ?? ""} onChange={set("country")} className="rounded-lg border border-rule-2 px-3 py-2 text-[14px]" /></Field>
              <Field label="Brand colour"><input value={row.brand_color ?? ""} onChange={set("brand_color")} placeholder="#1f5f8b" className="rounded-lg border border-rule-2 px-3 py-2 font-mono text-[14px]" /></Field>
              <Field label="Collab membership">
                <select value={row.membership_tier ?? "external"} onChange={set("membership_tier")} className="rounded-lg border border-rule-2 bg-plate px-3 py-2 text-[14px]">
                  <option value="collab_member">Collab member</option>
                  <option value="external">External</option>
                </select>
              </Field>
            </div>
            <Field label="Logo URL"><input value={row.logo_url ?? ""} onChange={set("logo_url")} className="rounded-lg border border-rule-2 px-3 py-2 text-[14px]" /></Field>
            <Field label="Welcome message"><textarea rows={2} value={row.welcome_message ?? ""} onChange={set("welcome_message")} className="rounded-lg border border-rule-2 px-3 py-2 text-[14px]" /></Field>
            <Field label="Closing message"><textarea rows={2} value={row.closing_message ?? ""} onChange={set("closing_message")} className="rounded-lg border border-rule-2 px-3 py-2 text-[14px]" /></Field>
            <div><Action primary>Save details</Action></div>
          </div>
        )}
      </form>

      <div className="rounded-xl border border-rule bg-plate p-4">
        <p className="figcap">Team · who can open this organisation&apos;s dashboard</p>
        {!team ? (
          <p className="mt-2 text-[13px] text-muted">Loading…</p>
        ) : (
          <ul className="mt-2 divide-y divide-rule">
            {team.members.map((m) => (
              <li key={m.email} className="flex items-center justify-between gap-3 py-2.5 text-[14px]">
                <span className="min-w-0 break-all">{m.email}<span className="ml-2 font-mono text-[11px] text-ink-2">{m.role === "facilitator" ? "facilitator" : "admin"}</span></span>
                <button onClick={() => remove(m.email)} className="shrink-0 rounded-md border border-rule-2 px-2.5 py-1 text-[12px] font-semibold text-ink-2 hover:border-vermillion hover:text-vermillion">Remove</button>
              </li>
            ))}
            {team.invites.map((i) => (
              <li key={i.email} className="flex items-center justify-between gap-3 py-2.5 text-[14px]">
                <span className="min-w-0 break-all text-ink-2">{i.email}<span className="ml-2 font-mono text-[11px]">invited · not signed in yet</span></span>
                <button onClick={() => remove(i.email)} className="shrink-0 rounded-md border border-rule-2 px-2.5 py-1 text-[12px] font-semibold text-ink-2 hover:border-vermillion hover:text-vermillion">Cancel</button>
              </li>
            ))}
            {team.members.length + team.invites.length === 0 && <li className="py-2.5 text-[14px] text-ink-2">Nobody yet.</li>}
          </ul>
        )}
        <form onSubmit={add} className="mt-3 flex flex-wrap gap-2">
          <label className="sr-only" htmlFor={`add-${shortName}`}>Email to add</label>
          <input id={`add-${shortName}`} type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="colleague@ministry.org" className="min-w-[200px] flex-1 rounded-lg border border-rule-2 px-3 py-2 text-[14px]" />
          <select aria-label="Role" value={newRole} onChange={(e) => setNewRole(e.target.value as "org_admin" | "facilitator")} className="rounded-lg border border-rule-2 bg-plate px-2 py-2 text-[14px]">
            <option value="org_admin">Admin</option>
            <option value="facilitator">Facilitator</option>
          </select>
          <Action primary>Add</Action>
        </form>
      </div>

      {(msg || err) && (
        <p className={`lg:col-span-2 text-[13px] ${err ? "text-vermillion" : "text-ink-2"}`}>{err ?? msg}</p>
      )}
      <div className="lg:col-span-2">
        <ResponseDeletion shortName={shortName} onChanged={onChanged} />
      </div>
    </div>
  );
}

/* ── signed in, no organisation: the way forward ─────────────────────── */

type Onboarding = {
  signed_in: boolean;
  email: string;
  free_mail: boolean;
  application: { org_name: string; status: string; created_at: string } | null;
  domain_matches: { slug: string; name: string }[];
  pending_orgs: { slug: string; name: string }[];
};

export function NoHouse() {
  const sb = useMemo(() => getSupabaseBrowser(), []);
  const [ob, setOb] = useState<Onboarding | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [setup, setSetup] = useState(false);

  useEffect(() => {
    if (!sb) return;
    sb.rpc("my_onboarding").then(({ data, error }) => {
      if (error) setErr(error.message);
      else setOb(data as Onboarding);
    });
  }, [sb]);

  async function claim(slug: string) {
    if (!sb) return;
    const { data, error } = await sb.rpc("join_org_by_domain", { p_org_slug: slug });
    if (error) return setErr(error.message);
    const r = data as { ok: boolean; email_domain?: string; expected?: string };
    if (r.ok) window.location.href = `/${slug}/dashboard`;
    else setErr(`Your email domain (${r.email_domain}) doesn't match that organisation's (${r.expected}).`);
  }

  return (
    <Band
      letter="—"
      title="Let's find your organisation"
      gloss="You are signed in, but not yet attached to an organisation. Here is what you can do next."
    >
      {err && <p className="mb-3 text-[13.5px] text-vermillion">{err}</p>}
      {!ob && !err && <p className="text-[14px] text-muted">Checking…</p>}

      {ob && (
        <div className="max-w-2xl space-y-5">
          {ob.domain_matches.length > 0 && (
            <div className="rounded-xl border-2 border-emerald bg-plate p-4">
              <p className="text-[16px] font-semibold">Your email matches {ob.domain_matches.length === 1 ? "an organisation" : "these organisations"}</p>
              <ul className="mt-2 space-y-2">
                {ob.domain_matches.map((m) => (
                  <li key={m.slug} className="flex items-center justify-between gap-3">
                    <span className="text-[15px]">{m.name}</span>
                    <button onClick={() => claim(m.slug)} className="rounded-lg bg-emerald px-4 py-2 text-[14px] font-semibold text-plate hover:bg-emerald-deep">Join {m.name} →</button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {ob.pending_orgs.length > 0 && (
            <div className="rounded-xl border border-rule bg-plate p-4">
              <p className="text-[16px] font-semibold">Waiting for approval</p>
              <p className="mt-1 text-[14px] leading-relaxed text-ink-2">
                {ob.pending_orgs[0].name} is set up. You can prepare your links and branding now; the survey
                starts accepting responses once the Collab approves it.
              </p>
              <a href={`/${ob.pending_orgs[0].slug}/dashboard`} className="mt-3 inline-block rounded-lg bg-ink px-4 py-2.5 text-[14px] font-semibold text-paper no-underline">Open your dashboard →</a>
            </div>
          )}

          {ob.application && (
            <div className="rounded-xl border border-rule bg-plate p-4">
              <p className="text-[16px] font-semibold">Your application</p>
              <p className="mt-1 text-[14px] text-ink-2">
                {ob.application.org_name} · received {when(ob.application.created_at)} · {ob.application.status === "new" || ob.application.status === "qualified" ? "with the Collab for review" : ob.application.status}
              </p>
            </div>
          )}

          {ob.pending_orgs.length === 0 && ob.domain_matches.length === 0 && (
            ob.free_mail ? (
              <div className="rounded-xl border border-rule bg-plate p-4">
                <p className="text-[16px] font-semibold">Use your ministry email to set up</p>
                <p className="mt-1 text-[14px] leading-relaxed text-ink-2">
                  {ob.email} is a personal address, so we can&apos;t tie it to an organisation automatically. Sign in
                  with your ministry&apos;s email, or <a href="/join">apply to join</a> and the Collab will set you up.
                </p>
              </div>
            ) : setup ? (
              <SelfServeForm email={ob.email} onCancel={() => setSetup(false)} />
            ) : (
              <div className="rounded-xl border border-rule bg-plate p-4">
                <p className="text-[16px] font-semibold">Set your ministry up</p>
                <p className="mt-1 text-[14px] leading-relaxed text-ink-2">
                  Your email is at {ob.email.split("@")[1]}. If that is your ministry&apos;s own domain, you can set it up
                  now — links, branding, team — and it starts collecting once the Collab approves it.
                </p>
                <div className="mt-3"><Action primary onClick={() => setSetup(true)}>Set up my ministry →</Action></div>
              </div>
            )
          )}
        </div>
      )}
    </Band>
  );
}

function SelfServeForm({ email, onCancel }: { email: string; onCancel: () => void }) {
  const sb = useMemo(() => getSupabaseBrowser(), []);
  const [name, setName] = useState("");
  const [short, setShort] = useState("");
  const [touched, setTouched] = useState(false);
  const [country, setCountry] = useState("");
  const domain = email.split("@")[1] ?? "";
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!sb) return;
    setBusy(true);
    setErr(null);
    const { data, error } = await sb.rpc("self_serve_create_org", {
      p_name: name, p_short_name: short, p_website_domain: domain, p_country: country || null,
    });
    setBusy(false);
    if (error) setErr(error.message);
    else window.location.href = `/${(data as { slug: string }).slug}/dashboard`;
  }

  return (
    <form onSubmit={submit} className="rounded-xl border-2 border-ink bg-plate p-4">
      <p className="text-[16px] font-semibold">Set up your ministry</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Ministry name">
          <input required value={name} onChange={(e) => { setName(e.target.value); if (!touched) setShort(suggestShortName(e.target.value)); }} className="rounded-lg border border-rule-2 px-3 py-2 text-[14px]" />
        </Field>
        <Field label="Short name · your survey link">
          <input required value={short} onChange={(e) => { setTouched(true); setShort(e.target.value.toLowerCase()); }} pattern="[a-z][a-z0-9-]{1,31}" className="rounded-lg border border-rule-2 px-3 py-2 font-mono text-[14px]" />
        </Field>
        <Field label="Website domain · from your email">
          <input value={domain} readOnly className="rounded-lg border border-rule bg-paper-deep px-3 py-2 text-[14px] text-ink-2" />
        </Field>
        <Field label="Country">
          <input value={country} onChange={(e) => setCountry(e.target.value)} className="rounded-lg border border-rule-2 px-3 py-2 text-[14px]" />
        </Field>
      </div>
      <p className="mt-3 font-mono text-[12px] text-ink-2">jfindx.org/{short || "…"} · can&apos;t be changed later</p>
      {err && <p className="mt-2 text-[13px] text-vermillion">{err}</p>}
      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={busy} className="rounded-lg bg-emerald px-4 py-2.5 text-[14px] font-semibold text-plate hover:bg-emerald-deep disabled:opacity-50">
          {busy ? "Setting up…" : "Set up my ministry"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-rule-2 px-4 py-2.5 text-[14px] font-semibold text-ink hover:border-ink">Cancel</button>
      </div>
    </form>
  );
}
