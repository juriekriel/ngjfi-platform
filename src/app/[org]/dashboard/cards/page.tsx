"use client";

/**
 * Printable QR cards — /[org]/dashboard/cards?link=<room-slug>
 *
 * A sheet of cards a ministry prints and hands out or pins up at a camp:
 * its name and colour, one line of invitation, a QR code for exactly one
 * link (the whole house, or one room), the short address for people who
 * can't scan, and the two promises (about 7 minutes; anonymous). Printed
 * from the browser — A4 or US Letter, 1, 4 or 8 cards per sheet.
 *
 * QR codes are drawn on the device (QrCode.tsx). Room names show only for
 * signed-in members (they come from org_distribution_links); the card itself
 * works for anyone, because the link it prints is public by design.
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import QrCode from "@/components/index/QrCode";

type Org = { name: string; brand_color: string | null; logo_url: string | null };

export default function CardsPage({ params }: { params: { org: string } }) {
  return (
    <Suspense fallback={null}>
      <Cards org={params.org} />
    </Suspense>
  );
}

function Cards({ org: slug }: { org: string }) {
  const q = useSearchParams();
  const linkSlug = q.get("link");
  const audience = q.get("audience") === "public" ? "public" : "community";
  const sb = useMemo(() => getSupabaseBrowser(), []);
  const [org, setOrg] = useState<Org | null>(null);
  const [roomName, setRoomName] = useState<string | null>(null);
  const [perSheet, setPerSheet] = useState<1 | 4 | 8>(4);
  const [origin, setOrigin] = useState("https://jfindx.org");
  const [line, setLine] = useState("Share where you’re at.");

  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => {
    if (!sb) return;
    sb.from("organisations").select("name,brand_color,logo_url").eq("short_name", slug).maybeSingle().then(({ data }) => data && setOrg(data as Org));
    if (linkSlug)
      sb.rpc("org_distribution_links", { p_org_slug: slug }).then(({ data }) => {
        const l = (data as { slug: string; name: string }[] | null)?.find((x) => x.slug === linkSlug);
        if (l) setRoomName(l.name);
      });
  }, [sb, slug, linkSlug]);

  const url = linkSlug ? `${origin}/${slug}/l/${linkSlug}` : audience === "public" ? `${origin}/${slug}/open` : `${origin}/${slug}`;
  const short = url.replace(/^https?:\/\//, "");
  const brand = org?.brand_color && /^#[0-9a-fA-F]{6}$/.test(org.brand_color) ? org.brand_color : "#FF7A47";
  const name = org?.name ?? slug;
  const qr = perSheet === 1 ? 300 : perSheet === 4 ? 190 : 120;

  return (
    <main className="min-h-screen bg-paper-deep print:bg-white">
      <style>{`
        @page { size: auto; margin: 10mm; }
        @media print { .no-print { display: none !important; } .sheet { box-shadow: none !important; margin: 0 !important; } }
      `}</style>

      <div className="no-print mx-auto flex max-w-4xl flex-wrap items-end justify-between gap-4 px-5 py-6">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-wider text-ink-2">{name} · printable cards</p>
          <h1 className="mt-1 text-[24px] font-bold tracking-tight">{roomName ?? (linkSlug ? linkSlug : audience === "public" ? "Public link" : "Your survey")}</h1>
          <p className="mt-1 font-mono text-[12px] text-ink-2">{short}</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[12px] text-ink-2">
            Invitation line
            <input value={line} onChange={(e) => setLine(e.target.value)} maxLength={60} className="w-56 rounded-lg border border-rule-2 bg-plate px-3 py-2 text-[14px] text-ink" />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-ink-2">
            Cards per sheet
            <select value={perSheet} onChange={(e) => setPerSheet(Number(e.target.value) as 1 | 4 | 8)} className="rounded-lg border border-rule-2 bg-plate px-3 py-2 text-[14px] text-ink">
              <option value={1}>1 · poster</option>
              <option value={4}>4 · hand-outs</option>
              <option value={8}>8 · small cards</option>
            </select>
          </label>
          <button type="button" onClick={() => window.print()} className="rounded-lg bg-ink px-5 py-2.5 text-[14px] font-semibold text-paper">
            Print
          </button>
        </div>
      </div>

      <div className="sheet mx-auto mb-10 grid max-w-4xl gap-3 bg-white p-4 shadow-sm print:max-w-none print:gap-[4mm] print:p-0"
        style={{ gridTemplateColumns: perSheet === 1 ? "1fr" : "1fr 1fr" }}>
        {Array.from({ length: perSheet }).map((_, i) => (
          <article
            key={i}
            className="flex break-inside-avoid flex-col items-center justify-between rounded-2xl border-2 text-center"
            style={{
              borderColor: brand,
              padding: perSheet === 8 ? "10px 12px" : "20px 22px",
              minHeight: perSheet === 1 ? "250mm" : perSheet === 4 ? "125mm" : "62mm",
            }}
          >
            <div className="w-full">
              <div className="flex items-center justify-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-md text-[13px] font-bold text-white" style={{ background: brand }}>
                  {name.slice(0, 1)}
                </span>
                <span className={`${perSheet === 8 ? "text-[13px]" : "text-[16px]"} font-bold`}>{name}</span>
              </div>
              <p className={`${perSheet === 1 ? "mt-6 text-[34px]" : perSheet === 4 ? "mt-3 text-[21px]" : "mt-1.5 text-[14px]"} font-bold leading-tight tracking-tight`}>
                {line}
              </p>
            </div>
            <div className="my-2">
              <QrCode value={url} size={qr} label={`QR code for ${short}`} />
            </div>
            <div className="w-full">
              <p className={`${perSheet === 8 ? "text-[10px]" : "text-[13px]"} font-mono font-medium`}>{short}</p>
              <p className={`${perSheet === 8 ? "text-[9px]" : "text-[12px]"} mt-1 text-ink-2`}>About 7 minutes · anonymous · works offline</p>
              {perSheet !== 8 && <p className="mt-2 font-mono text-[9px] uppercase tracking-wider text-muted">powered by The Index · jfindx.org</p>}
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
