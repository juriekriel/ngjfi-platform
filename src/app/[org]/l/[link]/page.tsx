"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import Survey from "@/components/survey/Survey";
import { usePhoneLang } from "@/lib/i18n";

type Resolved = {
  name: string;
  /** The survey version this link fields (0044); null = the organisation's own setting. */
  item_set?: string | null;
  active_from: string | null;
  active_to: string | null;
  is_open: boolean;
  /** 0042: test links run before consent is attested (answers go to test tables). */
  is_test?: boolean;
};

/**
 * jfindx.org/<org>/l/<link> — a distribution link ("room"), migration 0028.
 *
 * Same instrument, same screens as /<org> — a link tags which door a
 * respondent came through, so an org can see where a batch of responses came
 * from. It may field a shorter version (e.g. J12 only, migration 0044), which
 * leaves out the optional insight questions but never changes a scored one.
 */
export default function DistributionLinkPage({ params }: { params: { org: string; link: string } }) {
  const sb = useMemo(() => getSupabaseBrowser(), []);
  const [resolved, setResolved] = useState<Resolved | null | "not_found">(null);
  const lang = usePhoneLang();

  useEffect(() => {
    if (!sb) return;
    sb.rpc("resolve_distribution_link", { p_org_slug: params.org, p_link_slug: params.link }).then(
      ({ data, error }) => setResolved(error ? "not_found" : (data as Resolved)),
    );
  }, [sb, params.org, params.link]);

  if (!sb)
    return <Centered>Supabase isn&apos;t configured yet.</Centered>;

  if (resolved === null)
    return <Centered>{lang.ui("loading")}</Centered>;

  if (resolved === "not_found")
    return <Centered>{lang.ui("link_missing")}</Centered>;

  if (!resolved.is_open)
    return (
      <Centered>
        <p className="text-lg font-semibold text-ink">{resolved.name}</p>
        <p className="mt-2 text-sm text-slate">
          {resolved.active_from && new Date(resolved.active_from) > new Date()
            ? lang.ui("link_not_open")
            : lang.ui("link_closed")}
        </p>
      </Centered>
    );

  return <Survey slug={params.org} linkItemSet={resolved.item_set ?? null} distributionLinkSlug={params.link} isTestLink={Boolean(resolved.is_test)} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center px-6 text-center">
      {children}
    </main>
  );
}
