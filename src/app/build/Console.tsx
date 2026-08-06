"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import { Colophon, Masthead } from "@/components/site/Chrome";
import { Plate } from "@/components/index/Figures";

type Worklist = {
  access_requests: { id: string; email: string; reason: string | null; created_at: string }[];
  people: { email: string; role: string }[];
  organisations: {
    short_name: string; name: string; country: string | null;
    verified: boolean; has_brand: boolean; campaigns: number; responses: number;
  }[];
  clusters: { country: string; completions: number; orgs: number }[];
  instrument: { version: string; status: string; items: number } | null;
  settings: Record<string, unknown>;
  spaces: {
    live: { orgs: number; sessions: number; responses: number };
    demo: { orgs: number; sessions: number; responses: number };
    gate: number;
    global_view_published: boolean;
  };
};

export default function Console() {
  const sb = useMemo(() => getSupabaseBrowser(), []);
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [wl, setWl] = useState<Worklist | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    if (!sb) { setErr("Supabase isn't configured."); setReady(true); return; }

    const { data: s } = await sb.auth.getSession();
    if (!s.session) { setReady(true); return; }
    setEmail(s.session.user.email ?? null);

    const { data: r } = await sb.rpc("my_role");
    setRole((r as string) ?? "org");

    if (r === "admin") {
      const { data, error } = await sb.rpc("admin_worklist");
      if (error) setErr(error.message);
      else setWl(data as Worklist);
    }
    setReady(true);
  }, [sb]);

  useEffect(() => { load(); }, [load]);

  async function decide(id: string, decision: "approved" | "declined") {
    if (!sb) return;
    await sb.rpc("decide_access_request", { p_id: id, p_decision: decision });
    load();
  }

  /* ── not signed in ─────────────────────────────────────────────────── */
  if (ready && !email)
    return (
      <Shell tier="">
        <Plate label="Not signed in" figure="">
          <p className="mt-1 max-w-measure text-[16px] leading-relaxed text-ink-2">
            The Index is the working engine behind jfindx.org. It needs a ministry email and a
            one-time sign-in link.
          </p>
          <Link
            href="/access"
            className="tabular mt-5 inline-block border-2 border-ink bg-ink px-5 py-3 text-[11px] uppercase tracking-[0.14em] text-paper no-underline"
          >
            Sign in →
          </Link>
        </Plate>
      </Shell>
    );

  /* ── signed in, awaiting a tier ────────────────────────────────────── */
  if (ready && email && role !== "admin")
    return (
      <Shell tier={role === "collab" ? "Collab" : "Organisation"}>
        <Plate label="Signed in" figure={email}>
          <p className="mt-1 max-w-measure text-[16px] leading-relaxed text-ink-2">
            You&apos;re signed in as <b>{email}</b>, at the{" "}
            <b>{role === "collab" ? "Collab" : "organisation"}</b> tier.
          </p>
          <p className="mt-3 max-w-measure text-[16px] leading-relaxed text-ink-2">
            The surface for your tier is still being built. Access is granted deliberately rather
            than automatically — if you&apos;re expecting administrator rights, ask Jurie or Ulrich
            to set them and reload this page.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/tour" className="tabular border border-ink px-4 py-2.5 text-[11px] uppercase tracking-[0.14em] text-ink no-underline">
              The walkthrough →
            </Link>
            <Link href="/demo" className="tabular border border-rule px-4 py-2.5 text-[11px] uppercase tracking-[0.14em] text-ink-2 no-underline">
              The sandbox →
            </Link>
          </div>
        </Plate>
      </Shell>
    );

  /* ── administrator ─────────────────────────────────────────────────── */
  return (
    <Shell tier="Administrator">
      {!ready && <p className="text-[15px] text-muted">Loading…</p>}
      {err && <p className="text-[15px] leading-relaxed text-vermillion">{err}</p>}

      {wl && (
        <div className="space-y-10">
          {/* what is waiting on a person */}
          <Plate label="Waiting on you" figure={`${wl.access_requests.length} request${wl.access_requests.length === 1 ? "" : "s"}`}>
            {wl.access_requests.length === 0 ? (
              <p className="text-[15px] text-ink-2">Nothing pending. Nobody is blocked on you.</p>
            ) : (
              <ul className="divide-y divide-rule">
                {wl.access_requests.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-[16px]">{a.email}</p>
                      {a.reason && <p className="margin-note mt-0.5">{a.reason}</p>}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => decide(a.id, "approved")}
                        className="tabular border-2 border-emerald bg-emerald px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-plate">
                        Approve
                      </button>
                      <button onClick={() => decide(a.id, "declined")}
                        className="tabular border border-rule px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-ink-2">
                        Decline
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="margin-note mt-3 border-l-2 border-rule pl-3">
              Approving records the decision. It does not grant a tier — that stays a separate,
              deliberate act, so nobody becomes an administrator as a side effect of clearing a queue.
            </p>
          </Plate>

          {/* the data spaces, verified live */}
          <Plate label="Data spaces" figure="verified live">
            <table className="w-full text-left">
              <thead>
                <tr className="figcap">
                  <th className="border-b border-ink pb-2 font-normal">Space</th>
                  <th className="border-b border-ink pb-2 text-right font-normal">Orgs</th>
                  <th className="border-b border-ink pb-2 text-right font-normal">Sessions</th>
                  <th className="border-b border-ink pb-2 text-right font-normal">Responses</th>
                </tr>
              </thead>
              <tbody>
                {(["live", "demo"] as const).map((k) => (
                  <tr key={k} className="border-b border-rule">
                    <th scope="row" className="py-2.5 text-left text-[15px] font-normal">
                      {k === "live" ? "Live" : "Sandbox"}
                      <span className="ml-2 italic text-muted">
                        {k === "live" ? "published" : "never published"}
                      </span>
                    </th>
                    <td className="tabular py-2.5 text-right text-[15px]">{wl.spaces[k].orgs.toLocaleString()}</td>
                    <td className="tabular py-2.5 text-right text-[15px]">{wl.spaces[k].sessions.toLocaleString()}</td>
                    <td className="tabular py-2.5 text-right text-[15px]">{wl.spaces[k].responses.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="margin-note mt-3">
              Gate: <b>{wl.spaces.gate}</b> completions before a geography is named.
              Global view {wl.spaces.global_view_published ? "published" : "not published"}.
              {" "}Instrument{" "}
              <b>{wl.instrument ? `${wl.instrument.version} · ${wl.instrument.items} items` : "not loaded"}</b>.
            </p>
          </Plate>

          {/* organisations */}
          <Plate label="Organisations" figure={`${wl.organisations.length} live`}>
            {wl.organisations.length === 0 ? (
              <p className="text-[15px] text-ink-2">
                None yet. The first real organisation arrives through the waitlist — until then the
                live space stays empty on purpose.
              </p>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="figcap">
                    <th className="border-b border-ink pb-2 font-normal">Organisation</th>
                    <th className="border-b border-ink pb-2 font-normal">Link</th>
                    <th className="border-b border-ink pb-2 text-right font-normal">Responses</th>
                  </tr>
                </thead>
                <tbody>
                  {wl.organisations.map((o) => (
                    <tr key={o.short_name} className="border-b border-rule">
                      <td className="py-2.5 text-[15px]">
                        {o.name}
                        {!o.has_brand && <span className="margin-note ml-2">needs branding</span>}
                      </td>
                      <td className="tabular py-2.5 text-[12px] text-ink-2">jfindx.org/{o.short_name}</td>
                      <td className="tabular py-2.5 text-right text-[15px]">{o.responses.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Plate>

          {/* clusters — the number that steers effort */}
          <Plate label="Clusters" figure="concentration, not volume">
            {wl.clusters.length === 0 ? (
              <p className="text-[15px] text-ink-2">
                No completions yet. Coverage beats count: the same sixty organisations spread across
                forty countries unlocks nothing, and concentrated in ten unlocks all ten.
              </p>
            ) : (
              <ul className="divide-y divide-rule">
                {wl.clusters.map((c) => (
                  <li key={c.country} className="flex items-baseline justify-between gap-4 py-2.5">
                    <span className="text-[15px]">{c.country}</span>
                    <span className="tabular text-[13px] text-ink-2">
                      {c.completions.toLocaleString()} / {wl.spaces.gate}
                      {c.completions >= wl.spaces.gate ? (
                        <span className="ml-2 text-emerald">unlocked</span>
                      ) : (
                        <span className="ml-2 text-muted">{wl.spaces.gate - c.completions} to go</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Plate>

          {/* people */}
          <Plate label="People" figure={`${wl.people.length}`}>
            <ul className="divide-y divide-rule">
              {wl.people.map((p) => (
                <li key={p.email} className="flex items-baseline justify-between gap-4 py-2">
                  <span className="text-[15px]">{p.email}</span>
                  <span className="tabular text-[10px] uppercase tracking-[0.14em] text-muted">{p.role}</span>
                </li>
              ))}
            </ul>
            <p className="margin-note mt-3 border-l-2 border-rule pl-3">
              Tiers are changed with <span className="tabular">set_user_role()</span>, which refuses
              unless you are already an administrator and refuses to change your own — so one
              compromised session cannot promote itself or lock the others out.
            </p>
          </Plate>
        </div>
      )}
    </Shell>
  );
}

function Shell({ tier, children }: { tier: string; children: React.ReactNode }) {
  return (
    <>
      <Masthead edition={`The Index${tier ? ` · ${tier}` : ""} · working engine · not public`} />
      <main className="mx-auto max-w-5xl px-5 py-10">
        <div className="border-b border-ink pb-4">
          <p className="figcap">The engine</p>
          <h1 className="mt-2 text-[34px] leading-tight">
            The <span className="italic">Index</span>
            {tier && <span className="text-ink-2"> · {tier}</span>}
          </h1>
          <p className="mt-2 max-w-measure text-[15px] leading-relaxed text-ink-2">
            A worklist, not a dashboard. What is on this page is what is waiting on a person.
          </p>
          <Link
            href="/build/wireframes"
            className="tabular mt-4 inline-block border border-rule-2 px-3.5 py-2 text-[10px] uppercase tracking-[0.14em] text-ink-2 no-underline hover:border-ink hover:text-ink"
          >
            The console spec — all four tiers →
          </Link>
        </div>
        <div className="mt-8">{children}</div>
      </main>
      <Colophon />
    </>
  );
}
