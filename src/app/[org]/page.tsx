"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import {
  instrument,
  nextVisibleIndex,
  orderedItems,
  orphanedAnswers,
  prevVisibleIndex,
  t,
  visibleItems,
  type AnswerValue,
  type InstrumentItem,
  type Locale,
} from "@/lib/instrument";

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
  const [itemSet, setItemSet] = useState<"full" | "core">("full");
  // A campaign can field the NGC12 core on its own — same instrument, shorter set.
  const items = useMemo(
    () => orderedItems().filter((it) => itemSet === "full" || it.core || it.session_field),
    [itemSet],
  );
  const steps = items.length;

  const sb = useMemo(() => getSupabaseBrowser(), []);
  const [org, setOrg] = useState<Org | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [i, setI] = useState(-1); // -1 = welcome, >= steps = done
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The instrument as this campaign fields it — branching is always evaluated
  // against the set the respondent is actually walking.
  const fielded = useMemo(() => ({ ...instrument, items }), [items]);

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
        .select("id,item_set")
        .eq("org_id", (o as Org).id)
        .eq("slug", "default")
        .eq("active", true)
        .maybeSingle();
      if (c) {
        setCampaignId(c.id as string);
        if (c.item_set === "core") setItemSet("core");
      }
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

  async function choose(value: AnswerValue) {
    const item = items[i];
    const nextAnswers = { ...answers, [item.key]: value };
    setAnswers(nextAnswers);

    if (sb && sessionId) {
      setBusy(true);
      const { error } = await sb.rpc("save_response", {
        p_session_id: sessionId,
        p_item_key: item.key,
        p_raw: value,
      });
      if (error) {
        setBusy(false);
        setError("Could not save that answer.");
        return;
      }

      // Demographic items live on the session row, not only as a response —
      // that is what the by-age and geography breakdowns read.
      if (item.session_field) {
        await sb.rpc("set_session_context", {
          p_session_id: sessionId,
          p_field: item.session_field,
          p_value: value === null || value === undefined ? null : String(value),
        });
      }

      // Changing an earlier answer can close a branch the respondent already
      // walked. Drop anything they answered that this answer makes irrelevant,
      // so the stored session always matches what the rules say they were asked.
      const orphaned = orphanedAnswers(nextAnswers, fielded);
      for (const it of orphaned) {
        await sb.rpc("delete_response", { p_session_id: sessionId, p_item_key: it.key });
      }
      if (orphaned.length) {
        setAnswers((a) => {
          const copy = { ...a };
          for (const it of orphaned) delete copy[it.key];
          return copy;
        });
      }
      setBusy(false);
    }

    const next = nextVisibleIndex(i, nextAnswers, fielded);
    if (next === -1) {
      if (sb && sessionId) await sb.rpc("finish_session", { p_session_id: sessionId });
      setI(steps);
      return;
    }
    setI(next);
  }

  function back() {
    const prev = prevVisibleIndex(i, answers, fielded);
    if (prev !== -1) setI(prev);
  }

  // Progress is against the path this respondent is actually on, which can
  // shorten as they answer — so it never promises questions they won't be asked.
  const path = useMemo(() => visibleItems(answers, fielded), [answers, fielded]);
  const answeredCount = path.filter((it) => answers[it.key] !== undefined).length;
  const pathLength = Math.max(path.length, 1);
  const pct =
    i < 0 ? 0 : i >= steps ? 100 : Math.round((answeredCount / pathLength) * 100);
  const stepNumber = path.findIndex((it) => it.key === items[i]?.key) + 1;
  const hasEarlier = i > 0 && prevVisibleIndex(i, answers, fielded) !== -1;

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
            onBack={hasEarlier ? back : undefined}
            stepLabel={`Question ${stepNumber} of ${pathLength}`}
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
  selected: AnswerValue;
  onChoose: (v: AnswerValue) => void;
  onBack?: () => void;
  stepLabel: string;
}) {
  const optBtn = "w-full rounded-xl border-2 px-4 py-3 text-left text-sm transition";
  const isSel = (v: AnswerValue) => selected === v;
  const style = (v: AnswerValue) =>
    isSel(v) ? { borderColor: brand, background: `${brand}1a` } : { borderColor: "#e6e8ec" };

  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-widest" style={{ color: brand }}>
        {stepLabel}
      </div>
      <h2 className="mb-2 mt-2 text-xl font-medium leading-snug">{t(item.text, locale)}</h2>
      {item.help && (
        <p className="mb-4 text-xs leading-relaxed text-muted">{t(item.help, locale)}</p>
      )}
      {!item.help && <div className="mb-3" />}

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

      {item.type === "open_text" && (
        <OpenText
          key={item.key}
          brand={brand}
          busy={busy}
          maxLength={item.max_length ?? 300}
          initial={typeof selected === "string" ? selected : ""}
          onSubmit={onChoose}
        />
      )}

      {onBack && (
        <button onClick={onBack} className="mt-5 text-xs text-muted hover:text-ink">
          ← Back
        </button>
      )}
    </div>
  );
}

/**
 * Free-text answer. Deliberately capped and skippable: this is the one place
 * a respondent could type something identifying into a database designed to
 * hold none, so the prompt warns them and the length is bounded.
 */
function OpenText({
  brand,
  busy,
  maxLength,
  initial,
  onSubmit,
}: {
  brand: string;
  busy: boolean;
  maxLength: number;
  initial: string;
  onSubmit: (v: AnswerValue) => void;
}) {
  const [text, setText] = useState(initial);
  const left = maxLength - text.length;

  return (
    <div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, maxLength))}
        rows={4}
        placeholder="Type as much or as little as you like…"
        className="w-full rounded-xl border-2 px-4 py-3 text-sm outline-none"
        style={{ borderColor: text ? brand : "#e6e8ec" }}
      />
      <div className="mt-1 text-right font-mono text-[10px] text-muted">
        {left} characters left
      </div>
      <div className="mt-3 flex gap-2">
        <button
          disabled={busy || !text.trim()}
          onClick={() => onSubmit(text.trim())}
          className="flex-1 rounded-xl px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
          style={{ background: brand }}
        >
          Continue →
        </button>
        <button
          disabled={busy}
          onClick={() => onSubmit("")}
          className="rounded-xl border-2 px-4 py-3 text-sm text-muted"
          style={{ borderColor: "#e6e8ec" }}
        >
          Skip
        </button>
      </div>
    </div>
  );
}
