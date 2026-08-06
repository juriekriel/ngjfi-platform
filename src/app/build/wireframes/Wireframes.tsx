"use client";

import { useState } from "react";
import Link from "next/link";
import { Colophon, Masthead } from "@/components/site/Chrome";
import { Plate } from "@/components/index/Figures";

/**
 * The Index — console wireframes for every tier.
 *
 * Four tiers, one console. The point of this page is that they are the SAME
 * console: identical five-band spine, identical furniture, identical position
 * for every action. Someone who learns the organisation console has already
 * learned the network one. What changes between tiers is scope, not shape.
 *
 * These are wireframes, but they are wireframes drawn in the live design
 * system — same tokens, same <Plate>, same rule weights — so nothing here can
 * promise a look the product cannot ship. The legend marks each band by
 * whether its data layer already exists:
 *
 *   LIVE     the RPC is applied in the database and returns real rows today
 *   TO BUILD the surface AND the RPC still have to be written
 *   PARTIAL  the data exists but is not yet shaped for this surface
 *
 * The load-bearing decision on this page is the two verbs — FIELD and CONVENE.
 * See <Verbs /> below. Every tier can set up a survey; what differs is whether
 * the result is one campaign or a wave that many organisations adopt.
 */

/* ── the tiers ───────────────────────────────────────────────────────── */

type TierKey = "admin" | "collab" | "network" | "org";

const TIERS: { key: TierKey; label: string; who: string; scope: string }[] = [
  {
    key: "admin",
    label: "Administrator",
    who: "Jurie · Ulrich",
    scope: "Everything, both data spaces, plus the ability to look through any other console",
  },
  {
    key: "collab",
    label: "Collab",
    who: "Next Gen Global Collab research + strategy",
    scope: "The pooled picture across every organisation. Convenes the seasons that make it comparable",
  },
  {
    key: "network",
    label: "Network",
    who: "NXT Move · a denomination · a city cluster",
    scope: "Across its member organisations — aggregate always, per-member only where consented",
  },
  {
    key: "org",
    label: "Organisation",
    who: "Shoreline Church",
    scope: "Its own respondents, its own brand, its own links. Sees no other organisation, ever",
  },
];

type State = "live" | "partial" | "build";

const STATE_LABEL: Record<State, string> = {
  live: "live",
  partial: "partial",
  build: "to build",
};

/* ── wireframe primitives ────────────────────────────────────────────── */

/** A band of the console. Border weight encodes whether the data layer exists. */
function Band({
  n,
  title,
  state,
  rpc,
  gloss,
  children,
}: {
  n: string;
  title: string;
  state: State;
  rpc?: string;
  gloss: string;
  children: React.ReactNode;
}) {
  const edge =
    state === "live"
      ? "border-ink"
      : state === "partial"
        ? "border-rule-2"
        : "border-rule border-dashed";
  const dot =
    state === "live" ? "bg-emerald" : state === "partial" ? "bg-navy" : "bg-transparent border border-muted";

  return (
    <section className={`border-l-2 ${edge} pl-4 sm:pl-5`}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-[19px] leading-tight">
          <span className="tabular mr-2 text-[12px] text-muted">{n}</span>
          {title}
        </h3>
        <span className="tabular flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-muted">
          <span className={`inline-block h-[7px] w-[7px] ${dot}`} />
          {STATE_LABEL[state]}
          {rpc && <span className="ml-1 normal-case tracking-normal text-faint">· {rpc}</span>}
        </span>
      </header>
      <p className="margin-note mt-1.5 max-w-measure">{gloss}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** A row in a wireframed list — the thing the tier actually acts on. */
function Row({
  label,
  meta,
  action,
  tone = "plain",
}: {
  label: React.ReactNode;
  meta?: string;
  action?: string;
  tone?: "plain" | "urgent" | "done";
}) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule py-2.5">
      <span className="min-w-0 text-[15px] leading-snug">
        {tone === "urgent" && <span className="mr-2 text-vermillion">▲</span>}
        {tone === "done" && <span className="mr-2 text-emerald">✓</span>}
        {label}
      </span>
      <span className="flex shrink-0 items-baseline gap-3">
        {meta && <span className="tabular text-[12px] text-ink-2">{meta}</span>}
        {action && (
          <span className="tabular border border-rule-2 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-ink-2">
            {action}
          </span>
        )}
      </span>
    </li>
  );
}

function Rows({ children }: { children: React.ReactNode }) {
  return <ul className="border-t border-ink">{children}</ul>;
}

/** A primary control, drawn not wired. */
function Btn({ children, primary = false }: { children: React.ReactNode; primary?: boolean }) {
  return (
    <span
      className={`tabular inline-block px-4 py-2.5 text-[10px] uppercase tracking-[0.14em] ${
        primary
          ? "border-2 border-emerald bg-emerald text-plate"
          : "border border-ink text-ink"
      }`}
    >
      {children}
    </span>
  );
}

/** A figure standing in for a chart that already exists elsewhere in the app. */
function FigureSlot({ label, note }: { label: string; note: string }) {
  return (
    <div className="border border-rule bg-plate px-4 py-5">
      <p className="figcap">{label}</p>
      <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">{note}</p>
    </div>
  );
}

/* ── the four consoles ───────────────────────────────────────────────── */

function AdminConsole() {
  return (
    <div className="space-y-9">
      <Band
        n="A"
        title="Waiting on you"
        state="live"
        rpc="admin_worklist()"
        gloss="A worklist, not a dashboard. If nothing is on it, nobody is blocked on you. It is the only band that is allowed to be empty."
      >
        <Rows>
          <Row label="Access request · ulrich@nxtmove.org" meta="2 days" action="Approve · Decline" tone="urgent" />
          <Row label="Shoreline Church has a live survey and 0 responses" meta="4 days" action="Nudge" tone="urgent" />
          <Row label="Instrument v1 not yet seeded to the database" meta="blocking" action="Run db:seed" tone="urgent" />
          <Row label="2 organisations have no logo set" meta="cosmetic" action="View" />
        </Rows>
        <p className="margin-note mt-3 border-l-2 border-rule pl-3">
          Approving a request records a decision. It never grants a tier — that stays a separate
          deliberate act, so nobody becomes an administrator as a side effect of clearing a queue.
        </p>
      </Band>

      <Band
        n="B"
        title="Surveys"
        state="build"
        rpc="campaign_upsert() · wave_upsert()"
        gloss="Both verbs, unrestricted. An administrator may field for any organisation and convene any wave — and every act of fielding on someone else's behalf is written to the audit log with your name on it."
      >
        <div className="flex flex-wrap gap-3">
          <Btn primary>Field for an organisation →</Btn>
          <Btn>Convene a wave →</Btn>
        </div>
        <div className="mt-5">
          <p className="figcap">The wave register</p>
          <Rows>
            <Row label="Field III · core-12 · community + public" meta="opens 01 Sep · 0 adopted" action="Edit" />
            <Row label="Field II · full set · community" meta="closed · sample data only" action="Archive" tone="done" />
          </Rows>
        </div>
      </Band>

      <Band
        n="C"
        title="The reading"
        state="live"
        rpc="data_space_report() · collab_intelligence()"
        gloss="The only console that sees both data spaces at once, side by side, always labelled. This is where a claim could escape unlabelled, so this is where the guard rails are loudest."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FigureSlot
            label="Live space"
            note="1 organisation · 0 sessions · 0 responses. Nothing publishable yet, and the page says so rather than showing a zero."
          />
          <FigureSlot
            label="Sandbox"
            note="26 organisations · 78,764 responses. Never published, never quoted, never counted in a benchmark."
          />
        </div>
        <div className="mt-4">
          <Rows>
            <Row label="Critical-mass gate" meta="400 completions" action="Change" />
            <Row label="Publish the global view" meta="off" action="Switch" tone="urgent" />
          </Rows>
        </div>
        <p className="margin-note mt-3 border-l-2 border-vermillion pl-3">
          The publish switch is the single control on the whole platform that can overclaim. It sits
          here, alone, with the sample size next to it — never on a settings page with fifteen others.
        </p>
      </Band>

      <Band
        n="D"
        title="The roll"
        state="live"
        rpc="view_as() · org_dashboard_admin() · network_console()"
        gloss="Every person, organisation and network, and the one thing only this tier can do: step into any other console and see exactly what they see."
      >
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <p className="figcap">Organisations</p>
            <Rows>
              <Row label="Shoreline Church" meta="jfindx.org/shoreline" action="View as →" />
            </Rows>
          </div>
          <div>
            <p className="figcap">Networks</p>
            <Rows>
              <Row label="NXT Move" meta="backbone · 1 member" action="View as →" />
            </Rows>
          </div>
        </div>
        <div className="mt-4">
          <p className="figcap">People</p>
          <Rows>
            <Row label="juriekriel@gmail.com" meta="administrator" action="Change tier" />
            <Row label="ulrich@…" meta="administrator" action="Change tier" />
          </Rows>
        </div>
        <p className="margin-note mt-3 border-l-2 border-rule pl-3">
          <b>View-as is read-only and it is logged.</b> A banner stays across the top for the whole
          session, and <span className="tabular">view_as_log</span> records who looked at what and
          when. Looking into a ministry&apos;s console is a normal thing to need and an abnormal thing
          to do quietly.
        </p>
      </Band>

      <Band
        n="E"
        title="The house"
        state="partial"
        rpc="platform_settings · instrument_versions"
        gloss="The instrument register, the reserved names, the settings. Rarely touched, and that is the point — everything here changes the meaning of every number already collected."
      >
        <Rows>
          <Row label="Instrument v1 · 42 items · draft" meta="v0 archived" action="Publish" />
          <Row label="Reserved short names" meta="34 held" action="Edit" />
          <Row label="Locales offered" meta="en · es" action="Add" />
        </Rows>
      </Band>
    </div>
  );
}

function CollabConsole() {
  return (
    <div className="space-y-9">
      <Band
        n="A"
        title="Waiting on you"
        state="build"
        rpc="collab_worklist()"
        gloss="The Collab's worklist is about coverage, not tickets. Every item is a country or a cohort that will or will not reach a benchmark this season."
      >
        <Rows>
          <Row label="South Africa is 118 completions from its first benchmark" meta="282 / 400" action="See who can close it" tone="urgent" />
          <Row label="4 organisations joined a cohort and have never fielded" meta="31 days" action="Nudge" tone="urgent" />
          <Row label="Research panel has proposed 2 wording changes to item F-03" meta="v1.1" action="Review" />
          <Row label="Portuguese translation awaiting a second reader" meta="pt-BR" action="Assign" />
        </Rows>
      </Band>

      <Band
        n="B"
        title="Surveys"
        state="build"
        rpc="wave_upsert() · wave_adopt()"
        gloss="Convening is the Collab's main verb and the reason benchmarks exist at all. A wave fixes the instrument version, the item set, the audiences and the window — then organisations adopt it in one click and are automatically comparable."
      >
        <div className="flex flex-wrap gap-3">
          <Btn primary>Convene a season →</Btn>
          <Btn>Field on behalf of an organisation →</Btn>
        </div>
        <div className="mt-5">
          <p className="figcap">Field III · Sept–Nov 2026 · adoption</p>
          <Rows>
            <Row label="NXT Move" meta="network · pushed to 1 member" action="Adopted" tone="done" />
            <Row label="Shoreline Church" meta="via NXT Move" action="Adopted" tone="done" />
            <Row label="OneHope · East West · Dare2Share" meta="invited" action="Remind" />
          </Rows>
        </div>
        <p className="margin-note mt-3 border-l-2 border-rule pl-3">
          A wave collects nothing itself. It has no respondents and no link. It is a shape that
          campaigns are cut to — which is exactly why an organisation that removes non-core items
          drops out of the comparison for those cells rather than quietly distorting it.
        </p>
      </Band>

      <Band
        n="C"
        title="The reading"
        state="live"
        rpc="collab_intelligence()"
        gloss="The pooled picture — live space only, never the sandbox. Every figure carries its sample size, and no geography is named until it passes the gate."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <FigureSlot label="Fig. 01 · the composite" note="One number, with n and a date. Grey until the gate opens." />
          <FigureSlot label="Fig. 02 · the journey" note="Exposure → response → formation → multiplication. Read the narrowing." />
          <FigureSlot label="Fig. 03 · the matrix" note="Three questions × four tiers, by region." />
        </div>
        <p className="margin-note mt-3">
          Rendered by the same <span className="tabular">components/index/Figures</span> as the org
          dashboard and the landing page. There is no second, prettier version kept for the Collab.
        </p>
      </Band>

      <Band
        n="D"
        title="The roll"
        state="partial"
        rpc="coverage_counts() · cohorts"
        gloss="Cohorts, countries and the coverage arithmetic. Concentration beats count: sixty organisations spread across forty countries unlocks nothing; the same sixty across ten unlocks all ten."
      >
        <Rows>
          <Row label="South Africa" meta="282 / 400 · 4 orgs" action="Open" />
          <Row label="Kenya" meta="0 / 400 · 0 orgs" action="Recruit" />
          <Row label="Brazil" meta="0 / 400 · 0 orgs" action="Recruit" />
        </Rows>
        <p className="margin-note mt-3 border-l-2 border-rule pl-3">
          The Collab sees which organisations are in a cohort and how many completions each
          contributes. It does <b>not</b> see any organisation&apos;s index unless that organisation
          has published it — the same consent rule networks live under.
        </p>
      </Band>

      <Band
        n="E"
        title="The house"
        state="build"
        rpc="instrument_propose()"
        gloss="The instrument is researcher-owned. The Collab tier can read every version, diff two, and propose a change — it cannot edit a published one, because responses are bound to the version they were captured under."
      >
        <Rows>
          <Row label="v1 · 42 items · 12 core" meta="current" action="Read" />
          <Row label="v0 · archived" meta="responses preserved" action="Diff" />
          <Row label="Propose a change" meta="goes to the panel" action="Open" />
        </Rows>
      </Band>
    </div>
  );
}

function NetworkConsole() {
  return (
    <div className="space-y-9">
      <Band
        n="A"
        title="Waiting on you"
        state="build"
        rpc="network_worklist()"
        gloss="A network's worklist is its members. Every item is a church that has not started, has not consented, or has not been asked."
      >
        <Rows>
          <Row label="Shoreline Church has not fielded this season" meta="Field III open" action="Send the link" tone="urgent" />
          <Row label="1 member has not consented to share its index upward" meta="aggregate only" action="Ask" />
          <Row label="2 invitations sent, not accepted" meta="9 days" action="Resend" />
        </Rows>
      </Band>

      <Band
        n="B"
        title="Surveys"
        state="build"
        rpc="campaign_upsert() · wave_adopt()"
        gloss="A network fields through an organisation — always. Responses need an owner that can be counted exactly once, and a network is counted as the sum of its members."
      >
        <div className="flex flex-wrap gap-3">
          <Btn primary>Field as NXT Move →</Btn>
          <Btn>Field for a member →</Btn>
          <Btn>Push a wave to members →</Btn>
        </div>
        <div className="mt-5">
          <p className="figcap">Who you may field for</p>
          <Rows>
            <Row label="NXT Move (itself)" meta="own organisation · always" action="Field" tone="done" />
            <Row label="Shoreline Church" meta="granted survey management" action="Field" tone="done" />
            <Row label="A member that has not granted it" meta="not permitted" action="Request" />
          </Rows>
        </div>
        <p className="margin-note mt-3 border-l-2 border-emerald pl-3">
          <b>&ldquo;Field as NXT Move&rdquo; creates NXT Move as an organisation too, and joins it to its own
          network.</b> That is not a workaround — NXT Move running its own camp genuinely is a
          different object from NXT Move containing churches, and saying so out loud keeps the
          arithmetic honest. Its responses roll into its own network picture automatically.
        </p>
      </Band>

      <Band
        n="C"
        title="The reading"
        state="live"
        rpc="network_console()"
        gloss="Aggregate across all members, always. Per-member index only where that member consented — and members who have not consented appear as a count, not as a blank row, because a blank row is still a disclosure."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FigureSlot label="Across the network" note="One index, one funnel, one matrix — pooled from every member, consented or not." />
          <FigureSlot label="By member" note="Only the members who share upward. The rest are summarised as “3 members contributing, not shown”." />
        </div>
        <div className="mt-4">
          <Rows>
            <Row label="Shoreline Church" meta="shares · index 61.4 · n 284" action="Open" tone="done" />
            <Row label="3 further members" meta="contributing · not shown" />
          </Rows>
        </div>
      </Band>

      <Band
        n="D"
        title="The roll"
        state="live"
        rpc="network_members"
        gloss="The membership, and the two consents that govern it. Being added to a network is not consent to be seen, and it is not consent to be fielded for."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left">
            <thead>
              <tr className="figcap">
                <th className="border-b border-ink pb-2 font-normal">Member</th>
                <th className="border-b border-ink pb-2 text-center font-normal">Shares index</th>
                <th className="border-b border-ink pb-2 text-center font-normal">We may field</th>
                <th className="border-b border-ink pb-2 text-right font-normal">Responses</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Shoreline Church", true, true, "0"],
                ["NXT Move (itself)", true, true, "0"],
                ["A member church", false, false, "0"],
              ].map(([n, s, f, r]) => (
                <tr key={String(n)} className="border-b border-rule">
                  <td className="py-2.5 text-[15px]">{n as string}</td>
                  <td className="tabular py-2.5 text-center text-[13px]">
                    {s ? <span className="text-emerald">yes</span> : <span className="text-muted">no</span>}
                  </td>
                  <td className="tabular py-2.5 text-center text-[13px]">
                    {f ? <span className="text-emerald">yes</span> : <span className="text-muted">no</span>}
                  </td>
                  <td className="tabular py-2.5 text-right text-[15px]">{r as string}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="margin-note mt-3 border-l-2 border-rule pl-3">
          <span className="tabular">shares_index</span> exists today and defaults to false.{" "}
          <span className="tabular">manages_surveys</span> is the second consent this wireframe
          introduces — the one that makes &ldquo;field for a member&rdquo; safe.
        </p>
      </Band>

      <Band
        n="E"
        title="The house"
        state="partial"
        rpc="networks"
        gloss="The network's own brand and its own link. A member's survey always carries the member's brand, never the network's — white-label means theirs."
      >
        <Rows>
          <Row label="Logo and colour" meta="not set" action="Upload" />
          <Row label="jfindx.org/nxtmove" meta="the network page" action="Preview" />
          <Row label="Invite a member" meta="by email or link" action="Open" />
        </Rows>
      </Band>
    </div>
  );
}

function OrgConsole() {
  return (
    <div className="space-y-9">
      <Band
        n="A"
        title="Waiting on you"
        state="build"
        rpc="org_worklist()"
        gloss="For most organisations this is the whole product. Three or four items, in plain language, each one a thing a youth pastor can finish in a minute."
      >
        <Rows>
          <Row label="Your survey is not live yet" meta="1 step left" action="Finish setup" tone="urgent" />
          <Row label="Your logo is not set" meta="respondents see ours" action="Upload" tone="urgent" />
          <Row label="Your closing message is the default" meta="optional" action="Edit" />
          <Row label="Consent wording confirmed" meta="12 Aug" tone="done" />
        </Rows>
      </Band>

      <Band
        n="B"
        title="Surveys"
        state="build"
        rpc="campaign_upsert() · org_links()"
        gloss="The wizard in full. Five steps, about four minutes, and it ends with two links and a QR code — not with a support ticket."
      >
        <div className="flex flex-wrap gap-3">
          <Btn primary>Set up your survey →</Btn>
          <Btn>Adopt the Collab&apos;s season →</Btn>
        </div>
        <div className="mt-5">
          <p className="figcap">Your links</p>
          <Rows>
            <Row label="jfindx.org/shoreline" meta="community · your people" action="Copy · QR" />
            <Row label="jfindx.org/shoreline/open" meta="public · outside your world" action="Copy · QR" />
          </Rows>
          <p className="margin-note mt-3 border-l-2 border-emerald pl-3">
            Two links, one survey. The comparison between them is the single most useful thing a
            ministry gets out of the Index: what is true of the young people you already reach,
            against what is true of the ones you do not.
          </p>
        </div>
      </Band>

      <Band
        n="C"
        title="The reading"
        state="live"
        rpc="org_dashboard()"
        gloss="Your results, the moment the first response lands. Nobody else's, ever — and no individual response, not even your own respondents'."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FigureSlot label="Fig. 01 · your index" note="With n, always. Below the gate it says so instead of pretending." />
          <FigureSlot label="Fig. 02 · your journey" note="Where your young people fall away between belief and reproduction." />
          <FigureSlot label="Fig. 03 · community vs public" note="Your two audiences side by side. The gap is your strategy." />
          <FigureSlot label="Fig. 04 · the benchmark" note="Locked until your country passes 400 completions. Shown as locked, not as zero." />
        </div>
      </Band>

      <Band
        n="D"
        title="The roll"
        state="build"
        rpc="org_members"
        gloss="Who else at your organisation can see this. Small, and deliberately so."
      >
        <Rows>
          <Row label="pastor@shoreline.org" meta="owner" action="—" />
          <Row label="Invite a colleague" meta="by email" action="Open" />
        </Rows>
      </Band>

      <Band
        n="E"
        title="The house"
        state="partial"
        rpc="organisations"
        gloss="Everything a respondent sees. This is the white-label surface: your brand at the top, the Index in the footer, and nothing in between that says us."
      >
        <Rows>
          <Row label="Logo · colour" meta="not set" action="Upload" />
          <Row label="Welcome message" meta="default" action="Edit" />
          <Row label="Closing message" meta="default" action="Edit" />
          <Row label="Languages offered" meta="en" action="Add" />
          <Row label="Questions asked" meta="12 core · 30 extra" action="Customise" />
        </Rows>
        <p className="margin-note mt-3 border-l-2 border-vermillion pl-3">
          The twelve core items cannot be unticked. Extras can — with a plain warning that removing
          them drops you out of the benchmark for those cells. Discouraged, available, and never
          silent.
        </p>
      </Band>
    </div>
  );
}

/* ── the survey wizard, shared by all four tiers ─────────────────────── */

const STEPS: { n: string; title: string; body: string; tiers: string }[] = [
  {
    n: "00",
    title: "Who is fielding this",
    body: "Resolves to exactly one organisation, always. An organisation skips this step because the answer is itself. A network chooses a member it may act for, or itself. An administrator may choose anyone, and the choice is logged.",
    tiers: "Network · Collab · Administrator",
  },
  {
    n: "01",
    title: "What we ask",
    body: "Instrument version is fixed to the current published one. Item set: the twelve (about four minutes) or the full set (about seven). The twelve cannot be unticked; extras can, with the benchmark warning shown at the moment of unticking, not buried in a footnote.",
    tiers: "Every tier",
  },
  {
    n: "02",
    title: "Who we ask",
    body: "Community, public, or both — two links off one survey so the comparison is built in rather than bolted on. Age bands and locales are chosen here, and both are data from the instrument config, so adding a 45–65 cohort tomorrow changes nothing in this screen.",
    tiers: "Every tier",
  },
  {
    n: "03",
    title: "How it looks",
    body: "Logo, colour, welcome and closing message — with a live phone preview rendered by the real question renderer, not a picture of one. Change the colour and the preview changes, because it is the same component the respondent will load.",
    tiers: "Every tier",
  },
  {
    n: "04",
    title: "Consent",
    body: "The organisation's own consent wording, and parental consent for 13–17 handled at the edge by the organisation that knows those families. Nothing identifiable ever reaches us — the screen says exactly what is stored, in a list, before anything is published.",
    tiers: "Every tier",
  },
  {
    n: "05",
    title: "Publish",
    body: "Two links, two QR codes, a printable card. Plus one honest sentence: your own results appear immediately; a benchmark for your country appears once 400 people there have completed the Index.",
    tiers: "Every tier",
  },
];

function Wizard() {
  return (
    <div className="mt-6 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
      {STEPS.map((s) => (
        <div key={s.n} className="border-t-2 border-ink pt-3">
          <p className="figcap">
            Step {s.n} · {s.tiers}
          </p>
          <h4 className="mt-1.5 text-[18px] leading-tight">{s.title}</h4>
          <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">{s.body}</p>
        </div>
      ))}
    </div>
  );
}

/* ── the decision this wireframe settles ─────────────────────────────── */

function Verbs() {
  return (
    <div className="mt-6 grid gap-8 md:grid-cols-2">
      <div className="border-t-2 border-emerald pt-3">
        <p className="figcap">Verb 01</p>
        <h4 className="mt-1.5 text-[21px] leading-tight">Field</h4>
        <p className="mt-2 max-w-measure text-[15.5px] leading-relaxed text-ink-2">
          Run a survey and collect responses. <b>Always owned by exactly one organisation.</b> Every
          response traces to an owner that can be counted once — that is not bureaucracy, it is what
          keeps a benchmark from double-counting a church that sits in three networks.
        </p>
      </div>
      <div className="border-t-2 border-navy pt-3">
        <p className="figcap">Verb 02</p>
        <h4 className="mt-1.5 text-[21px] leading-tight">Convene</h4>
        <p className="mt-2 max-w-measure text-[15.5px] leading-relaxed text-ink-2">
          Define a wave — version, item set, audiences, window, locales — that organisations adopt in
          one click. <b>Collects nothing itself.</b> It is the thing that makes forty organisations
          comparable instead of merely simultaneous.
        </p>
      </div>
      <div className="md:col-span-2">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left">
            <thead>
              <tr className="figcap">
                <th className="border-b border-ink pb-2 font-normal">Tier</th>
                <th className="border-b border-ink pb-2 font-normal">May field for</th>
                <th className="border-b border-ink pb-2 font-normal">May convene</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Organisation", "Itself", "—"],
                ["Network", "Itself, plus any member that granted it", "Its members"],
                ["Collab", "Any organisation, on request", "The whole coalition"],
                ["Administrator", "Anyone — logged", "Anything — logged"],
              ].map(([a, b, c]) => (
                <tr key={a} className="border-b border-rule">
                  <th scope="row" className="py-2.5 text-left text-[15px] font-normal">
                    {a}
                  </th>
                  <td className="py-2.5 text-[15px] text-ink-2">{b}</td>
                  <td className="py-2.5 text-[15px] text-ink-2">{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="margin-note mt-3 border-l-2 border-rule pl-3">
          Every tier can set up a survey. What differs is <i>for whom</i> — and the answer is never
          &ldquo;for nobody in particular&rdquo;, because a response with no owning organisation cannot be
          counted, compared, or deleted on request.
        </p>
      </div>
    </div>
  );
}

/* ── the page ────────────────────────────────────────────────────────── */

export default function Wireframes() {
  const [tier, setTier] = useState<TierKey>("admin");
  const active = TIERS.find((t) => t.key === tier)!;

  return (
    <>
      <Masthead edition="The Index · console wireframes · not a live surface" />

      <main className="mx-auto max-w-5xl px-5 py-10">
        <div className="border-b border-ink pb-5">
          <p className="figcap">The engine · specification</p>
          <h1 className="mt-2 text-[34px] leading-tight sm:text-[42px]">
            One console, <span className="italic">four</span> tiers.
          </h1>
          <p className="mt-3 max-w-measure text-[17px] leading-relaxed text-ink-2">
            The same five bands, in the same order, at every tier. Someone who learns the
            organisation console has already learned the network one. What changes between tiers is{" "}
            <b>scope</b>, never shape — and the one thing every tier can do is set up a survey.
          </p>
          <p className="margin-note mt-4 border-l-2 border-rule pl-3">
            Drawn in the live design system, not in a drawing tool. Same tokens, same components,
            same rule weights as the shipped product — so nothing on this page can promise a look the
            platform cannot build.
          </p>
        </div>

        {/* ── the two verbs — the decision this settles ──────────────── */}
        <section className="py-9">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule pb-3">
            <h2 className="text-[26px] leading-tight">Every tier sets up surveys. Two ways.</h2>
            <p className="margin-note">The decision this wireframe settles.</p>
          </div>
          <Verbs />
        </section>

        {/* ── the tier switcher ─────────────────────────────────────── */}
        <section className="border-t-2 border-ink pt-6">
          <div className="flex flex-wrap gap-2">
            {TIERS.map((t) => (
              <button
                key={t.key}
                data-tier={t.key}
                aria-pressed={t.key === tier}
                onClick={() => setTier(t.key)}
                className={`tabular px-4 py-2.5 text-[11px] uppercase tracking-[0.14em] ${
                  t.key === tier
                    ? "border-2 border-ink bg-ink text-paper"
                    : "border border-rule-2 text-ink-2 hover:border-ink hover:text-ink"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="mt-6 grid gap-3 border-b border-rule pb-5 sm:grid-cols-[auto_1fr] sm:gap-8">
            <div>
              <p className="figcap">Who signs in</p>
              <p id="tier-who" className="mt-1 text-[16px]">
                {active.who}
              </p>
            </div>
            <div>
              <p className="figcap">What they see</p>
              <p id="tier-scope" className="mt-1 max-w-measure text-[16px] leading-relaxed text-ink-2">
                {active.scope}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
            <p className="figcap">Legend</p>
            <span className="tabular flex items-center gap-1.5 text-[11px] text-ink-2">
              <span className="inline-block h-[7px] w-[7px] bg-emerald" /> live — the RPC is applied today
            </span>
            <span className="tabular flex items-center gap-1.5 text-[11px] text-ink-2">
              <span className="inline-block h-[7px] w-[7px] bg-navy" /> partial — data exists, surface does not
            </span>
            <span className="tabular flex items-center gap-1.5 text-[11px] text-ink-2">
              <span className="inline-block h-[7px] w-[7px] border border-muted" /> to build
            </span>
          </div>

          <div className="mt-9">
            {tier === "admin" && <AdminConsole />}
            {tier === "collab" && <CollabConsole />}
            {tier === "network" && <NetworkConsole />}
            {tier === "org" && <OrgConsole />}
          </div>
        </section>

        {/* ── the wizard ────────────────────────────────────────────── */}
        <section className="mt-12 border-t-2 border-ink pt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule pb-3">
            <h2 className="text-[26px] leading-tight">Setting up a survey — one wizard, every tier.</h2>
            <p className="margin-note">Six steps. Step 00 is skipped by organisations.</p>
          </div>
          <Wizard />
        </section>

        {/* ── what it costs to build ────────────────────────────────── */}
        <section className="mt-12 border-t-2 border-ink pt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule pb-3">
            <h2 className="text-[26px] leading-tight">What this implies.</h2>
            <p className="margin-note">Migration 0014, and four surfaces.</p>
          </div>
          <div className="mt-6">
            <Plate label="The database" figure="one migration">
              <Rows>
                <Row
                  label={
                    <>
                      <span className="tabular">network_members.manages_surveys</span> — the second
                      consent, defaulting to false
                    </>
                  }
                  meta="new column"
                />
                <Row
                  label={
                    <>
                      <span className="tabular">waves</span> and{" "}
                      <span className="tabular">wave_adoptions</span> — the convening object, which
                      owns no responses
                    </>
                  }
                  meta="new tables"
                />
                <Row
                  label={
                    <>
                      <span className="tabular">campaign_upsert()</span> — one entry point, which
                      checks the caller&apos;s tier and logs fielding on someone else&apos;s behalf
                    </>
                  }
                  meta="new RPC"
                />
                <Row
                  label={
                    <>
                      <span className="tabular">org_worklist()</span> ·{" "}
                      <span className="tabular">network_worklist()</span> ·{" "}
                      <span className="tabular">collab_worklist()</span> — band A at the other three
                      tiers
                    </>
                  }
                  meta="new RPCs"
                />
              </Rows>
              <p className="margin-note mt-3 border-l-2 border-rule pl-3">
                Nothing here changes an existing table&apos;s meaning, and nothing here touches the
                respondent path. <span className="tabular">network_console()</span>,{" "}
                <span className="tabular">org_dashboard_admin()</span> and{" "}
                <span className="tabular">view_as()</span> already carry band C and band D for two of
                the four tiers.
              </p>
            </Plate>
          </div>
        </section>

        <div className="mt-10 flex flex-wrap gap-3 border-t border-ink pt-6">
          <Link
            href="/build"
            className="tabular border-2 border-ink bg-ink px-5 py-3 text-[11px] uppercase tracking-[0.14em] text-paper no-underline"
          >
            ← The live console
          </Link>
          <Link
            href="/tour"
            className="tabular border border-ink px-5 py-3 text-[11px] uppercase tracking-[0.14em] text-ink no-underline"
          >
            The walkthrough →
          </Link>
        </div>
      </main>

      <Colophon />
    </>
  );
}
