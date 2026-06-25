"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import { instrument, t } from "@/lib/instrument";

type Item = { key: string; domain: string; tier: string; mean: number | null; n: number };
type Dash = {
  org: { slug: string; name: string; verified: boolean };
  n: number;
  index: number | null;
  tiers: Record<string, number | null>;
  domains: Record<string, number | null>;
  matrix: Record<string, Record<string, number | null>>;
  items: Item[];
  trend?: { year: number; index: number }[] | null;
};

const TIERS = ["exposure", "response", "formation", "multiplication"];
const TIER_LABEL: Record<string, string> = {
  exposure: "Exposure", response: "Response", formation: "Formation", multiplication: "Multiplication",
};
const DOMAINS = ["follow", "mission", "world"];
const DOMAIN_LABEL: Record<string, string> = {
  follow: "Follow Jesus", mission: "Participate in mission", world: "World looks different",
};
const ITEM_LABEL: Record<string, string> = Object.fromEntries(
  instrument.items.map((i) => [i.key, t(i.text, "en")]),
);
const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "—" : String(n));
const green = (v: number | null) =>
  v === null || v === undefined ? "transparent" : `rgba(63,157,114,${Math.max(0.08, v / 100)})`;

export default function DashboardPage({ params }: { params: { org: string } }) {
  const slug = params.org;
  const sb = useMemo(() => getSupabaseBrowser(), []);
  const [email, setEmail] = useState("");
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [dash, setDash] = useState<Dash | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [needsClaim, setNeedsClaim] = useState(false);

  const load = useCallback(async () => {
    if (!sb) return;
    const { data: s } = await sb.auth.getSession();
    setAuthed(Boolean(s.session));
    if (!s.session) return;
    const { data, error } = await sb.rpc("org_dashboard", { p_org_slug: slug });
    if (error) { setNeedsClaim(true); } else { setDash(data as Dash); setNeedsClaim(false); }
  }, [sb, slug]);

  useEffect(() => { load(); }, [load]);

  async function signIn() {
    if (!sb || !email) return;
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: typeof window !== "undefined" ? window.location.href : undefined },
    });
    setMsg(error ? error.message : `Magic link sent to ${email}. Check your inbox.`);
  }

  async function claim() {
    if (!sb) return;
    const { data, error } = await sb.rpc("join_org_by_domain", { p_org_slug: slug });
    if (error) { setMsg(error.message); return; }
    const res = data as { ok: boolean; email_domain?: string; expected?: string };
    if (res.ok) { setMsg(null); load(); }
    else setMsg(`Your email domain (${res.email_domain}) doesn't match this ministry's domain (${res.expected}).`);
  }

  if (!sb)
    return <Shell slug={slug}><p className="text-sm text-slate">Supabase isn&apos;t configured yet.</p></Shell>;

  if (authed === false)
    return (
      <Shell slug={slug}>
        <h2 className="text-lg font-semibold">Ministry sign-in</h2>
        <p className="mt-1 text-sm text-slate">Use your <b>ministry email</b> (your organisation&apos;s website domain) so we can verify you.</p>
        <div className="mt-4 flex gap-2">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourministry.org"
            className="flex-1 rounded-lg border border-rule px-3 py-2 text-sm" />
          <button onClick={signIn} className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-paper">Send link</button>
        </div>
        {msg && <p className="mt-3 text-sm text-slate">{msg}</p>}
      </Shell>
    );

  if (needsClaim)
    return (
      <Shell slug={slug}>
        <h2 className="text-lg font-semibold">Verify your ministry</h2>
        <p className="mt-1 text-sm text-slate">You&apos;re signed in but not yet linked to <b>{slug}</b>. We check your email domain matches its website domain.</p>
        <button onClick={claim} className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">Verify &amp; claim access</button>
        {msg && <p className="mt-3 text-sm text-accent">{msg}</p>}
      </Shell>
    );

  return (
    <Shell slug={slug}>
      {!dash && <p className="text-sm text-slate">Loading…</p>}
      {dash && (
        <>
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-bold">{dash.org.name}</h2>
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
              {dash.n.toLocaleString()} responses {dash.org.verified ? "· verified" : ""}
            </span>
          </div>

          {/* index + journey funnel */}
          <div className="mt-4 grid gap-4 sm:grid-cols-[160px_1fr]">
            <div className="rounded-lg border border-rule bg-paper p-4">
              <div className="font-mono text-[9px] uppercase tracking-wider text-muted">Index score</div>
              <div className="mt-2 text-4xl font-bold text-accent">{fmt(dash.index)}</div>
            </div>
            <div className="rounded-lg border border-rule bg-paper p-4">
              <div className="font-mono text-[9px] uppercase tracking-wider text-muted">The journey</div>
              <div className="mt-2 space-y-1.5">
                {TIERS.map((tk) => (
                  <div key={tk} className="flex items-center gap-2 text-xs">
                    <span className="w-24 shrink-0 text-slate">{TIER_LABEL[tk]}</span>
                    <div className="h-2.5 flex-1 rounded bg-paper-deep">
                      <div className="h-full rounded" style={{ width: `${dash.tiers?.[tk] ?? 0}%`, background: tk === "multiplication" ? "#ff7a47" : "#3f9d72" }} />
                    </div>
                    <b className="w-7 text-right">{fmt(dash.tiers?.[tk])}</b>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* by question + matrix */}
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-rule bg-paper p-4">
              <div className="font-mono text-[9px] uppercase tracking-wider text-muted">By question</div>
              <div className="mt-3 space-y-2.5">
                {DOMAINS.map((dk) => (
                  <div key={dk} className="text-sm">
                    <div className="flex justify-between"><span>{DOMAIN_LABEL[dk]}</span><b>{fmt(dash.domains?.[dk])}</b></div>
                    <div className="mt-1 h-2 rounded bg-paper-deep"><div className="h-full rounded bg-bench" style={{ width: `${dash.domains?.[dk] ?? 0}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-rule bg-paper p-4">
              <div className="font-mono text-[9px] uppercase tracking-wider text-muted">Questions × tiers</div>
              <table className="mt-3 w-full border-separate border-spacing-1 text-center text-xs">
                <thead><tr><th /></tr></thead>
                <tbody>
                  {DOMAINS.map((dk) => (
                    <tr key={dk}>
                      <td className="text-left text-[11px]">{DOMAIN_LABEL[dk]}</td>
                      {TIERS.map((tk) => {
                        const v = dash.matrix?.[dk]?.[tk] ?? null;
                        return <td key={tk} className="rounded py-2 font-semibold" style={{ background: green(v), color: v !== null && v >= 55 ? "#fff" : "#22252b" }}>{fmt(v)}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* trend over waves */}
          {dash.trend && dash.trend.length > 1 && (
            <div className="mt-4 rounded-lg border border-rule bg-paper p-4">
              <div className="font-mono text-[9px] uppercase tracking-wider text-muted">Movement over time</div>
              <div className="mt-3 flex items-end gap-5">
                {dash.trend.map((p) => (
                  <div key={p.year} className="flex flex-col items-center gap-1">
                    <div className="text-xs font-bold">{p.index}</div>
                    <div className="w-10 rounded-t bg-moss" style={{ height: `${Math.max(6, (p.index / 100) * 90)}px` }} />
                    <div className="font-mono text-[10px] text-muted">{p.year}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* per-item table */}
          <div className="mt-4 rounded-lg border border-rule bg-paper p-4">
            <div className="font-mono text-[9px] uppercase tracking-wider text-muted">Per-question detail</div>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="text-left font-mono text-[9px] uppercase tracking-wider text-muted">
                  <th className="pb-2">Item</th><th className="pb-2">Tier</th><th className="pb-2 text-right">Mean</th><th className="pb-2 text-right">n</th>
                </tr>
              </thead>
              <tbody>
                {(dash.items || []).map((it) => (
                  <tr key={it.key} className="border-t border-rule">
                    <td className="py-1.5 pr-2">{ITEM_LABEL[it.key] || it.key}</td>
                    <td className="py-1.5 font-mono text-[10px] uppercase text-muted">{TIER_LABEL[it.tier] || it.tier}</td>
                    <td className="py-1.5 text-right font-semibold">{fmt(it.mean)}</td>
                    <td className="py-1.5 text-right font-mono text-[11px] text-muted">{it.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-6 font-mono text-[9px] uppercase tracking-wider text-muted">
            Aggregates only — never individual responses. Of those who completed the Index.
          </p>
        </>
      )}
    </Shell>
  );
}

function Shell({ slug, children }: { slug: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <div className="flex items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted">{slug} · org dashboard</div>
        <Link href="/intelligence" className="font-mono text-[10px] uppercase tracking-widest text-accent">Collab Intelligence →</Link>
      </div>
      <div className="mt-4 rounded-xl border border-rule bg-card p-6">{children}</div>
    </main>
  );
}
