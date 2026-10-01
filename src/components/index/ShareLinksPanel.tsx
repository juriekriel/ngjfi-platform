"use client";

/**
 * View-only links (migration 0046) — the part of Team & access where an Org
 * Administrator or Coordinator makes a read-only link for people who will
 * never sign in (field leaders, a board), and revokes it again.
 *
 * What a link shows is the organisation's own results — never a Collab
 * overlay or benchmark on them — behind exactly the minimums this dashboard
 * holds. The heat map, as on the dashboard, is coloured by all data gathered
 * for each country. The
 * database enforces all of it (create_share_link / org_share_links /
 * revoke_share_link / shared_dashboard); this component explains it.
 *
 * The token is shown ONCE, straight after creation: the database keeps only
 * its hash, so nobody — the Collab included — can look a link up later.
 */
import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_EXPIRY_DAYS,
  EXPIRY_CHOICES,
  labelProblem,
  passcodeProblem,
  scopeLabel,
  shareState,
  shareUrl,
  type ShareLinkRow,
} from "@/lib/shareLinks";

type Room = { id: string; name: string; is_test?: boolean };

const input = "w-full rounded-lg border border-rule-2 bg-plate px-3 py-2 text-[14px] text-ink";
const small = "rounded-md border border-rule-2 px-2.5 py-1 text-[12px] font-semibold text-ink hover:border-ink disabled:opacity-50";
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export default function ShareLinksPanel({ sb, orgSlug, orgName }: { sb: SupabaseClient; orgSlug: string; orgName: string }) {
  const [rows, setRows] = useState<ShareLinkRow[] | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [label, setLabel] = useState("");
  const [scope, setScope] = useState<string>("house");
  const [days, setDays] = useState(DEFAULT_EXPIRY_DAYS);
  const [passcode, setPasscode] = useState("");
  const [showMap, setShowMap] = useState(true);
  const [showDetail, setShowDetail] = useState(true);

  const [made, setMade] = useState<{ url: string; label: string; passcode: string | null } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [list, links, tests] = await Promise.all([
      sb.rpc("org_share_links", { p_org_slug: orgSlug }),
      sb.rpc("org_distribution_links", { p_org_slug: orgSlug }),
      sb.rpc("org_test_links", { p_org_slug: orgSlug }),
    ]);
    if (list.error) {
      setErr(/org_share_links/.test(list.error.message)
        ? "View-only links need migration 0046, which isn't applied to this database yet."
        : list.error.message);
      return;
    }
    setErr(null);
    setRows((list.data as ShareLinkRow[]) ?? []);
    const testIds = new Set(Object.keys((tests.data as Record<string, unknown>) ?? {}));
    setRooms(((links.data as Room[]) ?? []).filter((r) => !testIds.has(r.id)));
  }, [sb, orgSlug]);

  useEffect(() => { load(); }, [load]);

  const isRoom = scope !== "house";
  const formProblem = labelProblem(label) ?? passcodeProblem(passcode);

  async function create() {
    if (formProblem) { setErr(formProblem); return; }
    setBusy(true); setErr(null); setMade(null); setCopied(false);
    const pass = passcode.trim() || null;
    const { data, error } = await sb.rpc("create_share_link", {
      p_org_slug: orgSlug,
      p_label: label.trim(),
      p_link_id: isRoom ? scope : null,
      p_days: days,
      p_passcode: pass,
      p_show_map: showMap,
      p_show_detail: isRoom ? false : showDetail,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    const token = (data as { token: string }).token;
    setMade({ url: shareUrl(window.location.origin, token), label: label.trim(), passcode: pass });
    setLabel(""); setPasscode("");
    load();
  }

  async function copy() {
    if (!made) return;
    try {
      await navigator.clipboard.writeText(made.url);
      setCopied(true);
    } catch {
      setErr("Couldn't copy — select the link text instead.");
    }
  }

  async function revoke(id: string) {
    setBusy(true); setErr(null);
    const { error } = await sb.rpc("revoke_share_link", { p_org_slug: orgSlug, p_id: id });
    setBusy(false);
    setConfirmRevoke(null);
    if (error) setErr(error.message);
    else load();
  }

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <section className="flex flex-col gap-4 rounded-2xl border border-rule bg-plate p-5 shadow-sm lg:col-span-2">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">Read-only, no sign-in</p>
          <h2 className="mt-0.5 text-[18px] font-bold tracking-tight">Make a view-only link</h2>
          <p className="mt-1.5 max-w-xl text-[14px] leading-relaxed text-ink-2">
            Anyone with the link sees {orgName}&apos;s own results — the J12 index, how many people completed the
            Index (following and not yet following), the J12 and Unengaged matrices and, if you choose, the heat map
            and the detail panels. Nothing can be changed from it, your figures are never compared with the Collab,
            and it holds the same minimums as this dashboard.
          </p>
        </div>

        {made && (
          <div className="rounded-xl border border-emerald bg-emerald/10 p-4" role="status">
            <p className="text-[14px] font-semibold">“{made.label}” is ready. Copy it now — this is the only time it&apos;s shown.</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-lg border border-rule bg-plate px-3 py-2 font-mono text-[12.5px]">{made.url}</code>
              <button type="button" onClick={copy} className="rounded-lg bg-ink px-4 py-2 text-[14px] font-semibold text-paper">
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
            <p className="mt-2 text-[13px] text-ink-2">
              {made.passcode
                ? "Send the passcode separately from the link — say it in a meeting, or send it in a different message."
                : "No passcode: whoever has this link can open it until it expires or you revoke it."}{" "}
              Lost it? Make a new one and revoke this one.
            </p>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-[13px] font-semibold text-ink sm:col-span-2">
            Name
            <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80}
              placeholder="e.g. Field leaders — East Africa" className={input} />
            <span className="font-normal text-ink-2">Only your team sees this. Shown on the page as who it was shared with.</span>
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-semibold text-ink">
            What it shows
            <select value={scope} onChange={(e) => setScope(e.target.value)} className={input}>
              <option value="house">All {orgName} surveys</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>Only “{r.name}”</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-semibold text-ink">
            Expires after
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className={input}>
              {EXPIRY_CHOICES.map((c) => <option key={c.days} value={c.days}>{c.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-semibold text-ink">
            Passcode <span className="font-normal text-ink-2">(optional)</span>
            <input value={passcode} onChange={(e) => setPasscode(e.target.value)} maxLength={32}
              autoComplete="off" placeholder="4–32 characters" className={input} />
          </label>
          <fieldset className="flex flex-col justify-end gap-1.5 text-[14px]">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={showMap} onChange={(e) => setShowMap(e.target.checked)} />
              Include the heat map
            </label>
            <label className={`flex items-center gap-2 ${isRoom ? "text-muted" : ""}`}>
              <input type="checkbox" checked={!isRoom && showDetail} disabled={isRoom} onChange={(e) => setShowDetail(e.target.checked)} />
              Include more detail{isRoom ? " (all surveys only)" : ""}
            </label>
          </fieldset>
        </div>

        {isRoom && (
          <p className="text-[13px] leading-relaxed text-ink-2">
            One survey holds its own minimum. Until enough people finish it, the link shows the count only — while
            a link for all surveys, which pools every one, usually already shows a score.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={create} disabled={busy}
            className="rounded-lg bg-ink px-4 py-2.5 text-[14px] font-semibold text-paper disabled:opacity-50">
            {busy ? "Working…" : "Create view-only link"}
          </button>
          {err && <span className="text-[13px] text-vermillion">{err}</span>}
        </div>

        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">Your links</p>
          {rows === null ? (
            <p className="mt-2 text-[14px] text-ink-2">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="mt-2 text-[14px] text-ink-2">No view-only links yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-rule overflow-hidden rounded-xl border border-rule">
              {rows.map((r) => {
                const st = shareState(r);
                return (
                  <li key={r.id} className={`flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 ${st === "live" ? "" : "bg-paper-deep/60"}`}>
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold">
                        {r.label}
                        {r.has_passcode && <span className="ml-2 rounded-full bg-paper-deep px-2 py-0.5 text-[11.5px] font-semibold text-ink-2">Passcode</span>}
                      </p>
                      <p className="text-[12.5px] text-ink-2">
                        {scopeLabel(r, orgName)}
                        {r.show_map ? " · heat map" : ""}{r.show_detail ? " · detail" : ""}
                        {" · "}
                        {st === "live" ? `expires ${day(r.expires_at)}` : st === "revoked" ? `revoked ${day(r.revoked_at as string)}` : `expired ${day(r.expires_at)}`}
                        {" · "}
                        {r.view_count === 1 ? "opened once" : `opened ${r.view_count.toLocaleString()} times`}
                        {r.last_viewed_at ? `, last ${day(r.last_viewed_at)}` : ""}
                        {r.created_by ? ` · by ${r.created_by}` : ""}
                      </p>
                    </div>
                    {st === "live" && (
                      confirmRevoke === r.id ? (
                        <span className="flex gap-1.5">
                          <button disabled={busy} onClick={() => revoke(r.id)} className={`${small} border-vermillion text-vermillion`}>Yes, revoke</button>
                          <button onClick={() => setConfirmRevoke(null)} className={small}>Cancel</button>
                        </span>
                      ) : (
                        <button onClick={() => setConfirmRevoke(r.id)} className={small}>Revoke</button>
                      )
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <aside className="flex flex-col gap-2 rounded-2xl border border-rule bg-plate p-5 text-[13.5px] leading-relaxed text-ink-2 shadow-sm">
        <h3 className="text-[15px] font-bold text-ink">What a view-only link never does</h3>
        <p>Show an individual answer. Everything on it is an aggregate, exactly as on this dashboard.</p>
        <p>Compare you with the Collab. No overlay or benchmark on your matrices. The heat map is the same one you see here — each country coloured by everyone there who has completed the Index.</p>
        <p>Mix the two matrices. People not yet following count in your completions, but their answers only ever appear in the Unengaged matrix.</p>
        <p>Lower a minimum. A survey, a country or a year below the platform&apos;s floor shows its count, or nothing — the same as here.</p>
        <p>Last forever. Every link expires, and anyone on your team can revoke any link at once.</p>
        <p>Record who opened it. You see how many times, never by whom.</p>
      </aside>
    </div>
  );
}
