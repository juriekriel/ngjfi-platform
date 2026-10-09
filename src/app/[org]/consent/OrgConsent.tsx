"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import PrintControls from "@/components/site/PrintControls";
import ConsentResource, { CONSENT_RESOURCE_VERSION } from "@/content/consent/ConsentResource";
import { RisingMark } from "@/components/site/Chrome";

type Brand = { name: string; logo_url: string | null; brand_color: string | null };

/**
 * White-label: the organisation's name, logo and colour on top, its name in
 * the materials ([Organisation name] pre-filled). The Index sits in the
 * footer (non-negotiable #4). Public brand fields only — the same ones the
 * survey link already shows.
 */
export default function OrgConsent({ slug }: { slug: string }) {
  const sb = useMemo(() => getSupabaseBrowser(), []);
  const [brand, setBrand] = useState<Brand | null>(null);
  useEffect(() => {
    if (!sb) return;
    sb.from("organisations").select("name,logo_url,brand_color").eq("short_name", slug).maybeSingle()
      .then(({ data }) => data && setBrand(data as Brand));
  }, [sb, slug]);

  const colour = brand?.brand_color ?? "#22252b";
  return (
    <>
      <header className="no-print text-white" style={{ background: colour }}>
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-5 py-4">
          {brand?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logo_url} alt="" className="h-10 w-10 rounded-full bg-white object-contain" />
          ) : (
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-lg font-black" style={{ color: colour }}>
              {(brand?.name ?? slug).charAt(0).toUpperCase()}
            </span>
          )}
          <span className="text-[17px] font-semibold">{brand?.name ?? ""}</span>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-5 py-8">
        <p className="figcap">Consent · version {CONSENT_RESOURCE_VERSION} · draft for review</p>
        <h1 className="mt-2 text-[30px] leading-tight tracking-tight">Consent: why it matters and how it works</h1>
        <div className="mt-5"><PrintControls /></div>
        <div className="mt-6"><ConsentResource orgName={brand?.name} accent={brand?.brand_color ?? undefined} /></div>
      </main>
      <footer className="no-print border-t border-rule">
        <div className="mx-auto flex max-w-4xl items-center gap-2 px-5 py-5 text-[12.5px] text-ink-2">
          <RisingMark className="h-4 w-4" /> Powered by the Jesus-Following Index · jfindx.org
        </div>
      </footer>
    </>
  );
}
