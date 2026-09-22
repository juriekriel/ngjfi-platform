"use client";

/**
 * The org's own local landing page — "support custom, local landing pages
 * (e.g. for DFW) to foster a sense of belonging and provide relevant data"
 * (initial testing feedback, production-readiness round).
 *
 * Deliberately a SEPARATE route from /[org] (the survey itself). /[org]'s own
 * in-flow welcome screen (Survey.tsx, i === -1) is compact by design — it's
 * the first screen of a six-minute form, and has to get out of the way fast.
 * This page is the thing an organisation actually shares on social media, a
 * church bulletin, or a flyer: it can take its time, explain what the Index
 * is to someone who has never heard of it, and only THEN invite them in.
 *
 * Reads the same public organisations columns Survey.tsx already reads (RLS:
 * `select to anon, authenticated using (true)`, migration 0001 — none of
 * these columns are sensitive), so no new grant or RPC is needed. No score is
 * shown here: an org's own aggregate stays inside its authenticated
 * dashboard (CLAUDE.md non-negotiable #4) — publishing it on a public,
 * no-login page is a different decision the researchers/Collab haven't made,
 * so this page carries branding and belonging, not numbers.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import { RisingMark } from "@/components/site/Chrome";
import { J12Grid } from "@/components/index/Figures";

type Org = {
  name: string;
  logo_url: string | null;
  brand_color: string | null;
  country: string | null;
  region: string | null;
  welcome_message: string | null;
};

export default function OrgWelcomePage({ params }: { params: { org: string } }) {
  const slug = params.org;
  const sb = useMemo(() => getSupabaseBrowser(), []);
  const [org, setOrg] = useState<Org | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "no_org">("loading");

  useEffect(() => {
    if (!sb) return;
    (async () => {
      const { data } = await sb
        .from("organisations")
        .select("name,logo_url,brand_color,country,region,welcome_message")
        .eq("short_name", slug)
        .maybeSingle();
      if (!data) { setStatus("no_org"); return; }
      setOrg(data as Org);
      setStatus("ready");
    })();
  }, [sb, slug]);

  const brand = org?.brand_color || "#FF7A47";
  const orgName = org?.name || slug.charAt(0).toUpperCase() + slug.slice(1);
  const place = [org?.country, org?.region].filter(Boolean).join(" · ");

  if (status === "loading") {
    return (
      <main className="mx-auto max-w-2xl px-5 py-24 text-center">
        <p className="text-[14px] text-ink-2">Loading…</p>
      </main>
    );
  }

  if (status === "no_org") {
    return (
      <main className="mx-auto max-w-2xl px-5 py-24 text-center">
        <h1 className="text-[24px] leading-tight">This link doesn&apos;t go anywhere.</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
          There&apos;s no organisation at this address — check the link you were given.
        </p>
      </main>
    );
  }

  return (
    <>
      <header className="border-b border-rule">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-4 sm:px-8">
          {org?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={org.logo_url} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
          ) : (
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[16px] font-bold text-plate"
              style={{ background: brand }}
              aria-hidden="true"
            >
              {orgName.charAt(0)}
            </div>
          )}
          <div className="leading-tight">
            <p className="text-[16px] font-bold text-ink">{orgName}</p>
            {place && <p className="text-[12px] text-ink-2">{place}</p>}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 py-14 text-center">
        <h1 className="text-[34px] leading-[1.1] tracking-tight sm:text-[42px]">
          You&apos;re invited to share{" "}
          <span style={{ color: brand }}>where you&apos;re at</span>.
        </h1>
        <p className="mt-5 text-[17px] leading-relaxed text-ink-2">
          {org?.welcome_message ??
            `${orgName} is learning how to walk with young people as they follow Jesus. Your honest answers help — and they stay completely anonymous.`}
        </p>

        <Link
          href={`/${slug}`}
          className="mt-8 inline-block rounded-lg px-7 py-3.5 text-[15px] font-semibold text-plate no-underline"
          style={{ background: brand }}
        >
          Take the Index →
        </Link>
        <p className="mt-3 text-[13px] text-ink-2">About 6 minutes, on your phone. No name, no email.</p>

        <div className="mt-16 border-t border-rule pt-10 text-left">
          <div className="flex items-center gap-3">
            <RisingMark className="h-8 w-8 shrink-0" />
            <p className="text-[15px] font-semibold text-ink">What is the Jesus Index?</p>
          </div>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
            One shared instrument, run by hundreds of organisations like {orgName} around the world —
            three questions about faith, mission and lived impact, at four depths from first hearing
            the story to helping someone else believe it. {orgName}&apos;s own results stay private to
            their team; the pooled, anonymous picture is what lets the whole movement finally read the
            same scoreboard.
          </p>
          <div className="mt-6 flex justify-center">
            <J12Grid className="max-w-[220px]" />
          </div>
          <p className="mt-6 text-center">
            <Link href="/learn" className="text-[14px] font-semibold text-ink-2 no-underline hover:text-ink">
              Read more about the Index →
            </Link>
          </p>
        </div>
      </main>
    </>
  );
}
