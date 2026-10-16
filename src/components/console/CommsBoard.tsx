"use client";

/**
 * Administrator → E · Communication (migration 0056).
 *
 * Email every Org Administrator, or one of them, from the console — with the
 * six onboarding steps ready as templates, filled per person ({{first_name}},
 * {{org_name}}, their own dashboard link…).
 *
 * Four views:
 *   Sequence board  every Org Administrator × the six steps: what each has had,
 *                   and a "Send step N" button for their next one. Each column
 *                   can also go to everyone who hasn't had that step yet.
 *   Compose         a template (or a blank page), one person or everyone,
 *                   a live preview of exactly what that person will receive.
 *   Templates       edit the steps and one-off updates.
 *   Sent            the log.
 *
 * The audience is never a saved list. admin_comms_recipients() reads who is an
 * Org Administrator at the moment of sending, so anyone added since is
 * included automatically. The actual send happens server-side
 * (/api/admin/comms), which asks the database again — this component cannot
 * widen the audience, only narrow it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Action, Row, Rows, Trouble } from "@/components/console/Bands";
import {
  PLACEHOLDERS,
  firstNameFrom,
  nextStep,
  recipientKey,
  renderEmail,
  sequenceOf,
  unknownPlaceholders,
  type CommsRecipient,
  type CommsTemplate,
} from "@/lib/comms";

type HistoryRow = {
  id: string;
  template_key: string | null;
  template_title: string | null;
  subject: string;
  email: string;
  org_name: string | null;
  mode: "single" | "broadcast";
  status: "sent" | "failed";
  error: string | null;
  sent_at: string;
  sent_by: string | null;
};

type View = "board" | "compose" | "templates" | "sent";

type Draft = {
  template_key: string | null;
  subject: string;
  body: string;
  audience: "one" | "all";
  only_missing: boolean;
  email: string;
  org_id: string | null;
  name: string;
  save_name: boolean;
};

const BLANK: Draft = {
  template_key: null,
  subject: "",
  body: "Hi {{first_name}},\n\n\n\n{{sender_name}}\nThe Jesus Index · jfindx.org",
  audience: "all",
  only_missing: false,
  email: "",
  org_id: null,
  name: "",
  save_name: true,
};

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** For the tile on the admin console: how many Org Administrators the next "everyone" would reach. */
export function useCommsCount(sb: SupabaseClient | null) {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!sb) return;
    sb.rpc("admin_comms_recipients", { p_include_sandbox: false, p_include_invited: true, p_email: null }).then(
      ({ data, error }) => setCount(error ? null : ((data as unknown[]) ?? []).length),
    );
  }, [sb]);
  return count;
}

export default function CommsBoard({ sb }: { sb: SupabaseClient | null }) {
  const [view, setView] = useState<View>("board");
  const [templates, setTemplates] = useState<CommsTemplate[] | null>(null);
  const [people, setPeople] = useState<CommsRecipient[] | null>(null);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [sandbox, setSandbox] = useState(false);
  const [invited, setInvited] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [sending, setSending] = useState(false);
  const [sender, setSender] = useState("");

  const load = useCallback(async () => {
    if (!sb) return;
    const [t, p, h] = await Promise.all([
      sb.rpc("admin_comms_templates"),
      sb.rpc("admin_comms_recipients", { p_include_sandbox: sandbox, p_include_invited: invited, p_email: null }),
      sb.rpc("admin_comms_history", { p_limit: 100 }),
    ]);
    const first = t.error ?? p.error ?? h.error;
    if (first)
      setErr(
        /function .* does not exist|schema cache/i.test(first.message)
          ? "Communication needs migration 0056 applied to this database."
          : first.message,
      );
    else setErr(null);
    setTemplates((t.data as CommsTemplate[]) ?? []);
    setPeople((p.data as CommsRecipient[]) ?? []);
    setHistory((h.data as HistoryRow[]) ?? []);
  }, [sb, sandbox, invited]);

  useEffect(() => {
    load();
  }, [load]);

  // {{sender_name}} in the preview: the signed-in administrator's saved name.
  useEffect(() => {
    if (!sb) return;
    sb.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: me } = await sb.from("app_users").select("full_name").eq("id", data.user.id).maybeSingle();
      setSender(((me?.full_name as string | null) ?? "").trim());
    });
  }, [sb]);

  const steps = useMemo(() => sequenceOf(templates ?? []), [templates]);
  const orgCount = useMemo(() => new Set((people ?? []).map((p) => p.org_id)).size, [people]);
  const invitedCount = (people ?? []).filter((p) => p.source === "invite").length;

  /** Open the composer with a template, for one person or for everyone. */
  const compose = useCallback(
    (t: CommsTemplate | null, who: CommsRecipient | "all" | "missing") => {
      setDraft({
        ...BLANK,
        template_key: t?.key ?? null,
        subject: t?.subject ?? "",
        body: t?.body ?? BLANK.body,
        audience: who === "all" || who === "missing" ? "all" : "one",
        only_missing: who === "missing",
        email: typeof who === "object" ? who.email : "",
        org_id: typeof who === "object" ? who.org_id : null,
        name: typeof who === "object" ? firstNameFrom(who.name, who.email) ?? "" : "",
      });
      setNotice(null);
      setView("compose");
    },
    [],
  );

  async function send() {
    if (!sb) return;
    const t = templates?.find((x) => x.key === draft.template_key) ?? null;
    const target = draft.audience === "one" ? (people ?? []).find((p) => p.email === draft.email.trim().toLowerCase() && p.org_id === draft.org_id) : null;
    if (draft.audience === "one" && !target) {
      setErr("Pick an Org Administrator from the list first.");
      return;
    }
    const count =
      draft.audience === "one"
        ? 1
        : (people ?? []).filter((p) => !(draft.only_missing && draft.template_key && p.sent?.[draft.template_key])).length;
    const label = draft.audience === "one" ? `${target!.email} (${target!.org_name})` : `${count} Org Administrator${count === 1 ? "" : "s"}`;
    if (!count) {
      setErr("Nobody to send to.");
      return;
    }
    if (!window.confirm(`Send “${draft.subject}” to ${label}?\n\nEach person gets their own email — nobody sees anyone else's address.`)) return;

    setSending(true);
    setErr(null);
    setNotice(null);
    try {
      if (draft.audience === "one" && draft.save_name && target && draft.name.trim() && draft.name.trim() !== (target.name ?? "").trim())
        await sb.rpc("admin_comms_set_name", { p_email: target.email, p_name: draft.name.trim() });

      const { data: s } = await sb.auth.getSession();
      const res = await fetch("/api/admin/comms", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.session?.access_token ?? ""}` },
        body: JSON.stringify({
          mode: draft.audience === "one" ? "single" : "broadcast",
          template_key: t ? t.key : null,
          subject: draft.subject,
          body: draft.body,
          recipients: target ? [{ email: target.email, org_id: target.org_id, name: draft.name }] : undefined,
          include_sandbox: sandbox,
          include_invited: invited,
          only_missing: draft.only_missing,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { sent?: number; failed?: number; error?: string; note?: string; log_error?: string };
      if (!res.ok && !j.sent) setErr(j.error ?? `Sending failed (${res.status}).`);
      else {
        setNotice(
          j.note ??
            `Sent to ${j.sent} ${j.sent === 1 ? "person" : "people"}${j.failed ? ` · ${j.failed} failed: ${j.error}` : ""}.${j.log_error ? ` (Not logged: ${j.log_error})` : ""}`,
        );
        await load();
        setView(draft.audience === "one" ? "board" : "sent");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Communication" className="inline-flex flex-wrap gap-1 rounded-xl bg-rule/70 p-1">
          {(
            [
              ["board", "Sequence board"],
              ["compose", "Compose"],
              ["templates", "Templates"],
              ["sent", "Sent"],
            ] as [View, string][]
          ).map(([v, label]) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`rounded-lg px-3.5 py-2 text-[14px] font-semibold ${view === v ? "bg-plate text-ink shadow-sm" : "text-ink-2 hover:text-ink"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <Action primary onClick={() => compose(null, "all")}>
          Email every Org Administrator →
        </Action>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13.5px] text-ink-2">
        <span>
          <b className="tabular text-ink">{people?.length ?? "…"}</b> Org Administrator{people?.length === 1 ? "" : "s"} across{" "}
          <b className="tabular text-ink">{orgCount}</b> organisation{orgCount === 1 ? "" : "s"}
          {invitedCount ? ` · ${invitedCount} invited, not signed in yet` : ""}
        </span>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={invited} onChange={(e) => setInvited(e.target.checked)} />
          Include invited
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={sandbox} onChange={(e) => setSandbox(e.target.checked)} />
          Include sandbox organisations
        </label>
      </div>

      {err && <Trouble message={err} />}
      {notice && (
        <p role="status" className="rounded-xl border border-emerald/45 bg-emerald/10 px-4 py-2.5 text-[14px] text-ink">
          {notice}
        </p>
      )}

      {view === "board" && <Board people={people} steps={steps} onCompose={compose} />}
      {view === "compose" && (
        <Composer
          draft={draft}
          setDraft={setDraft}
          templates={templates ?? []}
          people={people ?? []}
          sender={sender}
          sending={sending}
          onSend={send}
          onSaveTemplate={async () => {
            const t = templates?.find((x) => x.key === draft.template_key);
            if (!sb || !t) return;
            const { error } = await sb.rpc("admin_comms_save_template", {
              p_key: t.key, p_title: t.title, p_subject: draft.subject, p_body: draft.body, p_kind: t.kind, p_position: t.position,
            });
            if (error) setErr(error.message);
            else {
              setNotice(`Saved to “${t.title}”.`);
              load();
            }
          }}
        />
      )}
      {view === "templates" && <Templates sb={sb} templates={templates} onChanged={load} onUse={(t) => compose(t, "all")} setErr={setErr} />}
      {view === "sent" && <Sent history={history} />}
    </div>
  );
}

/* ── the sequence board ───────────────────────────────────────────────── */

function Board({
  people,
  steps,
  onCompose,
}: {
  people: CommsRecipient[] | null;
  steps: CommsTemplate[];
  onCompose: (t: CommsTemplate | null, who: CommsRecipient | "all" | "missing") => void;
}) {
  if (people === null) return <p className="text-[14px] text-ink-2">Loading…</p>;
  if (!people.length)
    return (
      <p className="rounded-xl border border-rule bg-plate px-4 py-5 text-[14.5px] leading-relaxed text-ink-2 shadow-sm">
        No Org Administrators yet. As soon as an organisation is created and its administrator invited — or someone claims an organisation —
        they appear here, with step 1 waiting.
      </p>
    );

  return (
    <div className="overflow-x-auto rounded-xl border border-rule bg-plate shadow-sm">
      <table className="w-full min-w-[860px] border-collapse text-left text-[13.5px]">
        <thead>
          <tr className="border-b border-rule align-bottom">
            <th className="figcap px-4 py-3 font-normal">Org Administrator</th>
            {steps.map((s) => {
              const missing = people.filter((p) => !p.sent?.[s.key]).length;
              return (
                <th key={s.key} className="w-[118px] px-2 py-3 font-normal">
                  <span className="figcap block">Step {s.position}</span>
                  <span className="mt-0.5 block text-[12.5px] font-semibold leading-snug text-ink">{s.title}</span>
                  {missing > 0 && (
                    <button
                      type="button"
                      onClick={() => onCompose(s, "missing")}
                      className="mt-1.5 rounded-md border border-rule-2 px-2 py-0.5 text-[12px] font-semibold text-ink-2 hover:border-ink hover:text-ink"
                      title={`Send “${s.title}” to the ${missing} who haven't had it`}
                    >
                      To {missing} →
                    </button>
                  )}
                </th>
              );
            })}
            <th className="px-4 py-3 font-normal">
              <span className="figcap">Next</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-rule">
          {people.map((p) => {
            const next = nextStep(steps, p);
            const greet = firstNameFrom(p.name, p.email);
            return (
              <tr key={recipientKey(p)} className="align-top">
                <td className="px-4 py-3">
                  <span className="block font-semibold text-ink">{p.org_name}</span>
                  <span className="block break-all text-ink-2">
                    {greet ? `${greet} · ` : ""}
                    {p.email}
                  </span>
                  <span className="mt-0.5 flex flex-wrap gap-1">
                    {p.source === "invite" && <Pill>invited</Pill>}
                    {p.is_demo && <Pill>sandbox</Pill>}
                    {p.org_status !== "active" && <Pill>{p.org_status}</Pill>}
                  </span>
                </td>
                {steps.map((s) => (
                  <td key={s.key} className="px-2 py-3">
                    {p.sent?.[s.key] ? (
                      <span className="tabular text-[12.5px] text-ink">
                        <span className="mr-1 text-emerald" aria-hidden>
                          ✓
                        </span>
                        {shortDate(p.sent[s.key])}
                      </span>
                    ) : next?.key === s.key ? (
                      <span className="tabular text-[12.5px] font-semibold text-emerald-deeper">next</span>
                    ) : (
                      <span className="tabular text-[12.5px] text-muted">—</span>
                    )}
                  </td>
                ))}
                <td className="px-4 py-3">
                  {next ? (
                    <button
                      type="button"
                      onClick={() => onCompose(next, p)}
                      className="whitespace-nowrap rounded-lg bg-emerald px-3 py-1.5 text-[13px] font-semibold text-plate hover:bg-emerald-deep"
                    >
                      Send step {next.position} →
                    </button>
                  ) : (
                    <span className="text-[12.5px] text-ink-2">All steps sent</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-md border border-rule-2 px-1.5 py-px text-[11.5px] font-semibold text-ink-2">{children}</span>;
}

/* ── the composer ─────────────────────────────────────────────────────── */

function Composer({
  draft,
  setDraft,
  templates,
  people,
  sender,
  sending,
  onSend,
  onSaveTemplate,
}: {
  draft: Draft;
  setDraft: (d: Draft | ((d: Draft) => Draft)) => void;
  templates: CommsTemplate[];
  people: CommsRecipient[];
  sender: string;
  sending: boolean;
  onSend: () => void;
  onSaveTemplate: () => void;
}) {
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const tpl = templates.find((t) => t.key === draft.template_key) ?? null;
  const edited = tpl ? tpl.subject !== draft.subject || tpl.body !== draft.body : false;

  const email = draft.email.trim().toLowerCase();
  const matches = people.filter((p) => p.email === email);
  const target = matches.find((p) => p.org_id === draft.org_id) ?? null;

  // Typing an address that belongs to an Org Administrator fills in their organisation and name.
  useEffect(() => {
    if (draft.audience !== "one") return;
    if (matches.length && !matches.some((m) => m.org_id === draft.org_id)) {
      const m = matches[0];
      setDraft((d) => ({ ...d, org_id: m.org_id, name: firstNameFrom(m.name, m.email) ?? "" }));
    }
  }, [draft.audience, draft.org_id, matches, setDraft]);

  const audience =
    draft.audience === "one"
      ? target
        ? [target]
        : []
      : people.filter((p) => !(draft.only_missing && draft.template_key && p.sent?.[draft.template_key]));
  const sample = draft.audience === "one" ? (target ? { ...target, name: draft.name || target.name } : null) : audience[0] ?? null;
  const site = typeof window !== "undefined" ? window.location.origin : "https://jfindx.org";
  const preview = sample ? renderEmail({ subject: draft.subject, body: draft.body }, sample, site, sender) : null;
  const unknown = unknownPlaceholders(`${draft.subject}\n${draft.body}`);
  const alreadyHad = draft.audience === "one" && target && draft.template_key ? target.sent?.[draft.template_key] : null;

  function insert(key: string) {
    const el = bodyRef.current;
    const token = `{{${key}}}`;
    if (!el) return setDraft((d) => ({ ...d, body: d.body + token }));
    const [a, b] = [el.selectionStart, el.selectionEnd];
    const next = draft.body.slice(0, a) + token + draft.body.slice(b);
    setDraft((d) => ({ ...d, body: next }));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + token.length, a + token.length);
    });
  }

  const input = "w-full rounded-lg border border-rule-2 bg-plate px-3 py-2 text-[14.5px] text-ink";
  const label = "figcap mb-1 block";

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="flex flex-col gap-4 rounded-xl border border-rule bg-plate p-4 shadow-sm sm:p-5">
        <div>
          <label className={label} htmlFor="comms-template">
            Template
          </label>
          <select
            id="comms-template"
            className={input}
            value={draft.template_key ?? ""}
            onChange={(e) => {
              const t = templates.find((x) => x.key === e.target.value) ?? null;
              setDraft((d) => ({
                ...d,
                template_key: t?.key ?? null,
                subject: t?.subject ?? "",
                body: t?.body ?? BLANK.body,
                only_missing: t?.kind === "sequence" ? d.only_missing : false,
              }));
            }}
          >
            <option value="">Blank — write a one-off</option>
            <optgroup label="Onboarding sequence">
              {sequenceOf(templates).map((t) => (
                <option key={t.key} value={t.key}>
                  {t.position}. {t.title}
                </option>
              ))}
            </optgroup>
            {templates.some((t) => t.kind === "update") && (
              <optgroup label="Updates">
                {templates
                  .filter((t) => t.kind === "update")
                  .map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.title}
                    </option>
                  ))}
              </optgroup>
            )}
          </select>
        </div>

        <fieldset>
          <legend className={label}>Send to</legend>
          <div className="inline-flex gap-1 rounded-xl bg-rule/70 p-1">
            {(
              [
                ["one", "One Org Administrator"],
                ["all", "Every Org Administrator"],
              ] as ["one" | "all", string][]
            ).map(([v, l]) => (
              <button
                key={v}
                type="button"
                aria-pressed={draft.audience === v}
                onClick={() => setDraft((d) => ({ ...d, audience: v }))}
                className={`rounded-lg px-3 py-1.5 text-[13.5px] font-semibold ${draft.audience === v ? "bg-plate text-ink shadow-sm" : "text-ink-2"}`}
              >
                {l}
              </button>
            ))}
          </div>

          {draft.audience === "one" ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={label} htmlFor="comms-email">
                  Their email
                </label>
                <input
                  id="comms-email"
                  type="email"
                  list="comms-people"
                  autoComplete="off"
                  className={input}
                  placeholder="Start typing an email or an organisation…"
                  value={draft.email}
                  onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
                />
                <datalist id="comms-people">
                  {people.map((p) => (
                    <option key={recipientKey(p)} value={p.email}>
                      {p.org_name}
                    </option>
                  ))}
                </datalist>
                {email && !matches.length && (
                  <p className="mt-1 text-[12.5px] text-ink-2">
                    Not an Org Administrator yet. Add them to their organisation first (A · Applications → the organisation), then they&apos;ll appear here.
                  </p>
                )}
              </div>
              {matches.length > 1 && (
                <div className="sm:col-span-2">
                  <label className={label} htmlFor="comms-org">
                    Organisation
                  </label>
                  <select id="comms-org" className={input} value={draft.org_id ?? ""} onChange={(e) => setDraft((d) => ({ ...d, org_id: e.target.value }))}>
                    {matches.map((m) => (
                      <option key={m.org_id} value={m.org_id}>
                        {m.org_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {target && (
                <>
                  <div>
                    <label className={label} htmlFor="comms-name">
                      Greet them as
                    </label>
                    <input
                      id="comms-name"
                      className={input}
                      placeholder="there"
                      value={draft.name}
                      onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <span className={label}>Organisation</span>
                    <p className="py-2 text-[14.5px] font-semibold">{target.org_name}</p>
                  </div>
                  <label className="flex items-center gap-1.5 text-[13px] text-ink-2 sm:col-span-2">
                    <input type="checkbox" checked={draft.save_name} onChange={(e) => setDraft((d) => ({ ...d, save_name: e.target.checked }))} />
                    Remember this name for their next email
                  </label>
                </>
              )}
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-2 text-[13.5px] text-ink-2">
              {tpl?.kind === "sequence" && (
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={draft.only_missing} onChange={(e) => setDraft((d) => ({ ...d, only_missing: e.target.checked }))} />
                  Only those who haven&apos;t had this step yet
                </label>
              )}
              <p>
                <b className="tabular text-ink">{audience.length}</b> {audience.length === 1 ? "person" : "people"}, each with their own email and their own
                organisation&apos;s name and links. Anyone added as an Org Administrator before you press Send is included.
              </p>
            </div>
          )}
        </fieldset>

        <div>
          <label className={label} htmlFor="comms-subject">
            Subject
          </label>
          <input id="comms-subject" className={input} value={draft.subject} onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))} />
        </div>

        <div>
          <label className={label} htmlFor="comms-body">
            Message
          </label>
          <textarea
            id="comms-body"
            ref={bodyRef}
            rows={16}
            className={`${input} font-mono text-[13px] leading-relaxed`}
            value={draft.body}
            onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
          />
          <p className="mt-1 text-[12px] text-ink-2">
            Blank line = new paragraph · “- ” bullets · “1. ” numbered · **bold** · links work as typed. Click to insert:
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {PLACEHOLDERS.map((p) => (
              <button
                key={p.key}
                type="button"
                title={p.label}
                onClick={() => insert(p.key)}
                className="rounded-md border border-rule-2 px-1.5 py-0.5 font-mono text-[11.5px] text-ink-2 hover:border-ink hover:text-ink"
              >
                {`{{${p.key}}}`}
              </button>
            ))}
          </div>
          {unknown.length > 0 && (
            <p className="mt-2 text-[13px] text-vermillion">
              Not a placeholder we can fill: {unknown.map((u) => `{{${u}}}`).join(", ")}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Action primary disabled={sending || !audience.length || !draft.subject.trim() || unknown.length > 0} onClick={onSend}>
            {sending ? "Sending…" : draft.audience === "one" ? "Send" : `Send to ${audience.length}`}
          </Action>
          {tpl && edited && <Action onClick={onSaveTemplate}>Save changes to “{tpl.title}”</Action>}
          {alreadyHad && <span className="text-[13px] text-ink-2">They had this on {shortDate(alreadyHad)}.</span>}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="figcap">Preview{sample ? ` · exactly what ${sample.email} receives` : ""}</p>
        {preview ? (
          <>
            <p className="rounded-lg border border-rule bg-plate px-3 py-2 text-[14px]">
              <span className="text-ink-2">Subject: </span>
              <b>{preview.subject}</b>
            </p>
            <iframe
              title="Email preview"
              sandbox=""
              srcDoc={preview.html}
              className="h-[640px] w-full rounded-xl border border-rule bg-paper-deep"
            />
          </>
        ) : (
          <p className="rounded-xl border border-dashed border-rule-2 px-4 py-10 text-center text-[14px] text-ink-2">
            {draft.audience === "one" ? "Pick an Org Administrator to see their email." : "Nobody in this audience yet."}
          </p>
        )}
      </div>
    </div>
  );
}

/* ── templates ────────────────────────────────────────────────────────── */

function Templates({
  sb,
  templates,
  onChanged,
  onUse,
  setErr,
}: {
  sb: SupabaseClient | null;
  templates: CommsTemplate[] | null;
  onChanged: () => void;
  onUse: (t: CommsTemplate) => void;
  setErr: (m: string | null) => void;
}) {
  const [editing, setEditing] = useState<CommsTemplate | null>(null);

  async function save() {
    if (!sb || !editing) return;
    const { error } = await sb.rpc("admin_comms_save_template", {
      p_key: editing.key,
      p_title: editing.title,
      p_subject: editing.subject,
      p_body: editing.body,
      p_kind: editing.kind,
      p_position: editing.position,
    });
    if (error) setErr(error.message);
    else {
      setErr(null);
      setEditing(null);
      onChanged();
    }
  }

  async function remove(t: CommsTemplate) {
    if (!sb || !window.confirm(`Delete the “${t.title}” template? Emails already sent stay in the log.`)) return;
    const { error } = await sb.rpc("admin_comms_delete_template", { p_key: t.key });
    if (error) setErr(error.message);
    else onChanged();
  }

  if (editing) {
    const input = "w-full rounded-lg border border-rule-2 bg-plate px-3 py-2 text-[14.5px] text-ink";
    const unknown = unknownPlaceholders(`${editing.subject}\n${editing.body}`);
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-rule bg-plate p-4 shadow-sm sm:p-5">
        <label className="flex flex-col gap-1">
          <span className="figcap">Title (only you see this)</span>
          <input className={input} value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="figcap">Subject</span>
          <input className={input} value={editing.subject} onChange={(e) => setEditing({ ...editing, subject: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="figcap">Message</span>
          <textarea
            rows={18}
            className={`${input} font-mono text-[13px] leading-relaxed`}
            value={editing.body}
            onChange={(e) => setEditing({ ...editing, body: e.target.value })}
          />
        </label>
        {unknown.length > 0 && <p className="text-[13px] text-vermillion">Not a placeholder we can fill: {unknown.map((u) => `{{${u}}}`).join(", ")}</p>}
        <p className="text-[12.5px] text-ink-2">Placeholders: {PLACEHOLDERS.map((p) => `{{${p.key}}}`).join(" · ")}</p>
        <div className="flex gap-2">
          <Action primary disabled={unknown.length > 0 || !editing.title.trim() || !editing.subject.trim()} onClick={save}>
            Save template
          </Action>
          <Action onClick={() => setEditing(null)}>Cancel</Action>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Rows>
        {(templates ?? []).map((t) => (
          <Row
            key={t.key}
            label={
              <>
                <span className="font-semibold">{t.kind === "sequence" ? `${t.position}. ` : ""}{t.title}</span>
                <span className="block text-[13px] text-ink-2">{t.subject}</span>
              </>
            }
            meta={t.kind === "sequence" ? "sequence" : "update"}
          >
            <span className="flex gap-1.5">
              <SmallButton onClick={() => setEditing(t)}>Edit</SmallButton>
              <SmallButton onClick={() => onUse(t)}>Use</SmallButton>
              {t.kind === "update" && <SmallButton onClick={() => remove(t)}>Delete</SmallButton>}
            </span>
          </Row>
        ))}
      </Rows>
      <div>
        <Action
          onClick={() =>
            setEditing({ key: "", title: "", subject: "", body: BLANK.body, kind: "update", position: null })
          }
        >
          + New update template
        </Action>
      </div>
    </div>
  );
}

function SmallButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-rule-2 px-2.5 py-1 text-[12.5px] font-semibold text-ink-2 hover:border-ink hover:text-ink"
    >
      {children}
    </button>
  );
}

/* ── the log ──────────────────────────────────────────────────────────── */

function Sent({ history }: { history: HistoryRow[] | null }) {
  if (history === null) return <p className="text-[14px] text-ink-2">Loading…</p>;
  if (!history.length) return <p className="text-[14.5px] text-ink-2">Nothing sent yet.</p>;
  return (
    <Rows>
      {history.map((h) => (
        <Row
          key={h.id}
          tone={h.status === "failed" ? "warn" : "plain"}
          label={
            <>
              <span className="font-semibold">{h.subject}</span>
              <span className="block text-[13px] text-ink-2">
                {h.email}
                {h.org_name ? ` · ${h.org_name}` : ""}
                {h.status === "failed" && h.error ? ` · failed: ${h.error}` : ""}
              </span>
            </>
          }
          meta={`${new Date(h.sent_at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · ${
            h.mode === "broadcast" ? "to everyone" : "one"
          }${h.sent_by ? ` · ${h.sent_by}` : ""}`}
        />
      ))}
    </Rows>
  );
}
