"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

type Link = {
  id: string;
  name: string;
  slug: string;
  audience: "community" | "public";
  active_from: string | null;
  active_to: string | null;
  status: "scheduled" | "active" | "ended";
  n: number;
  places: string[];
  places_total: number;
};

const STATUS_LABEL: Record<Link["status"], string> = {
  scheduled: "Scheduled",
  active: "Active",
  ended: "Ended",
};
const STATUS_STYLE: Record<Link["status"], string> = {
  scheduled: "bg-[rgb(var(--c-emerald)/0.12)] text-accent",
  active: "bg-[rgb(var(--c-green)/0.14)] text-green",
  ended: "bg-paper-deep text-muted",
};

function fmtWindow(from: string | null, to: string | null) {
  const f = (d: string) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  if (!from && !to) return "Always open";
  if (from && to) return `${f(from)} – ${f(to)}`;
  if (from) return `Starts ${f(from)}`;
  return `Ends ${f(to as string)}`;
}

/**
 * Distribution links ("rooms") — locked Phase 2 brief. An org can create
 * multiple named, rename-able links, each with its own active window. A
 * link's responses roll up into the org's own total automatically (they're
 * ordinary sessions, just tagged) — this panel shows the link's own scoped
 * view: a response count and which cities/countries it's reached, so an org
 * can see at a glance what spaces each link is sent to. Deliberately no
 * score here yet (see migration 0028) and never compared to the Collab —
 * that stays house-level only, on the Matrix/Heat map above.
 */
export type { Link as DistributionLink };

export default function LinksPanel({ sb, orgSlug }: { sb: SupabaseClient; orgSlug: string }) {
  const [links, setLinks] = useState<Link[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Link | "new" | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await sb.rpc("org_distribution_links", { p_org_slug: orgSlug });
    if (error) setError(error.message);
    else { setLinks((data as Link[]) || []); setError(null); }
  }, [sb, orgSlug]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="rounded-lg border border-rule bg-paper p-4">
      <div className="flex items-center justify-between">
        <div className="font-mono text-[9px] uppercase tracking-wider text-muted">
          Distribution links — where you&apos;re sending the Index
        </div>
        <button
          onClick={() => setEditing("new")}
          className="rounded-lg bg-emerald px-3.5 py-1.5 text-[13px] font-semibold text-plate hover:bg-emerald-deep"
        >
          + New link
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-vermillion">{error}</p>}
      {!links && !error && <p className="mt-3 text-sm text-slate">Loading…</p>}
      {links && links.length === 0 && (
        <p className="mt-3 text-sm text-slate">
          No links yet. Create one to get a URL you can send to a specific camp, campus or group — its
          own response count and places, still counted in your total above.
        </p>
      )}

      {links && links.length > 0 && (
        <div className="mt-3 space-y-2">
          {links.map((l) => (
            <button
              key={l.id}
              onClick={() => setEditing(l)}
              className="block w-full rounded-lg border border-rule bg-card p-3 text-left hover:border-ink"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-ink">{l.name}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[l.status]}`}>
                  {STATUS_LABEL[l.status]}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[10px] text-muted">
                <span>{fmtWindow(l.active_from, l.active_to)}</span>
                <span>· {l.n.toLocaleString()} {l.n === 1 ? "response" : "responses"}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate">
                <PinIcon />
                <span>
                  {l.places.length > 0
                    ? l.places.join(" · ") + (l.places_total > l.places.length ? ` +${l.places_total - l.places.length} more` : "")
                    : "No responses yet"}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {editing && (
        <LinkForm
          sb={sb}
          orgSlug={orgSlug}
          link={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0 text-muted" fill="none" aria-hidden="true">
      <path d="M8 1.5c-2.2 0-4 1.8-4 4 0 3 4 9 4 9s4-6 4-9c0-2.2-1.8-4-4-4z" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="8" cy="5.5" r="1.4" fill="currentColor" />
    </svg>
  );
}

function slugify(name: string) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "link";
}

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  // datetime-local: each link opens and closes at a date AND a time.
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function LinkForm({
  sb, orgSlug, link, onClose, onSaved,
}: {
  sb: SupabaseClient;
  orgSlug: string;
  link: Link | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(link?.name ?? "");
  const [slug, setSlug] = useState(link?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(link));
  const [audience, setAudience] = useState<"community" | "public">(link?.audience ?? "community");
  const [from, setFrom] = useState(toLocalInput(link?.active_from ?? null));
  const [to, setTo] = useState(toLocalInput(link?.active_to ?? null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const { error } = await sb.rpc("upsert_distribution_link", {
      p_org_slug: orgSlug,
      p_id: link?.id ?? null,
      p_name: name,
      p_slug: slug || slugify(name),
      p_audience: audience,
      p_active_from: from ? new Date(from).toISOString() : null,
      p_active_to: to ? new Date(to).toISOString() : null,
    });
    setBusy(false);
    if (error) setError(error.message);
    else onSaved();
  }

  return (
    <div className="mt-3 rounded-lg border-2 border-ink bg-card p-4">
      <p className="font-mono text-[9px] uppercase tracking-wider text-muted">
        {link ? "Rename / reschedule link" : "New distribution link"}
      </p>
      <div className="mt-3 space-y-3">
        <div>
          <label className="font-mono text-[9px] uppercase tracking-wider text-muted">Name</label>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugTouched) setSlug(slugify(e.target.value));
            }}
            placeholder="Q3 youth camp"
            className="mt-1 w-full rounded-lg border border-rule px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="font-mono text-[9px] uppercase tracking-wider text-muted">Link URL</label>
          <div className="mt-1 flex items-center gap-1 text-sm text-slate">
            <span className="text-muted">jfindx.org/{orgSlug}/l/</span>
            <input
              value={slug}
              onChange={(e) => { setSlug(slugify(e.target.value)); setSlugTouched(true); }}
              className="flex-1 rounded-lg border border-rule px-2 py-1.5 text-sm"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="font-mono text-[9px] uppercase tracking-wider text-muted">Opens</label>
            <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)}
              className="mt-1 w-full rounded-lg border border-rule px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="font-mono text-[9px] uppercase tracking-wider text-muted">Closes</label>
            <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)}
              className="mt-1 w-full rounded-lg border border-rule px-2 py-1.5 text-sm" />
          </div>
        </div>
        <div>
          <label className="font-mono text-[9px] uppercase tracking-wider text-muted">Audience</label>
          <select value={audience} onChange={(e) => setAudience(e.target.value as "community" | "public")}
            className="mt-1 w-full rounded-lg border border-rule px-2 py-1.5 text-sm">
            <option value="community">Community — the young people you already reach</option>
            <option value="public">Open — anyone this link is shared with</option>
          </select>
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-vermillion">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button onClick={save} disabled={busy || !name.trim()}
          className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-paper disabled:opacity-50">
          {busy ? "Saving…" : link ? "Save changes" : "Create link"}
        </button>
        <button onClick={onClose} className="rounded-lg border border-rule px-4 py-2 text-sm text-slate">
          Cancel
        </button>
      </div>
    </div>
  );
}
