"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Question } from "@/components/survey/QuestionCard";
import InstallHint from "@/components/survey/InstallHint";
import { ENGLISH, REGISTRY, highlightParts, loadLang, localeInfo, type Lang } from "@/lib/i18n";
import { bestMatch, offered } from "@/lib/i18nCore";
import { cacheGet, cacheSet, enqueue, newLocalSession, onPending, startDraining } from "@/lib/outbox";

type Org = {
  id: string;
  slug: string;
  name: string;
  brand_color: string | null;
  country: string | null;
  welcome_message: string | null;
  /** The organisation's logo (Survey settings, migrations 0036/0037). */
  logo_url?: string | null;
};

/**
 * Two audiences, two campaigns, one instrument. `campaign_upsert()` writes
 * these same two slugs, so the link the console copies and the campaign the
 * survey looks for cannot disagree.
 */
const CAMPAIGN_SLUG = { community: "default", public: "open" } as const;

/**
 * The respondent survey — ONE implementation, two audiences.
 *
 * /[org]      fields the `community` campaign — the young people a ministry
 *             already reaches.
 * /[org]/open fields the `public` campaign — everyone else, uninfluenced.
 *
 * They are the same instrument and the same screens on purpose: the comparison
 * between the two is only legitimate if nothing but the audience differs. That
 * is why this is one component with an `audience` prop rather than two pages
 * that will drift.
 */
export default function Survey({
  slug,
  audience = "community",
  distributionLinkSlug,
}: {
  slug: string;
  audience?: "community" | "public";
  /**
   * Which distribution link ("room") this respondent came through, if any —
   * see migration 0028. Optional: the two fixed audience links above pass
   * nothing, exactly as before. start_session() resolves and validates the
   * slug itself (org match + active window), so nothing else here changes.
   */
  distributionLinkSlug?: string;
}) {
  // Language (docs/TRANSLATION.md). Respondents are offered only LIVE
  // languages. Reviewers add ?preview=1 to try draft translations — and a
  // preview in a language that isn't live never records a single answer.
  const [lang, setLang] = useState<Lang>(ENGLISH);
  const [preview, setPreview] = useState(false);
  const choices = useMemo(() => offered(REGISTRY, preview), [preview]);
  const recording = lang.code === "en" || localeInfo(lang.code)?.status === "live";
  const pickLang = useCallback(async (code: string) => {
    const l = await loadLang(code);
    setLang(l);
    try { localStorage.setItem("jfindx-lang", code); } catch { /* private mode */ }
  }, []);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const isPreview = q.get("preview") === "1";
    setPreview(isPreview);
    const avail = offered(REGISTRY, isPreview).map((l) => l.code);
    let saved: string | null = null;
    try { saved = localStorage.getItem("jfindx-lang"); } catch { /* ignore */ }
    const wanted = q.get("lang") ?? (saved && avail.includes(saved) ? saved : bestMatch(navigator.languages ?? [navigator.language], avail));
    if (avail.includes(wanted) && wanted !== "en") void pickLang(wanted);
  }, [pickLang]);
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
  // Answers are written to the phone instantly now, so a question never waits on the network.
  const busy = false;
  const [error, setError] = useState<string | null>(null);
  // Three honest states before a question ever appears. Previously a missing
  // campaign fell through to a Begin button that failed with "check Supabase
  // setup" — a developer's sentence shown to a fourteen-year-old.
  const [status, setStatus] = useState<"loading" | "ready" | "not_fielding" | "no_org" | "offline_first_visit">("loading");
  // Offline-first (CLAUDE.md §4): answers are written to the phone first and
  // sent in order by the outbox (src/lib/outbox.ts), so a dropped signal
  // never loses them. `pending` is how many writes are still waiting.
  const [logoFailed, setLogoFailed] = useState(false);
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  useEffect(() => {
    startDraining();
    const off = onPending(setPending);
    const up = () => setOnline(navigator.onLine);
    up();
    window.addEventListener("online", up);
    window.addEventListener("offline", up);
    return () => {
      off();
      window.removeEventListener("online", up);
      window.removeEventListener("offline", up);
    };
  }, []);

  // The instrument as this campaign fields it — branching is always evaluated
  // against the set the respondent is actually walking.
  const fielded = useMemo(() => ({ ...instrument, items }), [items]);

  const brand = org?.brand_color || "#e0742f";
  const orgName = org?.name || slug.charAt(0).toUpperCase() + slug.slice(1);

  useEffect(() => {
    (async () => {
      if (!sb) return;
      // What this survey needs to open is cached on the phone after the first
      // successful visit, so it opens again in a camp with no signal. Only
      // public, non-personal fields: the organisation's name and branding and
      // which campaign to write to.
      const cacheKey = `survey:${slug}:${audience}`;
      type Cached = { org: Org; campaignId: string | null; itemSet: "full" | "core" };
      const useCache = async () => {
        const c = await cacheGet<Cached>(cacheKey);
        if (!c) return false;
        setOrg(c.org);
        if (!c.campaignId) {
          setStatus("not_fielding");
          return true;
        }
        setCampaignId(c.campaignId);
        setItemSet(c.itemSet);
        setStatus("ready");
        return true;
      };

      // If the phone already knows it has no signal, don't wait on the network
      // at all. Otherwise give it five seconds — the Supabase client retries a
      // failed request with growing delays, and a young person at a camp
      // shouldn't watch "Loading…" while it does.
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        if (!(await useCache())) setStatus("offline_first_visit");
        return;
      }
      const withTimeout = <T,>(q: PromiseLike<T>, ms = 5000): Promise<T> =>
        Promise.race([Promise.resolve(q), new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);

      try {
        // short_name is the public identifier (migration 0011). slug is kept in
        // lockstep by a trigger, but the URL is the short name, so look that up.
        const { data: o, error: oErr } = await withTimeout(
          sb.from("organisations").select("id,slug,name,brand_color,country,welcome_message,logo_url").eq("short_name", slug).maybeSingle(),
        );
        if (oErr) throw oErr;
        if (!o) {
          setStatus("no_org");
          return;
        }
        setOrg(o as Org);

        const { data: c, error: cErr } = await withTimeout(
          sb.from("campaigns").select("id,item_set").eq("org_id", (o as Org).id).eq("slug", CAMPAIGN_SLUG[audience]).eq("active", true).maybeSingle(),
        );
        if (cErr) throw cErr;

        const set = c?.item_set === "core" ? "core" : "full";
        void cacheSet(cacheKey, { org: o, campaignId: c ? (c.id as string) : null, itemSet: set });
        if (!c) {
          setStatus("not_fielding");
          return;
        }
        setCampaignId(c.id as string);
        setItemSet(set);
        setStatus("ready");
      } catch {
        // No signal (or the server is unreachable): open from the phone's copy.
        if (!(await useCache())) setStatus("offline_first_visit");
      }
    })();
  }, [sb, slug, audience]);

  function begin() {
    setError(null);
    if (sb && campaignId && recording) {
      // A local key now; the server's session id arrives whenever the outbox
      // can reach it. Everything below writes against the local key.
      const local = newLocalSession();
      setSessionId(local);
      void enqueue(local, "start", {
        p_campaign_id: campaignId,
        p_locale: lang.code,
        p_distribution_link_slug: distributionLinkSlug ?? null,
      });
    }
    setI(0);
  }

  function choose(value: AnswerValue) {
    const item = items[i];
    const nextAnswers = { ...answers, [item.key]: value };
    setAnswers(nextAnswers);

    if (sb && sessionId && recording) {
      void enqueue(sessionId, "save", { p_session_id: sessionId, p_item_key: item.key, p_raw: value });

      // Demographic items live on the session row, not only as a response —
      // that is what the by-age and geography breakdowns read.
      if (item.session_field) {
        void enqueue(sessionId, "context", {
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
        void enqueue(sessionId, "delete", { p_session_id: sessionId, p_item_key: it.key });
      }
      if (orphaned.length) {
        setAnswers((a) => {
          const copy = { ...a };
          for (const it of orphaned) delete copy[it.key];
          return copy;
        });
      }
    }

    const next = nextVisibleIndex(i, nextAnswers, fielded);
    if (next === -1) {
      if (sb && sessionId && recording) void enqueue(sessionId, "finish", { p_session_id: sessionId });
      setI(steps);
      return;
    }
    setI(next);
  }

  /** A shared phone at a camp: clear this person's answers from the screen and start the next. */
  function nextPerson() {
    setAnswers({});
    setSessionId(null);
    setError(null);
    setI(-1);
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
    <main dir={lang.dir} lang={lang.code} className="mx-auto flex min-h-screen max-w-xl flex-col px-4 py-6">
      {/* brand header */}
      <div className="rounded-t-2xl px-6 py-5 text-white" style={{ background: brand }}>
        <div className="flex items-center gap-3">
          {org?.logo_url && /^https:\/\//.test(org.logo_url) && !logoFailed ? (
            // The organisation's own logo. If it can't load (no signal before
            // it was ever cached, or a broken address) fall back to the initial.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={org.logo_url}
              alt=""
              onError={() => setLogoFailed(true)}
              className="h-10 w-10 rounded-full bg-white object-contain p-0.5"
            />
          ) : (
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-lg font-black"
              style={{ color: brand }}
            >
              {orgName.charAt(0)}
            </div>
          )}
          <div>
            <div className="font-semibold leading-tight">{orgName}</div>
            <div className="text-xs opacity-90">{org?.country || lang.ui("powered")}</div>
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
        {!recording && (
          <p role="status" className="mb-4 rounded-lg bg-amber-100 px-3 py-2 text-[13px] font-semibold leading-snug text-ink">
            {lang.ui("preview_banner")}
          </p>
        )}
        {!online && status === "ready" && (
          <p role="status" className="mb-4 rounded-lg bg-paper-deep px-3 py-2 text-[13px] leading-snug text-ink-2">
            <b className="text-ink">{lang.ui("offline_banner_title")}</b> {lang.ui("offline_banner_body")}
          </p>
        )}

        {status === "loading" && <p className="py-8 text-center text-sm text-muted">{lang.ui("loading")}</p>}

        {status === "offline_first_visit" && (
          <div className="py-6">
            <h1 className="text-xl font-bold leading-tight">{lang.ui("offline_first_title")}</h1>
            <p className="mt-3 text-sm leading-relaxed text-slate">{lang.ui("offline_first_body")}</p>
          </div>
        )}

        {status === "no_org" && (
          <div className="py-6">
            <h1 className="text-xl font-bold leading-tight">{lang.ui("no_org_title")}</h1>
            <p className="mt-3 text-sm leading-relaxed text-slate">{lang.ui("no_org_body")}</p>
          </div>
        )}

        {/* A ministry can hand out its link before it finishes setting up. Say so
            plainly instead of failing at the first tap — the young person did
            nothing wrong, and the person who shared it needs to know. */}
        {status === "not_fielding" && (
          <div className="py-6">
            <h1 className="text-xl font-bold leading-tight">
              {lang.ui("not_fielding_title", { org: orgName })}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate">
              {lang.ui(audience === "public" ? "not_fielding_public" : "not_fielding_community", { org: orgName })}
            </p>
            <p className="mt-4 text-xs leading-relaxed text-muted">
              {lang.ui("not_fielding_note")}
            </p>
          </div>
        )}

        {status === "ready" && i < 0 && (
          <div>
            {choices.length > 1 && (
              <label className="mb-4 flex items-center gap-2 text-[13px] text-slate">
                <span aria-hidden>🌐</span>
                <span className="sr-only">{lang.ui("language")}</span>
                <select
                  value={lang.code}
                  onChange={(e) => void pickLang(e.target.value)}
                  aria-label={lang.ui("language")}
                  className="min-h-[40px] rounded-lg border border-rule bg-plate px-2.5 py-1.5 text-[14px] text-ink"
                >
                  {choices.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.native}
                      {c.status !== "live" ? ` · ${c.status}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <h1 className="text-2xl font-bold leading-tight">
              {(() => {
                const [a, b, c] = highlightParts(lang.ui("welcome_title"));
                return (
                  <>
                    {a}
                    <span style={{ color: brand }}>{b}</span>
                    {c}
                  </>
                );
              })()}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate">
              {/* The organisation's own welcome is one language (written in its
                  settings); other languages get the translated standard welcome.
                  The length follows the survey's actual item set. */}
              {(lang.code === "en" && org?.welcome_message) ||
                lang.ui("welcome_body", { org: orgName, minutes: itemSet === "core" ? 3 : 7 })}
            </p>
            <button
              onClick={begin}
              className="mt-6 rounded-lg px-6 py-3 font-semibold text-white"
              style={{ background: brand }}
            >
              {lang.ui("begin")}
            </button>
            <InstallHint orgName={orgName} lang={lang} />
          </div>
        )}

        {i >= 0 && i < steps && (
          <Question
            item={items[i]}
            lang={lang}
            brand={brand}
            busy={busy}
            selected={answers[items[i].key]}
            onChoose={choose}
            onBack={hasEarlier ? back : undefined}
            stepLabel={lang.ui("question_of", { n: stepNumber, total: pathLength })}
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
            <h2 className="text-xl font-bold">{lang.ui("thanks")}</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-slate">
              {lang.ui(pending > 0 ? "done_pending" : "done_saved", { org: orgName })} {lang.ui("done_private")}
            </p>
            <button
              type="button"
              onClick={nextPerson}
              className="mt-6 rounded-lg border-2 px-5 py-2.5 text-sm font-semibold"
              style={{ borderColor: brand, color: brand }}
            >
              {lang.ui("next_person")}
            </button>
            {pending > 0 && (
              <p className="mt-3 font-mono text-[10px] uppercase tracking-wider text-muted">
                {online ? lang.ui("sending") : lang.ui("waiting_signal")} · {lang.ui("saved_on_phone", { n: pending })}
              </p>
            )}
          </div>
        )}
      </div>

      <p className="mt-3 text-center font-mono text-[9px] uppercase tracking-widest text-muted">
        {lang.ui("powered")}
      </p>
    </main>
  );
}

