"use client";

/**
 * /see-a-demo — everything demo lives here (Oct 2026, round 4b):
 *
 *   1. "See your: Ministry · Organisation · Church" — three tabs, each a
 *      fictional sample (SAMPLE_MINISTRY, SAMPLE_ORG, SAMPLE_CHURCH) taken
 *      through the same four steps: make it theirs → invite → results → act.
 *      ?view=ministry|organisation|church deep-links a tab (the home page's
 *      hero card uses it).
 *   2. The global view — moved here from the home page (LiveSnapshot), still
 *      with its own Live data / Demo preview switch.
 *   3. The call to action: "You can see this for your <kind>, now."
 *
 * Same contract as /tour (CLAUDE.md §7, tests/sample.test.ts): the phone is
 * the real survey (SurveyDemo → QuestionCard), the dashboard is the real
 * figure set (Figures), and every number comes from sampleDashboard(org),
 * derived from the live instrument at render time. The "what they read"
 * sentences are computed from those same figures. Every block that shows a
 * figure sits in a <DemoFrame>. Nothing here is written anywhere.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { GradientRule } from "@/components/site/Chrome";
import { DataLabel, DemoFrame } from "@/components/site/DataLabel";
import { LazyLiveSnapshot } from "@/components/site/HomeLazy";
import SurveyDemo from "@/components/survey/SurveyDemo";
import QrCode from "@/components/index/QrCode";
import { DomainBars, IndexPlate, IntegrityNote, ItemLedger, JourneyFunnel, Matrix, Plate, TrendPlate } from "@/components/index/Figures";
import { SAMPLE_CHURCH, SAMPLE_MINISTRY, SAMPLE_ORG, itemLabel, sampleDashboard, sampleTierCounts, type SampleOrg } from "@/lib/sample";
import { DOMAINS, DOMAIN_SHORT, MATRIX_PHRASE, TIERS, TIER_LABEL, fig } from "@/lib/model";
import { ITEM_SETS } from "@/lib/instrument";

type ViewKey = "ministry" | "organisation" | "church";

type DemoView = {
  key: ViewKey;
  tab: string;
  /** "your ___" in the closing line. */
  noun: string;
  org: SampleOrg;
  who: string;
  survey: string; // an item set name from the instrument
  rooms: string;
  intro: string;
  invite: string;
};

const VIEWS: DemoView[] = [
  {
    key: "ministry",
    tab: "Ministry",
    noun: "ministry",
    org: SAMPLE_MINISTRY,
    who: "A student ministry",
    survey: "j12",
    rooms: "Campus groups · Summer camp · Online small groups",
    intro: "runs student groups on several campuses, a summer camp and online small groups.",
    invite: "Staff share one link in each campus group chat; the camp prints the QR code on its programme.",
  },
  {
    key: "organisation",
    tab: "Organisation",
    noun: "organisation",
    org: SAMPLE_ORG,
    who: "A network of churches",
    survey: "full",
    rooms: "Partner churches · Leaders' training · Regional camps",
    intro: "serves youth groups across many partner churches, and wants one picture across all of them.",
    invite: "Each partner church gets its own room and link; every room rolls up into the network's whole picture.",
  },
  {
    key: "church",
    tab: "Church",
    noun: "church",
    org: SAMPLE_CHURCH,
    who: "A local church",
    survey: "j12",
    rooms: "Sunday youth · Young adults · Easter camp",
    intro: "has a Sunday youth group, a young-adults gathering and an Easter camp.",
    invite: "The youth pastor shows the QR code at the end of a Sunday gathering; most answer before they leave.",
  },
];

const short = (o: SampleOrg) => o.name.replace(/\s*\(sample\)$/, "");
const isView = (v: string | null): v is ViewKey => v === "ministry" || v === "organisation" || v === "church";

export default function DemoExperience() {
  const [key, setKey] = useState<ViewKey>("organisation");

  // Deep link: /see-a-demo?view=church. Read on mount (no Suspense boundary
  // needed), and keep the address bar in step so a tab can be shared.
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("view");
    if (isView(v)) setKey(v);
  }, []);
  const choose = (v: ViewKey) => {
    setKey(v);
    const url = new URL(window.location.href);
    url.searchParams.set("view", v);
    window.history.replaceState(null, "", url);
  };

  const view = VIEWS.find((v) => v.key === key)!;

  return (
    <>
      {/* ── hero + the three tabs ─────────────────────────────────────── */}
      <section className="pt-12">
        <p className="figcap">See a Demo</p>
        <h1 className="mt-2 text-[34px] font-bold leading-[1.08] tracking-tight sm:text-[44px]">
          See the Jesus Index at work.
        </h1>
        <p className="mt-4 max-w-measure text-[18px] leading-relaxed text-ink-2">
          Pick the one most like you, and follow it through a season: making the survey its own, inviting its young
          people, reading its results and deciding what to change. Then see the global view.
        </p>
        <div className="mt-5">
          <DataLabel kind="demo" />
        </div>

        <div className="mt-9 flex flex-wrap items-center gap-x-4 gap-y-3">
          <span id="see-your" className="text-[17px] font-bold text-ink">See your:</span>
          <div role="tablist" aria-labelledby="see-your" className="grid w-full grid-cols-3 gap-1 rounded-xl border border-rule bg-paper-deep p-1 sm:inline-flex sm:w-auto">
            {VIEWS.map((v) => {
              const on = v.key === key;
              return (
                <button
                  key={v.key}
                  role="tab"
                  type="button"
                  id={`tab-${v.key}`}
                  aria-selected={on}
                  aria-controls="demo-panel"
                  onClick={() => choose(v.key)}
                  onKeyDown={(e) => {
                    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                    const i = VIEWS.findIndex((x) => x.key === key);
                    const next = VIEWS[(i + (e.key === "ArrowRight" ? 1 : VIEWS.length - 1)) % VIEWS.length];
                    choose(next.key);
                    document.getElementById(`tab-${next.key}`)?.focus();
                  }}
                  tabIndex={on ? 0 : -1}
                  className={`flex items-center justify-center gap-2 rounded-lg px-2 py-2.5 text-[14px] font-semibold transition-colors sm:px-4 sm:text-[15px] ${
                    on ? "bg-plate text-ink shadow-sm" : "text-ink-2 hover:text-ink"
                  }`}
                >
                  <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: v.org.brand, opacity: on ? 1 : 0.5 }} />
                  {v.tab}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <div id="demo-panel" role="tabpanel" aria-labelledby={`tab-${view.key}`}>
        {/* key: remount per tab, so the phone and the figures start fresh */}
        <Season key={view.key} view={view} />
      </div>

      {/* ── the global view (moved here from the home page) ───────────── */}
      <LazyLiveSnapshot />

      {/* ── the call to action ────────────────────────────────────────── */}
      <section aria-labelledby="cta" className="pb-16 pt-4">
        <div className="relative overflow-hidden rounded-3xl bg-ink px-6 py-10 text-paper sm:px-10 sm:py-12">
          <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald via-emerald-deep to-violet" />
          <p className="figcap text-paper/70">Not a demo</p>
          <h2 id="cta" className="mt-2 max-w-2xl text-[30px] font-bold leading-tight tracking-tight sm:text-[38px]">
            You can see this for your {view.noun}, now.
          </h2>
          <p className="mt-3 max-w-measure text-[16.5px] leading-relaxed text-paper/80">
            Your own branded survey, your own link and QR code, and your own results — live, as your young people answer.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-4">
            <Link
              href="/join"
              className="rounded-lg border-2 border-emerald bg-emerald px-6 py-3.5 text-[15px] font-semibold text-plate no-underline hover:bg-emerald-deep"
            >
              Join the Jesus Index →
            </Link>
            <Link href="/tour" className="text-[14.5px] font-semibold text-paper underline decoration-paper/40 underline-offset-4 hover:decoration-paper">
              Or take the guided tour
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

/* ── one sample's season, in four steps ─────────────────────────────── */

function Season({ view }: { view: DemoView }) {
  const { org } = view;
  const name = short(org);
  const d = useMemo(() => sampleDashboard(org), [org]);
  const counts = useMemo(() => sampleTierCounts(org), [org]);
  const reading = useMemo(() => read(d), [d]);
  const set = ITEM_SETS.find((s) => s.name === view.survey) ?? ITEM_SETS[0];
  const trend = d.trend ?? [];
  // Movement since their first season — what a leader asks first.
  const change = trend.length > 1 ? Number((trend[trend.length - 1].index - trend[0].index).toFixed(1)) : null;

  return (
    <>
      <section className="pt-10">
        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-rule bg-plate p-5 shadow-sm">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[20px] font-black text-white" style={{ background: org.brand }}>
            {name.charAt(0)}
          </span>
          <p className="min-w-0 flex-1 text-[16px] leading-relaxed text-ink-2">
            <b className="text-ink">{name}</b> <span className="text-muted">· {view.who} · {org.country} · fictional</span>
            <br />
            {name} {view.intro}
          </p>
        </div>
      </section>

      <Step n={1} title="They make it theirs." lead="Their name, their colour, their own link and QR code. The Jesus Index sits quietly in the footer.">
        <DemoFrame label="Demo set-up">
          <div className="grid items-center gap-6 md:grid-cols-[1fr_auto]">
            <div className="overflow-hidden rounded-2xl border border-rule bg-plate shadow-sm">
              <div className="flex items-center gap-3 px-5 py-4 text-white" style={{ background: org.brand }}>
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-lg font-black" style={{ color: org.brand }}>
                  {name.charAt(0)}
                </span>
                <span>
                  <span className="block font-semibold leading-tight">{name}</span>
                  <span className="block text-xs opacity-90">{org.country}</span>
                </span>
              </div>
              <dl className="grid gap-3 px-5 py-4 text-[14px] sm:grid-cols-2">
                <div><dt className="figcap">Their link</dt><dd className="tabular mt-1 text-ink">jfindx.org/{org.slug}</dd></div>
                <div><dt className="figcap">Survey</dt><dd className="mt-1 text-ink">{set.label} · about {set.minutes} minutes</dd></div>
                <div><dt className="figcap">Rooms</dt><dd className="mt-1 text-ink">{view.rooms}</dd></div>
                <div><dt className="figcap">Consent</dt><dd className="mt-1 text-ink">Confirmed for the {view.noun} and each survey</dd></div>
              </dl>
            </div>
            <div className="flex flex-col items-center gap-2">
              <QrCode value={`https://jfindx.org/${org.slug}`} size={156} label={`QR code for ${name}'s demo survey`} />
              <span className="text-[12px] text-muted">Their own QR code</span>
            </div>
          </div>
        </DemoFrame>
      </Step>

      <Step n={2} title="Their young people answer — on any phone." lead={`${view.invite} Try it: nothing you tap is saved.`}>
        <div className="grid items-center gap-10 md:grid-cols-[1fr_380px]">
          <ul className="flex flex-col gap-4 text-[15.5px] leading-relaxed text-ink-2">
            <li><b className="text-ink">Under their name.</b> To a young person it is {name} asking — because it is.</li>
            <li><b className="text-ink">No names, emails or birthdays.</b> Age is a band. Only grouped results are ever shown — to {name} too.</li>
            <li><b className="text-ink">Works with a bad signal.</b> Answers wait on the phone and send when it&apos;s back.</li>
            <li><b className="text-ink">Every path counts.</b> Those not yet following Jesus answer their own questions, scored apart.</li>
          </ul>
          <SurveyDemo large org={org} />
        </div>
      </Step>

      <Step n={3} title="Their results arrive live." lead="The same dashboard every ministry gets. Every score carries its sample size, and nothing points at a person.">
        <DemoFrame label="Demo dashboard">
          <IndexPlate value={d.index} n={d.n} change={change} edition={`${name} · this season`} caption="Change shown since their first season" />
          <div className="mt-8 grid gap-x-12 gap-y-10 md:grid-cols-2">
            <Plate label="The journey" figure="i"><JourneyFunnel tiers={d.tiers} counts={counts} /></Plate>
            <Plate label="The three questions" figure="ii"><DomainBars domains={d.domains} /></Plate>
          </div>
          <div className="mt-10">
            <Plate label="The J12 · questions × tiers" figure="iii"><Matrix matrix={d.matrix} /></Plate>
          </div>
          <div className="mt-10 grid gap-x-12 gap-y-10 md:grid-cols-[1fr_1.4fr]">
            <Plate label="Season on season" figure="iv"><TrendPlate trend={trend} /></Plate>
            <Plate label="Question by question · first eight" figure="v">
              <ItemLedger items={d.items.slice(0, 8)} labelFor={itemLabel} />
            </Plate>
          </div>
          <IntegrityNote extra="Invented figures, for the demo only." />
        </DemoFrame>
      </Step>

      <Step n={4} title="They decide what to change." lead="Read from the figures above — a starting point for the leaders' conversation, not a prescription.">
        <DemoFrame label="Demo reading">
          <ol className="grid gap-4 md:grid-cols-3">
            {reading.map((r, i) => (
              <li key={r.h} className="rounded-xl bg-paper-deep p-5">
                <span className="tabular text-[12px] text-muted">0{i + 1}</span>
                <p className="mt-1 text-[17px] font-bold leading-snug text-ink">{r.h}</p>
                <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">{r.p}</p>
              </li>
            ))}
          </ol>
          <p className="mt-5 text-[14px] text-ink-2">
            Then &ldquo;What does this mean?&rdquo; sends the question — with the view attached — to a Collab facilitator, and next
            season&apos;s survey shows whether the change worked.
          </p>
        </DemoFrame>
      </Step>
    </>
  );
}

function Step({ n, title, lead, children }: { n: number; title: string; lead: string; children: React.ReactNode }) {
  const id = `step-${n}`;
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-6 py-12">
      <GradientRule className="mb-10" />
      <p className="figcap">Step {n} of 4</p>
      <h2 id={`${id}-h`} className="mt-2 text-[26px] font-bold leading-tight tracking-tight sm:text-[30px]">{title}</h2>
      <p className="mt-2 max-w-measure text-[16px] leading-relaxed text-ink-2">{lead}</p>
      <div className="mt-8">{children}</div>
    </section>
  );
}

/** Three plain sentences computed from the dashboard — never typed. */
function read(d: ReturnType<typeof sampleDashboard>): { h: string; p: string }[] {
  const tiers = TIERS.map((t) => ({ t, v: d.tiers[t] ?? null }));
  let drop = { from: TIERS[0] as string, to: TIERS[1] as string, by: -Infinity };
  for (let i = 1; i < tiers.length; i++) {
    const a = tiers[i - 1].v, b = tiers[i].v;
    if (a !== null && b !== null && a - b > drop.by) drop = { from: tiers[i - 1].t, to: tiers[i].t, by: Math.round((a - b) * 10) / 10 };
  }
  const doms = DOMAINS.map((k) => ({ k, v: d.domains[k] ?? null })).filter((x): x is { k: (typeof DOMAINS)[number]; v: number } => x.v !== null);
  const strong = [...doms].sort((a, b) => b.v - a.v)[0];
  let low = { d: DOMAINS[0] as string, t: TIERS[0] as string, v: Infinity };
  for (const dk of DOMAINS) for (const tk of TIERS) {
    const v = d.matrix[dk]?.[tk];
    if (typeof v === "number" && v < low.v) low = { d: dk, t: tk, v };
  }
  return [
    {
      h: `The biggest step down is ${TIER_LABEL[drop.from]} → ${TIER_LABEL[drop.to]}.`,
      p: `The journey narrows by ${fig(drop.by)} there — the place to look first. Young people get as far as ${TIER_LABEL[drop.from].toLowerCase()} and stall.`,
    },
    {
      h: `${DOMAIN_SHORT[strong.k]} is their strongest question.`,
      p: `At ${fig(strong.v)} on the 1–5 scale. Name what is working there and protect it while changing something else.`,
    },
    {
      h: `Weakest cell: “${MATRIX_PHRASE[low.d][low.t]}”.`,
      p: `${DOMAIN_SHORT[low.d]} × ${TIER_LABEL[low.t]} scores ${fig(low.v)}. One concrete practice aimed at this cell gives next season something to measure.`,
    },
  ];
}
