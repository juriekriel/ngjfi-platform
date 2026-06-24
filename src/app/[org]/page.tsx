"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import { orderedItems, t, type InstrumentItem, type Locale } from "@/lib/instrument";

type Org = {
  id: string;
  slug: string;
  name: string;
  brand_color: string | null;
  country: string | null;
};

const LIKERT = ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"];

export default function SurveyPage({ params }: { params: { org: string } }) {
  const slug = params.org;
  const locale: Locale = "en";
  const items = useMemo(() => orderedItems(), []);
  const steps = items.length;

  const sb = useMemo(() => getSupabaseBrowser(), []);
  const [org, setOrg] = useState<Org | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [i, setI] = useState(-1); // -1 = welcome, >= steps = done
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const brand = org?.brand_color || "#e0742f";
  const orgName = org?.name || slug.charAt(0).toUpperCase() + slug.slice(1);

  useEffect(() => {
    (async () => {
      if (!sb) return;
      const { data: o } = await sb
        .from("organisations")
        .select("id,slug,name,brand_color,country")
        .eq("slug", slug)
        .maybeSingle();
      if (!o) return;
      setOrg(o as Org);
      const { data: c } = await sb
        .from("campaigns")
        .select("id")
        .eq("org_id", (o as Org).id)
        .eq("slug", "default")
        .eq("active", true)
        .maybeSingle();
      if (c) setCampaignId(c.id as string);
    })();
  }, [sb, slug]);

  async function begin() {
    setError(null);
    if (sb && campaignId) {
      const { data, error } = await sb.rpc("start_session", {
        p_campaign_id: campaignId,
        p_locale: locale,
      });
      if (error) setError("Could not start the session — check Supabase setup.");
      else setSessionId(data as string);
    }
    setI(0);
  }

  async function choose(value: unknown) {
    const item = items[i];
    setAnswers((a) => ({ ...a, [item.key]: value }));
    if (sb && sessionId) {
      setBusy(true);
      const { error } = await sb.rpc("save_response", {
        p_session_id: sessionId,
        p_item_key: item.key,
        p_raw: value,
      });
      setBusy(false);
      if (error) {
        setError("Could not save that answer.");
        return;
      }
    }
    const next = i + 1;
    if (next >= steps && sb && sessionId) {
      await sb.rpc("finish_session", { p_session_id: sessionId });
    }
    setI(next);
  }

  const pct = i < 0 ? 0 : Math.round((Math.min(i, steps) / steps) * 100);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col px-4 py-6">
      {/* brand header */}
      <div className="rounded-t-2xl px-6 py-5 text-white" style={{ background: brand }}>
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-lg font-black"
            style={{ color: brand }}
          >
            {orgName.charAt(0)}
          </div>
          <div>
            <div className="font-semibold leading-tight">{orgName}</div>
            <div className="text-xs opacity-90">{org?.country || "Powered by the Index"}</div>
          </div>
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded bg-white/30">
          <div className="h-full bg-white transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="flex-1 rounded-b-2xl bg-card p-6 shadow-sm">
        {!sb && (
          <p className="mb-4 rounded bg-paper-deep px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-muted">
            Preview mode — Supabase not configured; answers won&apos;t be saved.
          </p>
        )}
        {error && <p className="mb-4 text-sm text-accent">{error}</p>}

        {i < 0 && (
          <div>
            <h1 className="text-2xl font-bold leading-tight">
              You&apos;re invited to share <span style={{ color: brand }}>where you&apos;re at</span>.
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate">
              {orgName} is learning how to walk with young people as they follow Jesus.
              Your honest answers help. It takes about 6 minutes and is completely anonymous.
            </p>
            <button
              onClick={begin}
              className="mt-6 rounded-lg px-6 py-3 font-semibold text-white"
              style={{ background: brand }}
            >
              Begin →
            </button>
          </div>
        )}

        {i >= 0 && i < steps && (
          <Question
            item={items[i]}
            locale={locale}
            brand={brand}
            busy={busy}
            selected={answers[items[i].key]}
            onChoose={choose}
            onBack={i > 0 ? () => setI(i - 1) : undefined}
            stepLabel={`Question ${i + 1} of ${steps}`}
          />
        )}

        {i >= steps && (
          <div className="py-6 text-center">
            <div
              className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full text-3xl text-white"
              style={{ background: brand }}
            >
              ✓
            </div>
            <h2 className="text-xl font-bold">Thank you!</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-slate">
              Your response has been added to {orgName}&apos;s picture of how their community is
              following Jesus. They only ever see grouped results, never individual answers.
            </p>
          </div>
        )}
      </div>

      <p className="mt-3 text-center font-mono text-[9px] uppercase tracking-widest text-muted">
        Powered by the Next Gen Jesus-Following Index
      </p>
    </main>
  );
}

function Question({
  item,
  locale,
  brand,
  busy,
  selected,
  onChoose,
  onBack,
  stepLabel,
}: {
  item: InstrumentItem;
  locale: Locale;
  brand: string;
  busy: boolean;
  selected: unknown;
  onChoose: (v: unknown) => void;
  onBack?: () => void;
  stepLabel: string;
}) {
  const optBtn = "w-full rounded-xl border-2 px-4 py-3 text-left text-sm transition";
  const isSel = (v: unknown) => selected === v;
  const style = (v: unknown) =>
    isSel(v) ? { borderColor: brand, background: `${brand}1a` } : { borderColor: "#e6e8ec" };

  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-widest" style={{ color: brand }}>
        {stepLabel}
      </div>
      <h2 className="mb-5 mt-2 text-xl font-medium leading-snug">{t(item.text, locale)}</h2>

      {item.type === "likert_5" && (
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              disabled={busy}
              onClick={() => onChoose(n)}
              className="flex-1 rounded-xl border-2 py-3 text-center"
              style={style(n)}
            >
              <span className="block text-lg font-bold">{n}</span>
              <span className="mt-1 block text-[8px] uppercase leading-tight text-muted">
                {LIKERT[n - 1]}
              </span>
            </button>
          ))}
        </div>
      )}

      {item.type === "yes_no" && (
        <div className="flex flex-col gap-2">
          {["yes", "no"].map((v) => (
            <button key={v} disabled={busy} onClick={() => onChoose(v)} className={optBtn} style={style(v)}>
              {v === "yes" ? "Yes" : "No"}
            </button>
          ))}
        </div>
      )}

      {(item.type === "single_select" || item.type === "frequency") && (
        <div className="flex flex-col gap-2">
          {(item.options || []).map((o) => (
            <button
              key={String(o.value)}
              disabled={busy}
              onClick={() => onChoose(o.value)}
              className={optBtn}
              style={style(o.value)}
            >
              {t(o.text, locale)}
            </button>
          ))}
        </div>
      )}

      {onBack && (
        <button onClick={onBack} className="mt-5 text-xs text-muted hover:text-ink">
          ← Back
        </button>
      )}
    </div>
  );
}
