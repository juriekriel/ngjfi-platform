"use client";

/**
 * "Your Organisation" — the tab that used to be the homepage's "What you get
 * out of it" section, now with somewhere of its own to live and a second job:
 * once you're signed in, it's your entry point straight to your own
 * dashboard(s), instead of another explainer you already know.
 *
 * Signed-in state is read from my_context() (0014, extended in 0031 to carry
 * each org's URL slug) — the same round trip the internal /build console
 * uses to route itself. A visitor can belong to more than one organisation
 * (a network admin, say), so this renders one card per org rather than
 * assuming exactly one.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import { TIER_TINT, fig } from "@/lib/model";

type MyOrg = { slug: string; short_name: string; name: string; is_demo: boolean };
type Context = { signed_in: boolean; email?: string; orgs?: MyOrg[] };
type MiniDash = { n: number; index: number | null; suppressed?: boolean };

const CARDS = [
  {
    n: "01",
    h: "A diagnosis, not a grade",
    p: "Not “how are we doing” but exactly where your people stop moving — belief, practice, or reproduction. Three different problems needing three different responses.",
    tier: "exposure",
  },
  {
    n: "02",
    h: "Yours, under your name",
    p: "Your logo, your colour, your words, your consent process. To a young person it is their youth group asking — because it is. The Index sits in the footer.",
    tier: "response",
  },
  {
    n: "03",
    h: "Benchmarked, not isolated",
    p: "The same twelve questions everywhere means your number finally means something next to your country and the globe.",
    tier: "formation",
  },
  {
    n: "04",
    h: "Proof that it moved",
    p: "Run it again next season and the same figure tells you whether what you changed actually worked. Width and time — not depth.",
    tier: "multiplication",
  },
] as const;

export default function OrganisationView() {
  const sb = useMemo(() => getSupabaseBrowser(), []);
  const [ctx, setCtx] = useState<Context | null>(null);

  useEffect(() => {
    if (!sb) { setCtx({ signed_in: false }); return; }
    (async () => {
      const { data, error } = await sb.rpc("my_context");
      setCtx(error ? { signed_in: false } : (data as Context));
    })();
  }, [sb]);

  if (ctx?.signed_in && ctx.orgs && ctx.orgs.length > 0) {
    return <SignedIn orgs={ctx.orgs} email={ctx.email} />;
  }

  return <SignedOut loading={ctx === null} />;
}

function SignedIn({ orgs, email }: { orgs: MyOrg[]; email?: string }) {
  return (
    <section className="py-10">
      <p className="figcap">Signed in{email ? ` · ${email}` : ""}</p>
      <h1 className="mt-3 text-[34px] leading-[1.05] tracking-tight sm:text-[40px]">
        Welcome back.
      </h1>
      <p className="mt-4 max-w-measure text-[16px] leading-relaxed text-ink-2">
        {orgs.length === 1
          ? "Straight through to your dashboard."
          : "You belong to more than one organisation here — pick one."}
      </p>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        {orgs.map((o) => (
          <OrgCard key={o.slug} org={o} />
        ))}
      </div>
    </section>
  );
}

function OrgCard({ org }: { org: MyOrg }) {
  const sb = useMemo(() => getSupabaseBrowser(), []);
  const [d, setD] = useState<MiniDash | null>(null);

  useEffect(() => {
    if (!sb) return;
    (async () => {
      const rpc = org.is_demo ? "org_dashboard_demo" : "org_dashboard";
      const { data, error } = await sb.rpc(rpc, { p_org_slug: org.slug });
      if (!error) setD(data as MiniDash);
    })();
  }, [sb, org.slug, org.is_demo]);

  return (
    <Link
      href={`/${org.slug}/dashboard`}
      className="flex flex-col justify-between rounded-xl border border-rule bg-plate p-5 no-underline shadow-sm hover:border-ink"
    >
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[19px] text-ink">{org.name}</h2>
          {org.is_demo && <span className="figcap text-muted">Sandbox</span>}
        </div>
        <p className="mt-3 flex items-baseline gap-2">
          <span className="tabular text-[36px] leading-none text-ink">
            {d ? (d.suppressed ? "—" : fig(d.index)) : "…"}
          </span>
          <span className="figcap">index</span>
        </p>
        <p className="tabular mt-1 text-[11px] uppercase tracking-[0.12em] text-ink-2">
          {d ? `n = ${d.n.toLocaleString()}` : "loading…"}
        </p>
      </div>
      <p className="mt-5 text-[14px] font-semibold text-emerald">Open dashboard →</p>
    </Link>
  );
}

function SignedOut({ loading }: { loading: boolean }) {
  return (
    <>
      <section className="grid gap-10 border-b border-ink py-10 md:grid-cols-[1.3fr_1fr] md:gap-14">
        <div>
          <p className="figcap">For organisations and churches</p>
          <h1 className="mt-3 text-[36px] leading-[1.05] tracking-tight sm:text-[44px]">
            What your organisation gets out of it.
          </h1>
          <p className="mt-5 max-w-measure text-[17px] leading-relaxed">
            Run the Index under your own name and you get back a diagnosis, not a grade —
            benchmarked against your country and the world, the same day, for free, permanently.
          </p>
        </div>
        <aside className="self-end">
          <p className="margin-note border-l-2 border-emerald pl-3">
            Already running the Index? Sign in from the dashboard link your organisation was set up
            with. {loading ? "Checking…" : "Not signed in right now."}
          </p>
        </aside>
      </section>

      <section className="py-12">
        <div className="grid gap-x-9 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {CARDS.map((c) => (
            <div key={c.n}>
              <div
                className="flex h-[74px] items-end rounded-xl p-3"
                style={{ background: TIER_TINT[c.tier].bg, color: TIER_TINT[c.tier].fg }}
              >
                <span className="tabular text-[26px] leading-none">{c.n}</span>
              </div>
              <h3 className="mt-3 text-[19px] leading-snug">{c.h}</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{c.p}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t-2 border-ink py-12">
        <h2 className="text-[24px] leading-tight">Before you ask</h2>
        <dl className="mt-6 grid gap-x-10 gap-y-6 md:grid-cols-2">
          {[
            ["Is this free?", "Running the Index is free, and it stays free. Your standard report is free. Advanced reports and consulting are paid — and free for Collab members."],
            ["Who owns our data?", "You do. You run the Index under your own brand, with your own consent process, and your results are yours to keep."],
            ["Can anyone see our results?", "No. Only your team, after verifying with your ministry's email domain. No other organisation sees your numbers, and you never see individual responses — only aggregates."],
            ["How do you handle under-18s?", "Consent, including parental consent, is handled by your organisation, locally, under your own rules. We never hold identifiable data about a minor centrally."],
          ].map(([q, a]) => (
            <div key={q} className="border-t border-rule pt-3">
              <dt className="text-[17px] leading-snug">{q}</dt>
              <dd className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="border-t-2 border-ink py-12">
        <div className="grid items-end gap-8 md:grid-cols-[1.4fr_1fr]">
          <div>
            <h2 className="text-[28px] leading-tight">Ready to bring your organisation in?</h2>
            <p className="mt-3 max-w-measure text-[16px] leading-relaxed text-ink-2">
              We open in small groups, country by country, so each one reaches the sample size a
              benchmark needs.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <Link
              href="/join"
              className="rounded-lg border-2 border-emerald bg-emerald px-5 py-3 text-center text-[14px] font-semibold text-plate no-underline hover:bg-emerald-deep"
            >
              Join the Index →
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
