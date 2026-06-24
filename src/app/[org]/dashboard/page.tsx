"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";

type Dash = {
  org: { slug: string; name: string; verified: boolean };
  n: number;
  index: number | null;
  tiers: Record<string, number | null>;
  domains: Record<string, number | null>;
};

const TIER_ORDER = ["exposure", "response", "formation", "multiplication"];
const DOMAIN_LABEL: Record<string, string> = {
  follow: "Follow Jesus",
  mission: "Participate in mission",
  world: "World looks different",
};

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
    if (error) {
      setNeedsClaim(true);
      setMsg(null);
    } else {
      setDash(data as Dash);
      setNeedsClaim(false);
    }
  }, [sb, slug]);

  useEffect(() => {
    load();
  }, [load]);

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
    if (error) {
      setMsg(error.message);
      return;
    }
    const res = data as { ok: boolean; reason?: string; expected?: string; email_domain?: string };
    if (res.ok) {
      setMsg(null);
      load();
    } else {
      setMsg(
        `Your email domain (${res.email_domain}) doesn't match this ministry's website domain (${res.expected}). Sign in with an address at ${res.expected}.`,
      );
    }
  }

  if (!sb) {
    return (
      <Shell slug={slug}>
        <p className="text-sm text-slate">Supabase isn&apos;t configured yet — set the env vars to enable the dashboard.</p>
      </Shell>
    );
  }

  if (authed === false) {
    return (
      <Shell slug={slug}>
        <h2 className="text-lg font-semibold">Ministry sign-in</h2>
        <p className="mt-1 text-sm text-slate">
          Use your <b>ministry email</b> (at your organisation&apos;s website domain) so we can verify you.
        </p>
        <div className="mt-4 flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@yourministry.org"
            className="flex-1 rounded-lg border border-rule px-3 py-2 text-sm"
          />
          <button onClick={signIn} className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-paper">
            Send link
          </button>
        </div>
        {msg && <p className="mt-3 text-sm text-slate">{msg}</p>}
      </Shell>
    );
  }

  if (needsClaim) {
    return (
      <Shell slug={slug}>
        <h2 className="text-lg font-semibold">Verify your ministry</h2>
        <p className="mt-1 text-sm text-slate">
          You&apos;re signed in, but not yet linked to <b>{slug}</b>. Confirm you belong to this
          ministry — we check that your email domain matches its website domain.
        </p>
        <button onClick={claim} className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">
          Verify &amp; claim access
        </button>
        {msg && <p className="mt-3 text-sm text-accent">{msg}</p>}
      </Shell>
    );
  }

  return (
    <Shell slug={slug}>
      {!dash && <p className="text-sm text-slate">Loading…</p>}
      {dash && (
        <>
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-bold">{dash.org.name}</h2>
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
              {dash.n} responses {dash.org.verified ? "· verified" : ""}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card label="Index score" value={fmt(dash.index)} big />
            {TIER_ORDER.map((tk) => (
              <Card key={tk} label={cap(tk)} value={fmt(dash.tiers?.[tk] ?? null)} />
            ))}
          </div>

          <h3 className="mt-8 font-mono text-[10px] uppercase tracking-widest text-muted">By question</h3>
          <div className="mt-3 space-y-3">
            {Object.keys(DOMAIN_LABEL).map((dk) => {
              const v = dash.domains?.[dk] ?? null;
              return (
                <div key={dk}>
                  <div className="flex justify-between text-sm">
                    <span>{DOMAIN_LABEL[dk]}</span>
                    <b>{fmt(v)}</b>
                  </div>
                  <div className="mt-1 h-2 rounded bg-paper-deep">
                    <div className="h-full rounded bg-accent" style={{ width: `${v ?? 0}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-8 font-mono text-[9px] uppercase tracking-wider text-muted">
            Of those who completed the Index — never a whole population.
          </p>
        </>
      )}
    </Shell>
  );
}

function Shell({ slug, children }: { slug: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted">
        {slug} · org dashboard
      </div>
      <div className="mt-4 rounded-xl border border-rule bg-card p-6">{children}</div>
    </main>
  );
}

function Card({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="rounded-lg border border-rule bg-paper p-4">
      <div className="font-mono text-[9px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`mt-2 font-bold ${big ? "text-4xl text-accent" : "text-2xl"}`}>{value}</div>
    </div>
  );
}

const fmt = (n: number | null) => (n === null || n === undefined ? "—" : String(n));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
