"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Question } from "@/components/survey/QuestionCard";
import {
  DomainBars,
  IndexPlate,
  IntegrityNote,
  ItemLedger,
  JourneyFunnel,
  Matrix,
  Plate,
  TrendPlate,
} from "@/components/index/Figures";
import WorldHeatMap, { type MapCountry } from "@/components/index/WorldHeatMap";
import {
  instrument,
  nextVisibleIndex,
  orderedItems,
  prevVisibleIndex,
  visibleItems,
  type AnswerValue,
} from "@/lib/instrument";
import { SAMPLE_ORG, itemLabel, sampleDashboard, sampleTierCounts } from "@/lib/sample";
import { EMERALD, MUTED, TIERS, TIER_LABEL, fig } from "@/lib/model";

/**
 * Where this sample org's own respondents happen to be from — a per-org map,
 * scoped to one organisation's audience, distinct from the Collab-wide map
 * shown later in BeatCollab. Hand-written sample data, same pattern as
 * REGIONS below: illustrative, not derived from the instrument, because
 * there is no per-country breakdown in DashboardData to draw from honestly.
 */
const ORG_MAP_SAMPLE: MapCountry[] = [
  { country: "Argentina", n: 812, tiers: { exposure: 4.4, response: 4.0, formation: 3.6, multiplication: 2.1 } },
  { country: "Peru", n: 261, tiers: { exposure: 4.2, response: 3.8, formation: 3.3, multiplication: 1.9 } },
  { country: "Colombia", n: 131, tiers: { exposure: 4.1, response: 3.6, formation: 3.0, multiplication: 1.7 } },
];

/**
 * A read-only preview of the org dashboard's distribution-links panel
 * (src/components/index/LinksPanel.tsx) — hand-styled rather than that
 * component itself. LinksPanel always calls a live RPC on mount and offers
 * create/edit actions; neither makes sense in a sales preview with no real
 * org signed in, and stubbing a fake SupabaseClient just to satisfy its
 * prop type would be more fragile than it's worth. This mirrors its visual
 * language (name, status pill, response count, places) with fixed sample
 * data instead.
 */
const SAMPLE_LINKS = [
  { name: "Camp 2026", status: "active" as const, n: 340, places: "Córdoba · Rosario" },
  { name: "Youth group — default", status: "active" as const, n: 812, places: "Buenos Aires +6 more" },
  { name: "Winter retreat", status: "scheduled" as const, n: 0, places: "No responses yet" },
];
const LINK_STATUS_STYLE: Record<"active" | "scheduled", string> = {
  active: "bg-[rgb(var(--c-green)/0.14)] text-green",
  scheduled: "bg-[rgb(var(--c-emerald)/0.12)] text-emerald",
};

/**
 * The guided walkthrough.
 *
 * Every screen below is rendered by the SAME components the live product uses —
 * `Question` from the respondent survey, and the figure set from the org
 * dashboard — fed by a sample payload derived from the live instrument JSON.
 *
 * Nothing here is a screenshot, a mock-up or a hand-written fixture. If a
 * researcher adds an item, or a designer changes how a Likert scale is drawn,
 * this walkthrough shows the new version on the same deploy, without anyone
 * remembering to update it. That is the only way a demo stays true.
 */

const BEATS = [
  { id: "model", kicker: "The model", title: "One grid, two lenses" },
  { id: "phone", kicker: "The respondent", title: "Four minutes, on any phone" },
  { id: "adapt", kicker: "The instrument", title: "It stops asking what it shouldn't" },
  { id: "org", kicker: "The ministry", title: "What lands on your dashboard" },
  { id: "collab", kicker: "The coalition", title: "What the whole movement sees" },
  { id: "next", kicker: "The point", title: "So what changes on Monday?" },
] as const;

export default function Walkthrough() {
  const [beat, setBeat] = useState(0);
  const b = BEATS[beat];

  return (
    <>
      <section className="border-b border-ink py-8">
        <p className="figcap">A guided walk · six beats</p>
        <h1 className="mt-3 text-[36px] leading-[1.05] tracking-tight sm:text-[44px]">
          How the Index will work.
        </h1>
        <p className="mt-5 max-w-measure text-[17px] leading-relaxed text-ink-2">
          Every screen in this walkthrough is the real product, running on invented figures. Click
          through it, or jump to whichever beat you came for.
        </p>
      </section>

      {/* rail */}
      <nav className="sticky top-[26px] z-40 -mx-5 border-b border-rule bg-paper/95 px-5 py-2 backdrop-blur-[2px]">
        <ol className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          {BEATS.map((x, i) => (
            <li key={x.id}>
              <button
                type="button"
                onClick={() => setBeat(i)}
                aria-current={i === beat ? "step" : undefined}
                className={`text-[13.5px] font-semibold ${
                  i === beat ? "text-emerald underline" : "text-muted hover:text-ink"
                }`}
              >
                {String(i + 1).padStart(2, "0")} {x.kicker}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <section className="py-8">
        <div className="flex items-baseline gap-3 border-b border-ink pb-2">
          <span className="tabular text-[11px] tracking-[0.16em] text-muted">
            {String(beat + 1).padStart(2, "0")} / {String(BEATS.length).padStart(2, "0")}
          </span>
          <h2 className="text-[26px] leading-tight">{b.title}</h2>
        </div>

        <div className="mt-7">
          {beat === 0 && <BeatModel />}
          {beat === 1 && <BeatPhone />}
          {beat === 2 && <BeatAdapt />}
          {beat === 3 && <BeatOrg />}
          {beat === 4 && <BeatCollab />}
          {beat === 5 && <BeatNext />}
        </div>

        <div className="mt-10 flex items-center justify-between gap-4 border-t border-ink pt-4">
          <button
            type="button"
            onClick={() => setBeat((n) => Math.max(0, n - 1))}
            disabled={beat === 0}
            className="rounded-lg border border-ink px-4 py-2 text-[14px] font-semibold text-ink disabled:border-rule disabled:text-muted"
          >
            ← Back
          </button>
          {beat < BEATS.length - 1 ? (
            <button
              type="button"
              onClick={() => setBeat((n) => n + 1)}
              className="rounded-lg border-2 border-emerald bg-emerald px-5 py-2 text-[14px] font-semibold text-plate hover:bg-emerald-deep"
            >
              {BEATS[beat + 1].kicker} →
            </button>
          ) : (
            <Link
              href="/join"
              className="rounded-lg border-2 border-emerald bg-emerald px-5 py-2 text-[14px] font-semibold text-plate no-underline hover:bg-emerald-deep"
            >
              Join the Index →
            </Link>
          )}
        </div>
      </section>
    </>
  );
}

/* ── 01 ───────────────────────────────────────────────────────────────── */

function BeatModel() {
  return (
    <div className="grid gap-8 md:grid-cols-[1fr_1.5fr] md:gap-12">
      <div>
        <p className="max-w-measure text-[17px] leading-relaxed">
          Everything starts here. The <b>three questions</b> are what we measure. The{" "}
          <b>four tiers</b> are how deep it has gone.
        </p>
        <p className="mt-4 max-w-measure text-[16px] leading-relaxed text-ink-2">
          Every item in the survey carries exactly one question and one tier. That single tagging
          decision is what lets a four-minute survey be read two completely different ways — by what
          you are asking about, or by how far it has travelled.
        </p>
        <p className="mt-4 max-w-measure text-[16px] leading-relaxed text-ink-2">
          The columns narrow as you move right. That narrowing is the diagnosis: it shows you exactly
          where your people stop moving.
        </p>
        <p className="margin-note mt-5 border-l-2 border-emerald pl-3">
          This grid is drawn by the same component as the live dashboard. The only difference is that
          here the cells hold plain language instead of scores.
        </p>
      </div>
      <Plate label="The J12 · the model" figure="Beat 01">
        <Matrix phrases />
      </Plate>
    </div>
  );
}

/* ── 02 · the real survey component ───────────────────────────────────── */

/**
 * A device frame, tour-only. The actual respondent survey at /[org] never
 * wraps itself in a phone mockup — on a real phone that would be a phone
 * inside a phone — this exists purely so a visitor browsing on a laptop
 * immediately reads "this is what shows up on someone's phone" rather than
 * mistaking it for an ordinary card on the page.
 */
function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[320px] rounded-[2.25rem] border-[10px] border-ink bg-ink shadow-xl">
      <div className="flex justify-center py-1.5">
        <div className="h-1.5 w-16 rounded-full bg-ink-2" />
      </div>
      <div className="overflow-hidden rounded-[1.5rem] bg-plate">{children}</div>
    </div>
  );
}

function BeatPhone() {
  return (
    <div>
      <p className="max-w-measure text-[17px] leading-relaxed">
        A young person reaches this from a QR code on a camp wall or a link in a group chat.{" "}
        <b>No account, no name, no email.</b> One question per screen, so it works on a cheap phone
        on a bad connection.
      </p>
      <p className="mt-4 max-w-measure text-[16px] leading-relaxed text-ink-2">
        It carries the organisation&apos;s own brand — their logo, their colour, their words. The
        Index sits in the footer. To the respondent it is their youth group asking, because it is.
      </p>
      <p className="mt-4 max-w-measure text-[16px] leading-relaxed text-ink-2">
        The next beat lets you try the actual survey component yourself, end to end.
      </p>
      <p className="margin-note mt-5 border-l-2 border-rule pl-3">
        Respondents are anonymous — no name, no email, no location beyond a country, age as a band.
        We report only on those who have completed the Index. Consent — including parental consent —
        is handled by the organisation, locally, before anyone reaches this screen.
      </p>
    </div>
  );
}

/**
 * A working click-through of the real respondent survey — same welcome
 * screen, progress bar, card chrome and thank-you state as `Survey.tsx`
 * (the component /[org] actually mounts), just held in memory instead of
 * writing to Supabase. Living here, next to the branching demonstration,
 * because trying the flow means the most once you have just read why it
 * stops asking certain questions.
 */
function SurveyDemo() {
  const items = useMemo(() => orderedItems(), []);
  const steps = items.length;
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [i, setI] = useState(-1); // -1 = welcome, matching Survey.tsx exactly

  const path = useMemo(() => visibleItems(answers), [answers]);
  const answeredCount = path.filter((it) => answers[it.key] !== undefined).length;
  const pathLength = Math.max(path.length, 1);
  const pct = i < 0 ? 0 : i >= steps ? 100 : Math.round((answeredCount / pathLength) * 100);
  const stepNumber = path.findIndex((it) => it.key === items[i]?.key) + 1;
  const hasEarlier = i > 0 && prevVisibleIndex(i, answers) !== -1;

  function choose(v: AnswerValue) {
    const nextAnswers = { ...answers, [items[i].key]: v };
    setAnswers(nextAnswers);
    const next = nextVisibleIndex(i, nextAnswers);
    setI(next === -1 ? steps : next);
  }
  function back() {
    const prev = prevVisibleIndex(i, answers);
    if (prev !== -1) setI(prev);
  }
  function reset() {
    setAnswers({});
    setI(-1);
  }

  return (
    <div className="mx-auto max-w-[320px]">
      <PhoneFrame>
        <div className="px-6 py-5 text-white" style={{ background: SAMPLE_ORG.brand }}>
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-lg font-black"
              style={{ color: SAMPLE_ORG.brand }}
            >
              {SAMPLE_ORG.name.charAt(0)}
            </div>
            <div>
              <div className="font-semibold leading-tight">{SAMPLE_ORG.name}</div>
              <div className="text-xs opacity-90">{SAMPLE_ORG.country}</div>
            </div>
          </div>
          <div className="mt-4 h-1.5 overflow-hidden rounded bg-white/30">
            <div className="h-full bg-white transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="max-h-[420px] overflow-y-auto bg-plate p-6">
          {i < 0 && (
            <div>
              <h1 className="text-xl font-bold leading-tight text-ink">
                You&apos;re invited to share{" "}
                <span style={{ color: SAMPLE_ORG.brand }}>where you&apos;re at</span>.
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-ink-2">
                {SAMPLE_ORG.name} is learning how to walk with young people as they follow Jesus.
                Your honest answers help. It takes about 6 minutes and is completely anonymous.
              </p>
              <button
                onClick={() => setI(0)}
                className="mt-6 rounded-lg px-6 py-3 font-semibold text-white"
                style={{ background: SAMPLE_ORG.brand }}
              >
                Begin →
              </button>
            </div>
          )}

          {i >= 0 && i < steps && (
            <Question
              item={items[i]}
              locale="en"
              brand={SAMPLE_ORG.brand}
              busy={false}
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
                style={{ background: SAMPLE_ORG.brand }}
              >
                ✓
              </div>
              <h2 className="text-xl font-bold text-ink">Thank you!</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm text-ink-2">
                Their answer joins {SAMPLE_ORG.name}&apos;s picture of how their community is
                following Jesus. Nobody — not even their own youth leader — will ever see this
                individual response.
              </p>
              <button
                type="button"
                onClick={reset}
                className="mt-5 rounded-lg border border-ink px-4 py-2 text-[14px] font-semibold text-ink"
              >
                Walk it again
              </button>
            </div>
          )}
        </div>
        <p className="border-t border-rule px-5 py-3 text-center font-mono text-[9px] uppercase tracking-widest text-muted">
          Powered by the Next Gen Jesus-Following Index
        </p>
      </PhoneFrame>
      <p className="figcap mt-3 text-center leading-relaxed">
        Live component · answers are held in memory only
      </p>
    </div>
  );
}

/* ── 03 · branching, demonstrated ─────────────────────────────────────── */

const PERSONAS: { id: string; label: string; note: string; answers: Record<string, AnswerValue> }[] = [
  {
    id: "never",
    label: "Has never heard the story",
    note: "Exposure is still measured — that is the whole point of the tier. Everything downstream would be meaningless, so it is not asked.",
    answers: { age_band: "13_17", heard_story: "no", orientation: "open_not_exploring" },
  },
  {
    id: "no-god",
    label: "Confident there is no God",
    note: "Asked what they believe, including the things they reject. Not asked how often they pray.",
    answers: { age_band: "18_22", heard_story: "yes", orientation: "confident_no_god", identify_as_follower: 1 },
  },
  {
    id: "exploring",
    label: "Open, and exploring",
    note: "The full path. Someone exploring may well pray, so the formation items stay open to them.",
    answers: { age_band: "18_22", heard_story: "yes", orientation: "open_exploring", identify_as_follower: 3 },
  },
  {
    id: "committed",
    label: "Committed, actively growing",
    note: "The full path, including the multiplication items — is anyone growing because of you?",
    answers: { age_band: "23_30", heard_story: "yes", orientation: "committed_growing", identify_as_follower: 5 },
  },
];

function BeatAdapt() {
  const [p, setP] = useState(3);
  const persona = PERSONAS[p];
  const shown = visibleItems(persona.answers);
  const shownKeys = new Set(shown.map((x) => x.key));
  const all = orderedItems();

  return (
    <div>
    <div className="grid gap-8 md:grid-cols-[1fr_1.35fr] md:gap-12">
      <div>
        <p className="max-w-measure text-[17px] leading-relaxed">
          The survey stops asking questions the respondent&apos;s own answers have made meaningless.
        </p>
        <p className="mt-4 max-w-measure text-[16px] leading-relaxed text-ink-2">
          Someone who has just said they are confident God does not exist should not then be asked how
          often they read scripture. It wastes their patience, and worse, it puts a meaningless answer
          into the average.
        </p>
        <p className="mt-4 max-w-measure text-[16px] leading-relaxed text-ink-2">
          The rules live in the instrument as configuration, not in code — so a researcher can re-gate
          a question without a developer. Pick a respondent and watch the path change.
        </p>

        <div className="mt-6 flex flex-col gap-1.5">
          {PERSONAS.map((x, idx) => (
            <button
              key={x.id}
              type="button"
              onClick={() => setP(idx)}
              className={`rounded-lg border px-3 py-2 text-left text-[13px] ${
                idx === p ? "border-emerald bg-emerald text-plate" : "border-rule text-ink hover:border-ink"
              }`}
            >
              {x.label}
            </button>
          ))}
        </div>
        <p className="margin-note mt-4 border-l-2 border-rule pl-3">{persona.note}</p>
      </div>

      <div>
        <Plate
          label={`Asked: ${shown.length} of ${all.length} questions`}
          figure="Beat 03 · live branching rules"
        >
          <ol className="columns-1 gap-x-8 sm:columns-2">
            {all.map((it) => {
              const on = shownKeys.has(it.key);
              return (
                <li
                  key={it.key}
                  className={`break-inside-avoid border-b border-rule py-1.5 text-[13px] leading-snug ${
                    on ? "text-ink" : "text-muted line-through decoration-rule-2"
                  }`}
                >
                  <span className="tabular mr-2 text-[10px] text-muted">
                    {on ? "●" : "○"}
                  </span>
                  {itemLabel(it.key)}
                </li>
              );
            })}
          </ol>
        </Plate>
        <p className="figcap mt-3 leading-relaxed">
          Skipped items are not stored. Because visibility is a pure function of the instrument plus
          the answers, we can always recompute what someone was asked — so nothing is lost by not
          writing a row.
        </p>
      </div>
    </div>

    <div className="mt-14 border-t-2 border-ink pt-8">
      <p className="figcap">Try it yourself</p>
      <h3 className="mt-2 text-[21px] leading-tight">
        This is not a picture of the survey — it is the survey component.
      </h3>
      <p className="mt-3 max-w-measure text-[16px] leading-relaxed text-ink-2">
        Mounted here with nothing written to a database. Walk it end to end and watch it stop
        asking questions your own answers have already made meaningless.
      </p>
      <div className="mt-6">
        <SurveyDemo />
      </div>
    </div>
    </div>
  );
}

/* ── 04 · the org dashboard, real components ──────────────────────────── */

function BeatOrg() {
  const d = sampleDashboard();
  const counts = sampleTierCounts();

  return (
    <div>
      <div className="grid gap-8 md:grid-cols-[1fr_1.6fr] md:gap-12">
        <div>
          <p className="max-w-measure text-[17px] leading-relaxed">
            The same day, this is what the ministry gets back. <b>Aggregates only</b> — never a single
            young person&apos;s answers, not even to the leader who ran it.
          </p>
          <p className="mt-4 max-w-measure text-[16px] leading-relaxed text-ink-2">
            The headline number is the least interesting thing on the page. The funnel is where the
            diagnosis is: it shows where people stop moving. In this sample, belief is strong and
            formation is holding — but multiplication falls off a cliff, which is a completely
            different problem from low belief and needs a completely different response.
          </p>
          <p className="margin-note mt-5 border-l-2 border-emerald pl-3">
            These are the live dashboard&apos;s own components. What you are looking at is what a
            partner will see, not an artist&apos;s impression of it.
          </p>
        </div>

        <div className="rounded-xl border border-rule bg-plate p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[19px]">{d.org.name}</h3>
            <span className="figcap">{d.n.toLocaleString()} responses · verified</span>
          </div>
          <div className="mt-4">
            <IndexPlate value={d.index} n={d.n} change={1.9} edition="JX:NG · Field II" />
          </div>
          {/* Deliberately stacked, not side by side. These two plates sit inside
              an already-narrow column, and at that width the tier glosses
              ("Multiplication — does it spread?") and the full question text
              ("Do they participate in His mission?") both wrap and collide.
              Two columns only once there is genuinely room for them. */}
          <div className="mt-7 grid gap-7 lg:grid-cols-2">
            <Plate label="The journey" figure="i">
              <JourneyFunnel tiers={d.tiers} counts={counts} />
            </Plate>
            <Plate label="The three questions" figure="ii">
              <DomainBars domains={d.domains} />
            </Plate>
          </div>
          <div className="mt-7">
            <Plate label="Questions × tiers" figure="iii">
              <Matrix matrix={d.matrix} />
            </Plate>
          </div>
          {d.trend && (
            <div className="mt-7">
              <Plate label="Movement over waves" figure="iv">
                <TrendPlate trend={d.trend} />
              </Plate>
            </div>
          )}
          <div className="mt-7">
            <Plate label="Per-question detail" figure="v">
              <ItemLedger items={d.items.slice(0, 8)} labelFor={itemLabel} />
            </Plate>
          </div>
          <div className="mt-7">
            <Plate label="Where it's coming from" figure="vi">
              <WorldHeatMap countries={ORG_MAP_SAMPLE} tier="multiplication" />
              <p className="margin-note mt-2">
                An organisation&apos;s own respondents, by country — never compared to the Collab at
                this scope. That comparison lives on the Matrix above and the global picture, not here.
              </p>
            </Plate>
          </div>
          <div className="mt-7">
            <Plate label="Links active" figure="vii">
              <p className="margin-note">
                Every organisation gets its own shareable links — one per camp, campus or group — each
                tracked separately but still rolling into the total above.
              </p>
              <div className="mt-3 space-y-2">
                {SAMPLE_LINKS.map((l) => (
                  <div key={l.name} className="rounded-lg border border-rule bg-paper p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[14px] font-semibold text-ink">{l.name}</span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${LINK_STATUS_STYLE[l.status]}`}
                      >
                        {l.status}
                      </span>
                    </div>
                    <p className="tabular mt-1 text-[11px] text-muted">
                      {l.n.toLocaleString()} {l.n === 1 ? "response" : "responses"} · {l.places}
                    </p>
                  </div>
                ))}
              </div>
            </Plate>
          </div>
          <IntegrityNote extra="Sample data — synthetic, labelled, never quoted." />
        </div>
      </div>
    </div>
  );
}

/* ── 05 · the collab view ─────────────────────────────────────────────── */

const REGIONS = [
  { region: "Latin America", orgs: 7, n: 8420 },
  { region: "Sub-Saharan Africa", orgs: 6, n: 6110 },
  { region: "North America", orgs: 8, n: 9240 },
  { region: "South Asia", orgs: 3, n: 2180 },
  { region: "South-East Asia", orgs: 4, n: 3760 },
  { region: "Europe", orgs: 5, n: 4020 },
];

function BeatCollab() {
  const d = sampleDashboard();
  return (
    <div className="grid gap-8 md:grid-cols-[1fr_1.5fr] md:gap-12">
      <div>
        <p className="max-w-measure text-[17px] leading-relaxed">
          Every organisation&apos;s anonymised results pool into one shared picture. This is the thing
          no single study could ever buy: the same instrument, run by hundreds of independent
          organisations, in dozens of countries, every year.
        </p>
        <p className="mt-4 max-w-measure text-[16px] leading-relaxed text-ink-2">
          A benchmark for a country only appears once enough people there have completed the Index. Up
          to that point the row shows what it honestly is — a count of organisations taking part, and
          nothing else.
        </p>
        <p className="mt-4 max-w-measure text-[16px] leading-relaxed text-ink-2">
          No organisation is ever named against another&apos;s score. There are no league tables, and
          there will not be.
        </p>
        <p className="margin-note mt-5 border-l-2 border-rule pl-3">
          Coverage beats count. Sixty organisations spread across forty countries unlocks nothing —
          every geography sits below the gate. The same sixty concentrated in ten countries unlocks
          all ten.
        </p>
      </div>

      <div>
        <IndexPlate
          value={d.index}
          n={33730}
          change={3.1}
          edition="JX:NG · all reporting partners · Field II"
          caption="Fig. — the composite the whole coalition watches"
        />
        <div className="mt-7">
          <Plate label="Reporting regions" figure="Beat 05">
            <table className="w-full text-left">
              <caption className="sr-only">Participation by region</caption>
              <thead>
                <tr className="figcap">
                  <th scope="col" className="border-b border-ink pb-2 font-normal">Region</th>
                  <th scope="col" className="border-b border-ink pb-2 text-right font-normal">Orgs</th>
                  <th scope="col" className="border-b border-ink pb-2 text-right font-normal">Completions</th>
                  <th scope="col" className="border-b border-ink pb-2 text-right font-normal">Benchmark</th>
                </tr>
              </thead>
              <tbody>
                {REGIONS.map((r) => {
                  const unlocked = r.n >= 4000;
                  return (
                    <tr key={r.region} className="border-b border-rule">
                      <th scope="row" className="py-2.5 pr-3 text-left text-[14px] font-normal">{r.region}</th>
                      <td className="tabular py-2.5 text-right text-[14px]">{r.orgs}</td>
                      <td className="tabular py-2.5 text-right text-[14px]">{r.n.toLocaleString()}</td>
                      <td
                        className="tabular py-2.5 text-right text-[10px] uppercase tracking-[0.13em]"
                        style={{ color: unlocked ? EMERALD : MUTED }}
                      >
                        {unlocked ? "Unlocked" : "Gathering"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Plate>
        </div>
        <div className="mt-7">
          <Plate label="The funnel, globally" figure="Beat 05 · ii">
            <JourneyFunnel tiers={d.tiers} />
          </Plate>
        </div>
        <IntegrityNote extra="Sample data — synthetic, labelled, never quoted." />
      </div>
    </div>
  );
}

/* ── 06 ───────────────────────────────────────────────────────────────── */

function BeatNext() {
  const d = sampleDashboard();
  const weakest = TIERS.reduce((lo, tk) =>
    (d.tiers[tk] ?? 6) < (d.tiers[lo] ?? 6) ? tk : lo,
  TIERS[0]);

  return (
    <div className="grid gap-8 md:grid-cols-[1.3fr_1fr] md:gap-12">
      <div>
        <p className="max-w-measure text-[17px] leading-relaxed">
          A number that changes nothing is a vanity metric. The Index earns its place by making one
          question answerable: <i>what should we do differently next season?</i>
        </p>
        <p className="mt-4 max-w-measure text-[16px] leading-relaxed text-ink-2">
          In this sample the weakest tier is <b>{TIER_LABEL[weakest]}</b>, at{" "}
          <span className="tabular">{fig(d.tiers[weakest])}</span>. That is not a grade. It is a
          diagnosis with an obvious next move — the people in this network are being formed and are
          not yet reproducing, so the intervention is mentoring capacity, not more events.
        </p>
        <p className="mt-4 max-w-measure text-[16px] leading-relaxed text-ink-2">
          Run it again next season and the same figure tells you whether the intervention worked. That
          is the entire proposition: <b>width and time</b>, not depth — fewer questions, over a longer
          period, in as many places as possible.
        </p>
        <p className="mt-6 max-w-measure text-[16px] leading-relaxed">
          And because everyone is running the same twelve questions, you finally see your answer next
          to your country and the world, instead of alone.
        </p>
      </div>

      <div className="border-t-2 border-ink pt-4">
        <p className="figcap">Where to next</p>
        <div className="mt-4 flex flex-col gap-3">
          <Link
            href="/join"
            className="rounded-lg border-2 border-emerald bg-emerald px-4 py-3 text-[14px] font-semibold text-plate no-underline hover:bg-emerald-deep"
          >
            Join the first round →
          </Link>
          <Link
            href="/learn"
            className="rounded-lg border border-rule px-4 py-3 text-[14px] font-semibold text-ink-2 no-underline hover:border-ink hover:text-ink"
          >
            Read how we got here →
          </Link>
        </div>
        <p className="margin-note mt-5 border-l-2 border-rule pl-3">
          Running the Index is free, and it stays free. Your standard report is free. Advanced reports
          and consulting are paid — and free for Collab members.
        </p>
      </div>
    </div>
  );
}
