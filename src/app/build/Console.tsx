"use client";

import VersionHistory from "@/components/console/VersionHistory";
import { instrument } from "@/lib/instrument";
import { TEAM_ROLE_LABEL, normaliseRole } from "@/lib/team";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import { GradientRule, Masthead } from "@/components/site/Chrome";
import {
  Action,
  Awaiting,
  Band,
  HouseFigures,
  HouseRows,
  LinkRow,
  Row,
  Rows,
  Tile,
  TileList,
  Trouble,
  Worklist,
  type HouseSettings,
  type WorkItem,
} from "@/components/console/Bands";
import PilotReadiness from "@/components/console/PilotReadiness";
import CollabCompletion from "@/components/console/CollabCompletion";
import ConsentRegister from "@/components/console/ConsentRegister";
import SurveyWizard from "@/components/console/SurveyWizard";
import { ConsultingRequestsBand, useConsultingRequests } from "@/components/console/ConsultingRequests";
import { linkError } from "@/lib/authLinks";
import { ApplicationsBand, NoHouse, OrgManagePanel, useApplications } from "@/components/console/Onboarding";
import CommsBoard, { useCommsCount } from "@/components/console/CommsBoard";

/**
 * The Index — the authenticated engine, at every tier.
 *
 * One console, four scopes. The five bands are the same components in the same
 * order whether you are Shoreline Church or an administrator; what changes is
 * which RPC fills them. See `claude/index-console-tiers-and-survey-verbs.md`
 * for why. (The /build/wireframes spec page was retired in Oct 2026 — this
 * file is the specification now.)
 *
 * EVERY authorisation decision happens in the database — `my_context()`,
 * `field_authority()`, `campaign_upsert()` — never here. This component renders
 * whatever it is allowed to fetch and is told nothing it should not see, which
 * is why a bug in it can make the UI wrong but cannot leak a number.
 */

type Ctx = {
  signed_in: boolean;
  email?: string;
  role?: "admin" | "collab" | "org";
  orgs?: { slug?: string; short_name: string; name: string; is_demo: boolean }[];
  networks?: { short_name: string; name: string; kind: string }[];
};

type Scope =
  | { kind: "admin" }
  | { kind: "collab" }
  | { kind: "network"; short_name: string; name: string }
  | { kind: "org"; short_name: string; name: string };

const TIER_LABEL: Record<string, string> = {
  admin: "Administrator",
  collab: "Collab",
  network: "Network",
  org: "Organisation",
};

export default function Console() {
  const sb = useMemo(() => getSupabaseBrowser(), []);
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [scope, setScope] = useState<Scope | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    if (!sb) {
      setErr("Supabase isn't configured for this deployment.");
      setReady(true);
      return;
    }
    // Turn any invitation for this (verified) email into a membership first,
    // so someone invited before they ever signed in lands in their
    // organisation on their very first visit (migration 0034). Harmless
    // before 0034 is applied: the error is ignored and nothing changes.
    await sb.rpc("claim_my_invites").then(() => undefined, () => undefined);
    const { data, error } = await sb.rpc("my_context");
    if (error) setErr(error.message);
    const c = (data as Ctx) ?? { signed_in: false };
    setCtx(c);

    // Land people in the most specific house they own. A youth pastor with one
    // organisation should never have to pick anything to see their own work.
    if (c.signed_in) {
      if (c.role === "admin") setScope({ kind: "admin" });
      else if (c.role === "collab") setScope({ kind: "collab" });
      else if (c.networks?.length)
        setScope({ kind: "network", short_name: c.networks[0].short_name, name: c.networks[0].name });
      else if (c.orgs?.length) {
        // An organisation's signed-in home is its two-tab dashboard, not this
        // console (locked design, Sept 2026). The console stays reachable for
        // survey setup via /build?settings=1 — the dashboard's "Survey
        // settings" link.
        const wantsSettings = new URLSearchParams(window.location.search).has("settings");
        const home = c.orgs[0].slug;
        if (!wantsSettings && home) {
          window.location.replace(`/${home}/dashboard`);
          return;
        }
        setScope({ kind: "org", short_name: c.orgs[0].short_name, name: c.orgs[0].name });
      }
    }
    setReady(true);
  }, [sb]);

  useEffect(() => {
    load();
  }, [load]);

  if (!ready)
    return (
      <Shell tier="" scope={null} ctx={null} onScope={() => {}}>
        <p className="text-[15px] text-muted">Loading…</p>
      </Shell>
    );

  if (!ctx?.signed_in) {
    // Arriving from a sign-in link that didn't create a session used to look
    // exactly like never having signed in — a silent loop. Say why instead.
    const fromLink =
      typeof window !== "undefined"
        ? linkError(window.location.search, window.location.hash) ??
          (new URLSearchParams(window.location.search).has("code")
            ? "That link was opened in a different browser than the one that asked for it, or a newer link has been requested since. Request a fresh link and open it on this device — or use the newest email."
            : null)
        : null;
    return (
      <Shell tier="" scope={null} ctx={null} onScope={() => {}}>
        <Band
          letter="—"
          title={fromLink ? "That link didn't sign you in" : "Not signed in"}
          gloss={fromLink ?? "The Index is the working engine behind jfindx.org. It needs a ministry email and a one-time sign-in link."}
        >
          <Link
            href="/access"
            className="inline-block rounded-lg bg-gradient-to-r from-violet via-violet-deep to-violet-deeper px-5 py-3 text-[14px] font-semibold text-plate no-underline hover:opacity-90"
          >
            {fromLink ? "Send me a new link →" : "Sign in →"}
          </Link>
        </Band>
      </Shell>
    );
  }

  const tier = scope ? TIER_LABEL[scope.kind] : "";

  return (
    <Shell tier={tier} scope={scope} ctx={ctx} onScope={setScope}>
      {err && <Trouble message={err} />}

      {!scope && <NoHouse />}

      {scope?.kind === "admin" && <AdminConsole />}
      {scope?.kind === "collab" && <CollabConsole />}
      {scope?.kind === "network" && <NetworkConsole short={scope.short_name} name={scope.name} />}
      {scope?.kind === "org" && <OrgConsole short={scope.short_name} name={scope.name} />}
    </Shell>
  );
}

/* ══ Organisation ═════════════════════════════════════════════════════ */

function OrgConsole({ short, name }: { short: string; name: string }) {
  const sb = useMemo(() => getSupabaseBrowser(), []);
  const [wl, setWl] = useState<{
    org: { short_name: string; name: string; is_demo: boolean };
    responses: number;
    links: Record<string, { url: string; label: string; note: string }>;
    items: WorkItem[];
  } | null>(null);
  const [dash, setDash] = useState<{ index: number | null; n: number } | null>(null);
  const [wizard, setWizard] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sb) return;
    const { data, error } = await sb.rpc("org_worklist", { p_short_name: short });
    if (error) setErr(error.message);
    else setWl(data as typeof wl);
    const { data: d } = await sb.rpc("org_dashboard", { p_org_slug: short });
    if (d) setDash(d as typeof dash);
  }, [sb, short]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-10">
      {err && <Trouble message={err} />}

      <Band letter="A" title="Waiting on you" gloss="A worklist, not a dashboard. If nothing is on it, nothing is blocked." figure={`${wl?.items.length ?? 0} item${wl?.items.length === 1 ? "" : "s"}`}>
        <Worklist items={wl?.items ?? []} empty="Nothing pending. Your survey is set up and running." />
      </Band>

      <Band letter="B" title="Surveys" gloss="Your survey, your brand, your links. About seven minutes on a phone." figure={short}>
        <Link href="/build/instrument" className="mb-4 inline-block rounded-lg border border-rule-2 px-4 py-2.5 text-[14px] font-semibold text-ink no-underline hover:border-ink">
            The instrument — items, checks, proposals →
          </Link>
        {wizard ? (
          <SurveyWizard
            fixedOrg={short}
            onDone={() => {
              setWizard(false);
              load();
            }}
            onCancel={() => setWizard(false)}
          />
        ) : (
          <>
            <Action primary onClick={() => setWizard(true)}>
              {wl?.links ? "Change your survey →" : "Set up your survey →"}
            </Action>
            {wl?.links && (
              <ul className="mt-5 border-t border-rule">
                <LinkRow {...wl.links.community} />
                <LinkRow {...wl.links.public} />
              </ul>
            )}
            {wl?.links && (
              <p className="margin-note mt-3 border-l-2 border-emerald pl-3">
                Two links, one survey. The comparison between them is the single most useful thing
                a ministry gets out of the Index: what is true of the young people you already
                reach, against what is true of the ones you do not.
              </p>
            )}
          </>
        )}
      </Band>

      <Band letter="C" title="The reading" gloss="Yours, the moment the first response lands. Nobody else's, and never an individual answer — not even your own respondents'." figure={`n ${wl?.responses ?? 0}`}>
        {(wl?.responses ?? 0) === 0 ? (
          <Awaiting
            what="No responses yet"
            why="Your index, journey funnel and the community-versus-public comparison appear here as soon as someone finishes. Until then there is nothing to show, and showing a zero would be a lie."
          />
        ) : (
          <>
            <Rows>
              <Row label="Your index" meta={dash?.index != null ? `${dash.index.toFixed(1)} · n ${dash.n}` : "—"} />
            </Rows>
            <Link
              href={`/${short}/dashboard`}
              className="mt-4 inline-block rounded-lg bg-gradient-to-r from-violet via-violet-deep to-violet-deeper px-4 py-2.5 text-[14px] font-semibold text-plate no-underline hover:opacity-90"
            >
              Open the full dashboard →
            </Link>
          </>
        )}
      </Band>

      <Band letter="D" title="The roll" gloss="Who else at your organisation can see this. Small, deliberately." figure={name}>
        <Awaiting what="Invitations" why="Adding colleagues arrives with the next build step. For now, ask an administrator to attach someone." />
      </Band>

      <Band letter="E" title="Your brand" gloss="Everything a respondent sees: your brand at the top, the Index in the footer, nothing in between that says us." figure="white-label">
        <Awaiting
          what="Logo, colour, welcome and closing message"
          why="These exist as columns on your organisation and are already read by the survey. The editing surface is the next build step."
        />
      </Band>
    </div>
  );
}

/* ══ Network ══════════════════════════════════════════════════════════ */

function NetworkConsole({ short, name }: { short: string; name: string }) {
  const sb = useMemo(() => getSupabaseBrowser(), []);
  const [wl, setWl] = useState<{ items: WorkItem[] } | null>(null);
  // Mirrors network_console()'s payload exactly. `organisations` carries an
  // index ONLY where that member consented — the SQL nulls it otherwise, so a
  // bug here cannot turn a withheld number into a shown one.
  const [con, setCon] = useState<{
    members: number;
    headline: { organisations: number; responses: number };
    organisations: {
      short_name: string; name: string; country: string | null;
      shares_index: boolean; index: number | null; responses: number;
    }[];
  } | null>(null);
  const [wizard, setWizard] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sb) return;
    const [{ data: w, error: e1 }, { data: c, error: e2 }] = await Promise.all([
      sb.rpc("network_worklist", { p_short_name: short }),
      sb.rpc("network_console", { p_short_name: short }),
    ]);
    if (e1 || e2) setErr((e1 ?? e2)!.message);
    if (w) setWl(w as typeof wl);
    if (c) setCon(c as typeof con);
  }, [sb, short]);

  useEffect(() => {
    load();
  }, [load]);

  const members = con?.organisations ?? [];
  const shown = members.filter((m) => m.shares_index);
  // Members who withheld are summarised as a count, never listed as blank rows
  // — a row with an empty score still tells you who is underperforming.
  const withheld = members.filter((m) => !m.shares_index).length;
  const responses = con?.headline?.responses ?? 0;

  return (
    <div className="space-y-10">
      {err && <Trouble message={err} />}

      <Band letter="A" title="Waiting on you" gloss="A network's worklist is its members: who has not started, who has not consented, who has not been asked." figure={`${wl?.items.length ?? 0} item${wl?.items.length === 1 ? "" : "s"}`}>
        <Worklist items={wl?.items ?? []} empty="Nothing pending. Every member has fielded and consented." />
      </Band>

      <Band letter="B" title="Surveys" gloss="A network fields through an organisation — always. Responses need an owner that can be counted exactly once, and a network is counted as the sum of its members." figure={short}>
        {wizard ? (
          <SurveyWizard
            onDone={() => {
              setWizard(false);
              load();
            }}
            onCancel={() => setWizard(false)}
          />
        ) : (
          <>
            <Action primary onClick={() => setWizard(true)}>
              Field for an organisation →
            </Action>
            <p className="margin-note mt-4 border-l-2 border-emerald pl-3">
              To run <b>{name}</b>&apos;s own survey — its camp, its event, its audience — {name} needs
              to exist as an organisation too, and join its own network. That is not a workaround:
              a ministry running an event genuinely is a different object from a container holding
              churches, and saying so keeps the arithmetic honest. Its responses then roll into
              this network&apos;s picture automatically.
            </p>
          </>
        )}
      </Band>

      <Band letter="C" title="The reading" gloss="Aggregate across all members, always. Per-member only where that member consented — and the rest appear as a count, because a blank row is still a disclosure." figure={`n ${responses}`}>
        {responses === 0 ? (
          <Awaiting
            what="No responses across the network yet"
            why="One index, one funnel and one matrix pooled from every member — consented or not — appear here as soon as a member fields."
          />
        ) : (
          <Rows>
            {shown.map((m) => (
              <Row
                key={m.short_name}
                tone="good"
                label={m.name}
                meta={m.index != null ? `${m.index} · n ${m.responses}` : "shares"}
              />
            ))}
            {withheld > 0 && (
              <Row label={`${withheld} further member${withheld === 1 ? "" : "s"}`} meta="contributing · not shown" />
            )}
          </Rows>
        )}
      </Band>

      <Band letter="D" title="The roll" gloss="The membership, and the two consents that govern it. Being added to a network is not consent to be seen, and it is not consent to be fielded for." figure={`${members.length} member${members.length === 1 ? "" : "s"}`}>
        {members.length === 0 ? (
          <Awaiting what="No members yet" why="Invite an organisation and it appears here with both consents set to off." />
        ) : (
          <Rows>
            {members.map((m) => (
              <Row
                key={m.short_name}
                label={m.name}
                meta={m.shares_index ? "shares its index" : "aggregate only"}
                tone={m.shares_index ? "good" : "plain"}
              />
            ))}
          </Rows>
        )}
      </Band>

      <Band letter="E" title="Member brands" gloss="A member's survey always carries the member's brand, never the network's. White-label means theirs." figure={`jfindx.org/${short}`}>
        <Awaiting what="Network brand and invitations" why="The next build step. The network page and the invite flow read the columns that already exist." />
      </Band>
    </div>
  );
}

/* ══ Collab ═══════════════════════════════════════════════════════════ */

/** Mirrors collab_overview() (migration 0032). Counts and config only. */
type CollabOverview = {
  organisations: { short_name: string; name: string; country: string | null; status: string; fielding: boolean }[];
  surveys: { started: number; completed: number; languages: { locale: string; started: number; completed: number }[] };
  development: HouseSettings;
};

/** "es" → "Spanish". Falls back to the code if the browser can't name it. */
function languageName(locale: string) {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(locale) ?? locale.toUpperCase();
  } catch {
    return locale.toUpperCase();
  }
}

function pct(done: number, of: number) {
  return of ? `${Math.round((done / of) * 100)}%` : "—";
}

type CollabSection = "organisations" | "surveys" | "intelligence" | "development" | "consulting";

function CollabConsole() {
  const sb = useMemo(() => getSupabaseBrowser(), []);
  const [wl, setWl] = useState<{
    gate: number;
    waves: { short_name: string; name: string; item_set: string; adopted: number; opens_on: string | null }[];
    items: WorkItem[];
  } | null>(null);
  const [ov, setOv] = useState<CollabOverview | null>(null);
  const [wizard, setWizard] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [section, setSection] = useState<CollabSection>("organisations");
  const consulting = useConsultingRequests();

  const load = useCallback(async () => {
    if (!sb) return;
    const [{ data: w, error: e1 }, { data: o, error: e2 }] = await Promise.all([
      sb.rpc("collab_worklist"),
      sb.rpc("collab_overview"),
    ]);
    if (e1) setErr(e1.message);
    else if (e2)
      setErr(
        /collab_overview/.test(e2.message)
          ? "The Organisations, Surveys and Development tiles read collab_overview(), which isn't applied to this database yet (migration 0032)."
          : e2.message,
      );
    if (w) setWl(w as typeof wl);
    if (o) setOv(o as CollabOverview);
  }, [sb]);

  useEffect(() => {
    load();
  }, [load]);

  const orgs = ov?.organisations ?? [];
  const started = ov?.surveys.started ?? 0;
  const completed = ov?.surveys.completed ?? 0;
  const langs = ov?.surveys.languages ?? [];
  const house = ov?.development ?? null;
  const gate = wl?.gate ?? house?.gate ?? 400;

  return (
    <div className="space-y-10">
      {err && <Trouble message={err} />}

      {/* Same four-across tile row as the Administrator console. Each tile is
          a preview of its band; clicking swaps which band renders below. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Tile
          letter="A"
          figure={`${orgs.length} total`}
          title="Organisations"
          selected={section === "organisations"}
          onClick={() => setSection("organisations")}
        >
          {orgs.length ? (
            <TileList names={orgs.map((o) => o.name)} selected={section === "organisations"} />
          ) : (
            <p className="text-[12.5px] text-muted">
              None in the live space yet.
            </p>
          )}
        </Tile>

        <Tile
          letter="B"
          figure={`${langs.length} language${langs.length === 1 ? "" : "s"}`}
          title="Surveys sent out"
          selected={section === "surveys"}
          onClick={() => setSection("surveys")}
        >
          <ul className="space-y-0.5 text-[12.5px] leading-snug">
            <li className="flex justify-between gap-2">
              <span className="text-muted">Unique respondents</span>
              <span className="tabular">{started.toLocaleString()}</span>
            </li>
            <li className="flex justify-between gap-2">
              <span className="text-muted">Completion</span>
              <span className="tabular">{pct(completed, started)}</span>
            </li>
            {langs.slice(0, 3).map((l) => (
              <li key={l.locale} className="flex justify-between gap-2">
                <span className="text-muted">{languageName(l.locale)}</span>
                <span className="tabular">{l.started.toLocaleString()}</span>
              </li>
            ))}
            {langs.length > 3 && (
              <li className="text-muted">+{langs.length - 3} more</li>
            )}
          </ul>
        </Tile>

        <Tile
          letter="C"
          figure="reading · roll"
          title="Collab Intelligence"
          gloss="The pooled picture, and the coverage arithmetic that decides which benchmarks unlock."
          selected={section === "intelligence"}
          onClick={() => setSection("intelligence")}
        />

        <Tile
          letter="D"
          figure="the platform"
          title="Development"
          selected={section === "development"}
          onClick={() => setSection("development")}
        >
          <HouseFigures house={house} selected={section === "development"} />
        </Tile>

        <Tile
          letter="E"
          figure={consulting.items ? `${consulting.counts.new} new` : "…"}
          title="Consulting Requests"
          selected={section === "consulting"}
          onClick={() => setSection("consulting")}
        >
          <ul className="space-y-0.5 text-[12.5px] leading-snug">
            {(
              [
                ["New", consulting.counts.new],
                ["With a facilitator", consulting.counts.assigned],
                ["Answered", consulting.counts.answered],
              ] as const
            ).map(([k, v]) => (
              <li key={k} className="flex justify-between gap-2">
                <span className="text-muted">{k}</span>
                <span className="tabular">{consulting.items ? v : "—"}</span>
              </li>
            ))}
          </ul>
        </Tile>
      </div>

      {section === "organisations" && (
        <Band
          letter="A"
          title="Organisations"
          gloss="Every organisation taking part in the live space. A roster, not a reading — no scores and no per-organisation figures here."
          figure={`${orgs.length} total`}
        >
          {orgs.length ? (
            <Rows>
              {orgs.map((o) => (
                <Row
                  key={o.short_name}
                  tone={o.fielding ? "good" : "plain"}
                  label={o.name}
                  meta={[o.country, o.fielding ? "fielding" : "not fielding", o.status !== "active" ? o.status : null]
                    .filter(Boolean)
                    .join(" · ")}
                />
              ))}
            </Rows>
          ) : (
            <p className="text-[15px] leading-relaxed text-ink-2">
              None yet. The live space stays empty on purpose until a real organisation arrives.
            </p>
          )}
        </Band>
      )}

      {section === "surveys" && (
        <Band
          letter="B"
          title="Surveys sent out"
          gloss="Convening is the Collab's verb. A unique respondent is one anonymous pass through the survey — a session, never a person we could identify."
          figure={`n ${started.toLocaleString()}`}
        >
          {started ? (
            <table className="w-full rounded-xl border border-rule bg-plate text-left shadow-sm">
              <thead>
                <tr className="figcap">
                  <th className="border-b border-rule px-4 pb-2 pt-4 font-normal">Language</th>
                  <th className="border-b border-rule pb-2 pt-4 text-right font-normal">Started</th>
                  <th className="border-b border-rule pb-2 pt-4 text-right font-normal">Completed</th>
                  <th className="border-b border-rule px-4 pb-2 pt-4 text-right font-normal">Completion</th>
                </tr>
              </thead>
              <tbody>
                {langs.map((l) => (
                  <tr key={l.locale} className="border-b border-rule">
                    <th scope="row" className="px-4 py-2.5 text-left text-[15px] font-normal">
                      {languageName(l.locale)}
                      <span className="tabular ml-2 text-[12px] text-muted">{l.locale}</span>
                    </th>
                    <td className="tabular py-2.5 text-right text-[15px]">{l.started.toLocaleString()}</td>
                    <td className="tabular py-2.5 text-right text-[15px]">{l.completed.toLocaleString()}</td>
                    <td className="tabular px-4 py-2.5 text-right text-[15px]">{pct(l.completed, l.started)}</td>
                  </tr>
                ))}
                <tr>
                  <th scope="row" className="px-4 py-2.5 text-left text-[15px] font-semibold">All languages</th>
                  <td className="tabular py-2.5 text-right text-[15px] font-semibold">{started.toLocaleString()}</td>
                  <td className="tabular py-2.5 text-right text-[15px] font-semibold">{completed.toLocaleString()}</td>
                  <td className="tabular px-4 py-2.5 text-right text-[15px] font-semibold">{pct(completed, started)}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <Awaiting
              what="No respondents yet"
              why="Language totals and completion appear here as soon as the first respondent in the live space opens a survey."
            />
          )}

          <div className="mt-6">
            {wizard ? (
              <SurveyWizard
                onDone={() => {
                  setWizard(false);
                  load();
                }}
                onCancel={() => setWizard(false)}
              />
            ) : (
              <Action primary onClick={() => setWizard(true)}>
                Field for an organisation →
              </Action>
            )}
          </div>

          <p className="figcap mt-6">Waves</p>
          {wl?.waves.length ? (
            <Rows>
              {wl.waves.map((w) => (
                <Row key={w.short_name} label={w.name} meta={`${w.item_set} · ${w.adopted} adopted`} />
              ))}
            </Rows>
          ) : (
            <div className="mt-2">
              <Awaiting
                what="No wave convened yet"
                why="A wave collects nothing itself — it is a shape campaigns are cut to, which is what makes forty organisations comparable rather than merely simultaneous."
              />
            </div>
          )}
        </Band>
      )}

      {section === "intelligence" && (
        <div className="space-y-10">
          <Band letter="C" title="The reading" gloss="The pooled picture — live space only, never the sandbox. Every figure carries its sample size, and no geography is named until it passes the gate." figure="live space">
            <Link
              href="/intelligence"
              className="inline-block rounded-lg bg-gradient-to-r from-violet via-violet-deep to-violet-deeper px-4 py-2.5 text-[14px] font-semibold text-plate no-underline hover:opacity-90"
            >
              Open Collab Intelligence →
            </Link>
          </Band>

          <Band letter="C" title="The roll" gloss="Cohorts, countries and the coverage arithmetic. Concentration beats count: sixty organisations across forty countries unlocks nothing; the same sixty across ten unlocks all ten." figure={`gate ${gate.toLocaleString()}`}>
            <Worklist items={wl?.items ?? []} empty="No completions yet, so no coverage to steer." />
          </Band>
        </div>
      )}

      {section === "consulting" && (
        <Band
          letter="E"
          title="Consulting Requests"
          gloss="Every “What does this mean?” from an organisation’s dashboard. Each carries the question and the aggregate view the organisation was looking at — never a respondent’s answers."
          figure="from either dashboard tab"
        >
          <ConsultingRequestsBand {...consulting} />
        </Band>
      )}

      {section === "development" && (
        <Band letter="D" title="The instrument" gloss="The instrument is researcher-owned. This tier reads every version and proposes changes; it cannot edit a published one, because responses are bound to the version they were captured under." figure="read + propose">
          <Link href="/build/instrument" className="mb-4 inline-block rounded-lg border border-rule-2 px-4 py-2.5 text-[14px] font-semibold text-ink no-underline hover:border-ink">
            The instrument — items, checks, proposals →
          </Link>
          <HouseRows house={house} />
          <p className="margin-note mt-3 border-l-2 border-rule pl-3">
            Read-only here. Changing a gate or the publish switch stays with the administrator;
            changing the instrument stays with the researchers.
          </p>
        </Band>
      )}
    </div>
  );
}

/* ══ Administrator ════════════════════════════════════════════════════ */

type Worklist = {
  access_requests: { id: string; email: string; reason: string | null; created_at: string }[];
  people: { email: string; role: string }[];
  organisations: {
    short_name: string; name: string; country: string | null;
    verified: boolean; has_brand: boolean; campaigns: number; responses: number;
    status: "pending" | "active" | "paused" | "closed";
  }[];
  clusters: { country: string; completions: number; orgs: number }[];
  instrument: { version: string; status: string; items: number } | null;
  spaces: {
    live: { orgs: number; sessions: number; responses: number };
    demo: { orgs: number; sessions: number; responses: number };
    gate: number;
    country_gate: number;
    global_view_published: boolean;
  };
};

/**
 * The Console tab's controls (migration 0060): the two critical-mass gates and
 * the global-view publish switch, with the live sample size beside the switch.
 * Every check — admin only, allow-listed keys, whole-number gates, no
 * publishing below the gate — happens in admin_set_platform_setting(); this
 * component only asks. Until 0060 is applied it shows the current values
 * read-only and says why.
 */
type Controls = {
  gate: number;
  country_gate: number;
  global_view_published: boolean;
  live_completed: number;
  log: { key: string; old_value: unknown; new_value: unknown; created_at: string; email: string | null }[];
};

const SETTING_LABEL: Record<string, string> = {
  critical_mass_gate: "Org / region gate",
  country_critical_mass_gate: "Country gate",
  publish_global_view: "Global view",
};

function PlatformControls({ wl, onChanged }: { wl: Worklist | null; onChanged: () => void }) {
  const sb = useMemo(() => getSupabaseBrowser(), []);
  const [c, setC] = useState<Controls | null>(null);
  const [missing, setMissing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [gate, setGate] = useState("");
  const [countryGate, setCountryGate] = useState("");
  const [confirmPublish, setConfirmPublish] = useState(false);

  const apply = (d: Controls) => {
    setC(d);
    setGate(String(d.gate));
    setCountryGate(String(d.country_gate));
  };

  const load = useCallback(async () => {
    if (!sb) return;
    const { data, error } = await sb.rpc("admin_platform_controls");
    if (error) {
      if (/admin_platform_controls|function .* does not exist|schema cache/i.test(error.message)) setMissing(true);
      else setErr(error.message);
      return;
    }
    apply(data as Controls);
  }, [sb]);

  useEffect(() => {
    load();
  }, [load]);

  async function set(key: string, value: number | boolean) {
    if (!sb) return;
    setBusy(key);
    setErr(null);
    const { data, error } = await sb.rpc("admin_set_platform_setting", { p_key: key, p_value: value });
    setBusy(null);
    setConfirmPublish(false);
    if (error) setErr(error.message);
    else {
      apply(data as Controls);
      onChanged();
    }
  }

  // Before 0060: the worklist still carries the values, read-only.
  const view = c ?? (wl ? { gate: wl.spaces.gate, country_gate: wl.spaces.country_gate, global_view_published: wl.spaces.global_view_published, live_completed: null as number | null, log: [] } : null);
  if (!view) return <p className="text-[14px] text-muted">Loading…</p>;
  const editable = !!c && !missing;
  const live = c?.live_completed ?? null;
  const belowGate = live != null && live < view.gate;

  const input = "tabular w-28 rounded-lg border border-rule-2 bg-plate px-3 py-2 text-[14px] text-ink focus:border-ink disabled:bg-paper-deep disabled:text-muted";
  const save = "rounded-lg bg-gradient-to-r from-violet via-violet-deep to-violet-deeper px-3.5 py-2 text-[13px] font-semibold text-plate hover:opacity-90 disabled:opacity-40";

  const gateRow = ({ k, label, hint, value, setValue, current }: { k: string; label: string; hint: string; value: string; setValue: (v: string) => void; current: number }) => {
    const n = Number(value);
    const valid = Number.isInteger(n) && n >= 1;
    return (
      <li key={k} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3.5">
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold text-ink">{label}</span>
          <span className="block text-[12.5px] text-ink-2">{hint}</span>
        </span>
        <span className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            aria-label={label}
            value={value}
            disabled={!editable}
            onChange={(e) => setValue(e.target.value)}
            className={input}
          />
          <button type="button" className={save} disabled={!editable || !valid || n === current || busy === k} onClick={() => set(k, n)}>
            {busy === k ? "Saving…" : "Save"}
          </button>
        </span>
      </li>
    );
  };

  return (
    <div className="space-y-4">
      {missing && (
        <p className="rounded-xl border border-rule bg-paper-deep px-4 py-3 text-[13.5px] leading-relaxed text-ink-2">
          These controls need migration 0060 applied to this database. Until then the values below are read-only.
        </p>
      )}
      {err && <Trouble message={err} />}

      <div className="grid gap-4 md:grid-cols-[1.25fr_1fr]">
        {/* the publish switch, alone, with its sample size */}
        <div className="rounded-2xl border border-rule bg-plate p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[15px] font-semibold text-ink">Publish the global view</p>
              <p className="mt-0.5 text-[12.5px] leading-snug text-ink-2">
                The one switch that can overclaim. While off, /intelligence shows its honest empty state.
              </p>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${
                view.global_view_published ? "bg-emerald/15 text-emerald-deeper" : "bg-paper-deep text-ink-2"
              }`}
            >
              {view.global_view_published ? "Published" : "Not published"}
            </span>
          </div>
          <p className="tabular mt-4 text-[30px] font-bold leading-none tracking-tight text-ink">
            {live == null ? "—" : live.toLocaleString()}
            <span className="ml-2 text-[14px] font-normal text-muted">/ {view.gate.toLocaleString()} gate</span>
          </p>
          <p className="mt-1 text-[12.5px] text-muted">completed responses in the live space · sandbox never counts</p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {view.global_view_published ? (
              <button
                type="button"
                disabled={!editable || busy === "publish_global_view"}
                onClick={() => set("publish_global_view", false)}
                className="rounded-lg border border-ink px-4 py-2 text-[13.5px] font-semibold text-ink hover:bg-ink hover:text-paper disabled:opacity-40"
              >
                Unpublish
              </button>
            ) : confirmPublish ? (
              <>
                <button
                  type="button"
                  disabled={busy === "publish_global_view"}
                  onClick={() => set("publish_global_view", true)}
                  className="rounded-lg bg-gradient-to-r from-emerald via-emerald-deep to-emerald-deeper px-4 py-2 text-[13.5px] font-semibold text-plate hover:opacity-90 disabled:opacity-40"
                >
                  {busy === "publish_global_view" ? "Publishing…" : "Yes, publish it"}
                </button>
                <button type="button" onClick={() => setConfirmPublish(false)} className="rounded-lg border border-rule-2 px-4 py-2 text-[13.5px] font-semibold text-ink hover:border-ink">
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={!editable || belowGate}
                onClick={() => setConfirmPublish(true)}
                className="rounded-lg bg-gradient-to-r from-emerald via-emerald-deep to-emerald-deeper px-4 py-2 text-[13.5px] font-semibold text-plate hover:opacity-90 disabled:opacity-40"
              >
                Publish…
              </button>
            )}
            {belowGate && !view.global_view_published && (
              <span className="text-[12.5px] text-ink-2">
                {(view.gate - (live ?? 0)).toLocaleString()} more completions before this can be published.
              </span>
            )}
          </div>
        </div>

        {/* instrument + the two spaces */}
        <div className="rounded-2xl border border-rule bg-plate p-5 shadow-sm">
          <p className="text-[15px] font-semibold text-ink">Instrument</p>
          <p className="mt-0.5 text-[13px] text-ink-2">
            {wl?.instrument ? `${wl.instrument.version} · ${wl.instrument.items} items · ${wl.instrument.status}` : "Not loaded — run npm run db:seed"}
          </p>
          <Link href="/build/instrument" className="mt-2 inline-block text-[13px] font-semibold text-violet-deeper no-underline hover:underline">
            Open the instrument →
          </Link>
          {wl && (
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-rule pt-4">
              {(["live", "demo"] as const).map((k) => (
                <div key={k}>
                  <dt className="figcap">{k === "live" ? "Live · published" : "Sandbox · never published"}</dt>
                  <dd className="tabular mt-1 text-[13px] leading-snug text-ink">
                    {wl.spaces[k].orgs.toLocaleString()} orgs
                    <br />
                    {wl.spaces[k].sessions.toLocaleString()} sessions
                    <br />
                    {wl.spaces[k].responses.toLocaleString()} answers
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>

      <ul className="divide-y divide-rule rounded-xl border border-rule bg-plate px-4 shadow-sm sm:px-5">
        {gateRow({
          k: "critical_mass_gate",
          label: "Critical-mass gate · organisation, region, city",
          hint: "Completions before any of these can be named with a score.",
          value: gate,
          setValue: setGate,
          current: view.gate,
        })}
        {gateRow({
          k: "country_critical_mass_gate",
          label: "Critical-mass gate · country",
          hint: "Completions before a country can be named. Checked separately from the gate above.",
          value: countryGate,
          setValue: setCountryGate,
          current: view.country_gate,
        })}
      </ul>

      {c && c.log.length > 0 && (
        <div>
          <p className="figcap mb-2">Recent changes</p>
          <ul className="space-y-1 text-[12.5px] text-ink-2">
            {c.log.map((l, i) => (
              <li key={i} className="tabular">
                {new Date(l.created_at).toLocaleDateString()} · {SETTING_LABEL[l.key] ?? l.key}: {String(l.old_value ?? "—")} → {String(l.new_value)}
                {l.email ? ` · ${l.email}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Open / paused / closed, one click to change. The two non-active states are
 * deliberately the same mechanism with different intent (see the migration
 * comment) — this control does not distinguish them beyond the label, and
 * closed is not styled as more severe than paused. Both stop new responses;
 * neither touches a single row already collected.
 */
function StatusToggle({
  current,
  onChange,
}: {
  current: "pending" | "active" | "paused" | "closed";
  onChange: (status: "active" | "paused" | "closed") => void;
}) {
  const OPTIONS: { value: "active" | "paused" | "closed"; label: string }[] = [
    { value: "active", label: "Open" },
    { value: "paused", label: "Pause" },
    { value: "closed", label: "Shut down" },
  ];
  return (
    <span className="flex gap-1">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          onClick={() => o.value !== current && onChange(o.value)}
          title={o.value === current ? `Currently ${o.label.toLowerCase()}` : `Set to ${o.label.toLowerCase()}`}
          className={`rounded-md border px-2.5 py-1 text-[12px] font-semibold ${
            o.value === current
              ? o.value === "active"
                ? "border-emerald bg-emerald text-plate"
                : "border-vermillion bg-vermillion text-plate"
              : "border-rule-2 text-ink-2 hover:border-ink hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}

function AdminConsole() {
  const sb = useMemo(() => getSupabaseBrowser(), []);
  const [wl, setWl] = useState<Worklist | null>(null);
  const [nets, setNets] = useState<{ short_name: string; name: string; kind: string }[]>([]);
  const [wizard, setWizard] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
  const [section, setSection] = useState<"applications" | "surveys" | "console" | "comms">("surveys");
  const applications = useApplications();
  const commsCount = useCommsCount(sb);

  const load = useCallback(async () => {
    if (!sb) return;
    const { data, error } = await sb.rpc("admin_worklist");
    if (error) setErr(error.message);
    else setWl(data as Worklist);
    const { data: n } = await sb.from("networks").select("short_name,name,kind").order("name");
    setNets((n as typeof nets) ?? []);
  }, [sb]);

  useEffect(() => {
    load();
  }, [load]);


  async function setStatus(short_name: string, status: "active" | "paused" | "closed") {
    if (!sb) return;
    const { error } = await sb.rpc("set_org_status", { p_short_name: short_name, p_status: status });
    if (error) setErr(error.message);
    else load();
  }

  const pending: WorkItem[] = [
    ...(wl?.access_requests ?? []).map((a) => ({ urgency: "high", label: a.email, meta: a.reason ?? undefined })),
    ...(!wl?.instrument ? [{ urgency: "high", label: "No instrument version loaded — the survey rejects every question key", meta: "run npm run db:seed" }] : []),
    ...(wl?.organisations ?? [])
      .filter((o) => o.campaigns > 0 && o.responses === 0)
      .map((o) => ({ urgency: "high", label: `${o.name} has a live survey and no responses`, meta: "nudge" })),
    ...(wl?.organisations ?? [])
      .filter((o) => !o.has_brand)
      .map((o) => ({ label: `${o.name} has no logo set`, meta: "cosmetic" })),
  ];

  const liveCount = (wl?.organisations ?? []).filter((o) => o.campaigns > 0).length;
  // Everything on the worklist that is not an access request — those carry
  // their own Approve / Decline row above.
  const otherPending = pending.filter((p) => !wl?.access_requests.some((a) => a.email === p.label));
  const house: HouseSettings | null = wl
    ? {
        instrument: wl.instrument,
        gate: wl.spaces.gate,
        country_gate: wl.spaces.country_gate,
        global_view_published: wl.spaces.global_view_published,
      }
    : null;

  return (
    <div className="space-y-10">
      {err && <Trouble message={err} />}

      {/* Five tiles, one entry point each (E · Communication, 0056). Tile A is the worklist itself —
          "Waiting on you" merged into it, so the queue is visible without a
          click — and it is a plain container rather than a switch, because
          its Approve / Decline buttons cannot live inside a <button>. B and D
          swap which band renders below; C links to the public view. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Tile
          letter="A"
          figure={applications.count == null ? "…" : `${applications.count} waiting`}
          title="Applications & requests"
          gloss={applications.count === 0 && otherPending.length === 0 ? "Nothing pending. Nobody is blocked on you." : undefined}
          selected={section === "applications"}
          onClick={() => setSection("applications")}
        >
          <ul className="space-y-1 text-[12.5px] leading-snug">
            <li className="flex justify-between gap-2"><span className="text-muted">Join applications</span><span className="tabular">{applications.apps?.join.length ?? "—"}</span></li>
            <li className="flex justify-between gap-2"><span className="text-muted">Access requests</span><span className="tabular">{applications.apps?.access.length ?? "—"}</span></li>
            <li className="flex justify-between gap-2"><span className="text-muted">Awaiting activation</span><span className="tabular">{applications.apps?.pending_orgs.length ?? "—"}</span></li>
            {otherPending.slice(0, 2).map((p, i) => (
              <li key={`${p.label}-${i}`} className="text-ink-2">
                {p.urgency === "high" && <span className="mr-1 text-vermillion">▲</span>}
                {p.label}
              </li>
            ))}
          </ul>
        </Tile>

        <Tile
          letter="B"
          figure={`${liveCount} live`}
          title="Surveys out"
          gloss="Every organisation with a live campaign right now, and how it's going."
          selected={section === "surveys"}
          onClick={() => setSection("surveys")}
        />

        <Tile
          letter="C"
          figure="public view"
          title="Collab Intelligence"
          gloss="The aggregate, coalition-wide picture — opens the public view."
          href="/intelligence"
        />

        <Tile
          letter="D"
          figure="controls & roll"
          title="Console"
          selected={section === "console"}
          onClick={() => setSection("console")}
        >
          <HouseFigures house={house} selected={section === "console"} />
        </Tile>

        <Tile
          letter="E"
          figure={commsCount == null ? "…" : `${commsCount} org admin${commsCount === 1 ? "" : "s"}`}
          title="Communication"
          gloss="Email every Org Administrator, or nudge one to their next step."
          selected={section === "comms"}
          onClick={() => setSection("comms")}
        />
      </div>

      {section === "comms" && (
        <Band
          letter="E"
          title="Communication"
          gloss="Updates to every Org Administrator, and the six-step onboarding sequence — each email filled in with that person's name, organisation and links."
          figure="org administrators"
        >
          <CommsBoard sb={sb} />
        </Band>
      )}

      {section === "applications" && <ApplicationsBand {...applications} onChanged={load} />}

      {section === "surveys" && (
      <Band
        letter="B"
        title="Surveys out"
        gloss="Every organisation with at least one live campaign — open it, pause it, or shut it down from here."
        figure={`${liveCount} of ${wl?.organisations.length ?? 0} orgs`}
      >
        {liveCount ? (
          <Rows>
            {(wl?.organisations ?? [])
              .filter((o) => o.campaigns > 0)
              .map((o) => (
                <Row
                  key={o.short_name}
                  label={o.name}
                  meta={`${o.responses.toLocaleString()} responses${o.country ? ` · ${o.country}` : ""}`}
                >
                  <span className="flex items-center gap-2">
                    <StatusToggle current={o.status} onChange={(s) => setStatus(o.short_name, s)} />
                    <Link
                      href={`/${o.short_name}/dashboard`}
                      className="rounded-md border border-rule-2 px-2.5 py-1 text-[12.5px] font-semibold text-ink-2 no-underline hover:border-ink hover:text-ink"
                    >
                      Open
                    </Link>
                  </span>
                </Row>
              ))}
          </Rows>
        ) : (
          <p className="text-[15px] leading-relaxed text-ink-2">
            No organisation has a live campaign yet.
          </p>
        )}
      </Band>
      )}

      {section === "console" && (
        <div className="space-y-12">
          <Band
            title="Platform controls"
            gloss="The settings that change what every number on the platform may say. Each change is checked and logged in the database."
            figure={wl?.instrument ? `instrument ${wl.instrument.version}` : "instrument not loaded"}
          >
            <PlatformControls wl={wl} onChanged={load} />
          </Band>

          <Band
            title="Instrument versions"
            gloss="Every version from v1 to the live one, a tab each: what changed from the version before, and the decisions recorded with each lock. Older versions are shown only here, never to respondents."
            figure={`live ${instrument.version}${wl?.instrument && wl.instrument.version !== instrument.version ? ` · database ${wl.instrument.version}` : ""}`}
          >
            <VersionHistory activeInDatabase={wl?.instrument?.version ?? null} />
          </Band>

          <Band title="Pilot readiness" gloss="Run this before any organisation hands out a real link." figure="pre-flight">
            <PilotReadiness sb={sb} />
          </Band>

          <Band
            title="Organisations, networks & people"
            gloss="Open, pause or shut any organisation's survey, manage its links and team, or field a survey on its behalf (logged with your name)."
            figure={`${wl?.organisations.length ?? 0} org · ${nets.length} network · ${wl?.people.length ?? 0} people`}
          >
            <div className="mb-5">
              {wizard ? (
                <SurveyWizard
                  onDone={() => {
                    setWizard(false);
                    load();
                  }}
                  onCancel={() => setWizard(false)}
                />
              ) : (
                <Action primary onClick={() => setWizard(true)}>
                  Field a survey for an organisation →
                </Action>
              )}
            </div>
            <div className="grid gap-6 md:grid-cols-[1.6fr_1fr]">
              <div>
                <p className="figcap mb-2">Organisations</p>
                {wl?.organisations.length ? (
                  <Rows>
                    {wl.organisations.map((o) => (
                      <Row key={o.short_name} label={o.name} meta={`${o.responses.toLocaleString()} responses`}>
                        <span className="flex items-center gap-2">
                          <StatusToggle current={o.status} onChange={(st) => setStatus(o.short_name, st)} />
                          <button
                            onClick={() => setSelectedOrg(selectedOrg === o.short_name ? null : o.short_name)}
                            aria-pressed={selectedOrg === o.short_name}
                            className={`rounded-md border px-2.5 py-1 text-[12.5px] font-semibold ${
                              selectedOrg === o.short_name
                                ? "border-violet-deeper bg-violet-deeper text-plate"
                                : "border-rule-2 text-ink-2 hover:border-ink hover:text-ink"
                            }`}
                          >
                            Manage
                          </button>
                          <Link
                            href={`/${o.short_name}/dashboard`}
                            className="rounded-md border border-rule-2 px-2.5 py-1 text-[12.5px] font-semibold text-ink-2 no-underline hover:border-ink hover:text-ink"
                          >
                            Open
                          </Link>
                        </span>
                      </Row>
                    ))}
                  </Rows>
                ) : (
                  <p className="text-[15px] leading-relaxed text-ink-2">None yet.</p>
                )}
              </div>
              <div className="space-y-5">
                <div>
                  <p className="figcap mb-2">Networks</p>
                  {nets.length ? (
                    <Rows>
                      {nets.map((n) => (
                        <Row key={n.short_name} label={n.name} meta={n.kind} />
                      ))}
                    </Rows>
                  ) : (
                    <p className="text-[15px] text-ink-2">None yet.</p>
                  )}
                </div>
                <div>
                  <p className="figcap mb-2">People</p>
                  <Rows>
                    {(wl?.people ?? []).map((p) => (
                      <Row key={p.email} label={p.email} meta={p.role} />
                    ))}
                  </Rows>
                </div>
              </div>
            </div>
            {selectedOrg && (
              <>
                <OrgDetailPanel shortName={selectedOrg} />
                <OrgManagePanel shortName={selectedOrg} onChanged={load} />
              </>
            )}
          </Band>

          <Band
            title="Consent register"
            gloss="Which organisations have confirmed consent, for the organisation and for each survey — for what, by whom and when."
            figure="two levels"
          >
            <ConsentRegister sb={sb} />
          </Band>

          <Band title="Survey completion" gloss="Who started, who finished and where people stop, per organisation. Counts only." figure="completion">
            <CollabCompletion sb={sb} />
          </Band>
        </div>
      )}
    </div>
  );
}

/**
 * The links-and-access detail for one organisation — opened from a "Links &
 * access" button on its row in Band D, rather than a separate page, so
 * staff can flip between organisations without losing their place in the
 * roll. Three RPCs, each already scoped and authorised on its own:
 * admin_org_detail() (new, migration 0029) for countries/responses/members,
 * org_links() (migration 0011, public; one link since 0044) for the survey
 * URL, org_distribution_links() (migration 0028, widened in 0029) for any
 * named rooms. No password field — there are none on this platform; "Resend
 * link" below calls Supabase Auth's own one-time email sign-in directly.
 */
type OrgDetail = {
  org: { slug: string; short_name: string | null; name: string; website_domain: string | null; verified: boolean; status: string };
  responses: number;
  countries: string[];
  countries_count: number;
  members: { name: string; email: string; role: string; status: string }[];
};
/** org_links() — one survey link per organisation since migration 0044. */
type FixedLinks = { community: { url: string; label: string; note: string } };
type RoomLink = { id: string; name: string; slug: string; status: "scheduled" | "active" | "ended"; n: number; places: string[]; places_total: number };

function OrgDetailPanel({ shortName }: { shortName: string }) {
  const sb = useMemo(() => getSupabaseBrowser(), []);
  const [detail, setDetail] = useState<OrgDetail | null>(null);
  const [fixed, setFixed] = useState<FixedLinks | null>(null);
  const [rooms, setRooms] = useState<RoomLink[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    if (!sb) return;
    let cancelled = false;
    setDetail(null);
    setFixed(null);
    setRooms([]);
    setErr(null);
    (async () => {
      const [d, f, r] = await Promise.all([
        sb.rpc("admin_org_detail", { p_org_slug: shortName }),
        sb.rpc("org_links", { p_short_name: shortName }),
        sb.rpc("org_distribution_links", { p_org_slug: shortName }),
      ]);
      if (cancelled) return;
      if (d.error) setErr(d.error.message);
      else setDetail(d.data as OrgDetail);
      if (f.data) setFixed(f.data as FixedLinks);
      if (r.data) setRooms(r.data as RoomLink[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [sb, shortName]);

  async function resendLink(email: string) {
    if (!sb) return;
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: typeof window !== "undefined" ? `${window.location.origin}/${shortName}/dashboard` : undefined },
    });
    setSent(error ? null : email);
    if (error) setErr(error.message);
  }

  const linkCount = (fixed ? 1 : 0) + rooms.length;
  const activeLinkCount = (fixed ? 1 : 0) + rooms.filter((r) => r.status === "active").length;

  return (
    <div className="mt-5 rounded-2xl border border-rule bg-plate p-5 shadow-sm sm:p-6">
      {err && <Trouble message={err} />}
      {!detail && !err && <p className="text-[14px] text-ink-2">Loading…</p>}

      {detail && (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule pb-4">
            <div>
              <p className="text-[18px] font-bold text-ink">
                {detail.org.name}
                {detail.org.verified && (
                  <span className="ml-2 rounded-full bg-emerald/10 px-2.5 py-0.5 align-middle text-[11px] font-semibold text-emerald-deep">
                    Verified
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-[13px] text-muted">{detail.org.website_domain ?? "no domain on file"}</p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-rule bg-paper-deep px-4 py-3.5">
              <p className="figcap">Links activated</p>
              <p className="tabular mt-1.5 text-[26px] font-bold text-ink">{linkCount}</p>
              <p className="mt-0.5 text-[12px] text-muted">{activeLinkCount} active right now</p>
            </div>
            <div className="rounded-xl border border-rule bg-paper-deep px-4 py-3.5">
              <p className="figcap">Countries reached</p>
              <p className="tabular mt-1.5 text-[26px] font-bold text-ink">{detail.countries_count}</p>
              <p className="mt-0.5 truncate text-[12px] text-muted" title={detail.countries.join(", ")}>
                {detail.countries.length ? detail.countries.join(", ") : "no responses yet"}
              </p>
            </div>
            <div className="rounded-xl border border-rule bg-paper-deep px-4 py-3.5">
              <p className="figcap">Total responses</p>
              <p className="tabular mt-1.5 text-[26px] font-bold text-emerald">{detail.responses.toLocaleString()}</p>
              <p className="mt-0.5 text-[12px] text-muted">of those who completed the Index</p>
            </div>
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div>
              <p className="figcap mb-2">Admin access</p>
              {detail.members.length ? (
                <Rows>
                  {detail.members.map((m) => (
                    <Row key={m.email} label={m.name} meta={`${TEAM_ROLE_LABEL[normaliseRole(m.role) ?? "coordinator"]} · ${m.status}`}>
                      <button
                        onClick={() => resendLink(m.email)}
                        className="rounded-lg border border-rule-2 px-3 py-1.5 text-[13px] font-semibold text-ink-2 hover:border-ink hover:text-ink"
                      >
                        {sent === m.email ? "Link sent" : "Resend link"}
                      </button>
                    </Row>
                  ))}
                </Rows>
              ) : (
                <p className="rounded-xl border border-rule bg-paper-deep p-4 text-[14px] leading-relaxed text-ink-2">
                  Nobody has signed in yet. Anyone with a{" "}
                  <span className="tabular">@{detail.org.website_domain ?? "…"}</span> email can claim
                  access from their own dashboard sign-in screen — there is no invite to send from here.
                </p>
              )}
              <p className="margin-note mt-3 border-l-2 border-rule pl-3">
                No passwords exist on the Jesus Index. &quot;Resend link&quot; sends a fresh one-time sign-in
                email via Supabase Auth — the same link a person would request themselves.
              </p>
            </div>

            <div>
              <p className="figcap mb-2">Survey links</p>
              {fixed || rooms.length ? (
                <Rows>
                  {fixed && (
                    <>
                      <LinkRow url={fixed.community.url} label={fixed.community.label} note={fixed.community.note} />
                    </>
                  )}
                  {rooms.map((r) => (
                    <LinkRow
                      key={r.id}
                      url={`https://jfindx.org/${shortName}/l/${r.slug}`}
                      label={`${r.name} · ${r.status}`}
                      note={`n = ${r.n.toLocaleString()} · ${r.places.length ? r.places.join(" · ") : "no responses yet"}${
                        r.places_total > r.places.length ? ` +${r.places_total - r.places.length} more` : ""
                      }`}
                    />
                  ))}
                </Rows>
              ) : (
                <p className="rounded-xl border border-rule bg-paper-deep p-4 text-[14px] text-ink-2">No links yet.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ══ shell ════════════════════════════════════════════════════════════ */

function Shell({
  tier,
  scope,
  ctx,
  onScope,
  children,
}: {
  tier: string;
  scope: Scope | null;
  ctx: Ctx | null;
  onScope: (s: Scope) => void;
  children: React.ReactNode;
}) {
  // An administrator sees every house; everyone else sees only their own. The
  // switcher is the view-as control, and it is built from what the DATABASE
  // said this person belongs to, never from a client-side guess.
  const houses: Scope[] = [
    ...(ctx?.role === "admin" ? [{ kind: "admin" as const }] : []),
    ...(ctx?.role === "admin" || ctx?.role === "collab" ? [{ kind: "collab" as const }] : []),
    ...(ctx?.networks ?? []).map((n) => ({ kind: "network" as const, short_name: n.short_name, name: n.name })),
    ...(ctx?.orgs ?? []).map((o) => ({ kind: "org" as const, short_name: o.short_name, name: o.name })),
  ];

  const key = (s: Scope) => (s.kind === "admin" || s.kind === "collab" ? s.kind : `${s.kind}:${s.short_name}`);

  return (
    <>
      <Masthead edition={`Console${tier ? ` · ${tier}` : ""} · signed in · not public`} />
      <main className="mx-auto max-w-5xl px-5 py-10">
        <div>
          <p className="figcap">Console</p>
          <h1 className="mt-2 text-[38px] font-bold leading-[1.02] tracking-tight text-ink sm:text-[44px]">
            {tier || "The Index"}
          </h1>
          <p className="mt-3 max-w-measure text-[16px] leading-relaxed text-ink-2">
            What is on this page is what is waiting on a person.
          </p>

          {houses.length > 1 && (
            <div role="tablist" aria-label="View the console as" className="mt-5 inline-flex flex-wrap gap-1 rounded-xl border border-rule bg-paper-deep p-1">
              {houses.map((h) => {
                const on = !!scope && key(scope) === key(h);
                return (
                  <button
                    key={key(h)}
                    role="tab"
                    aria-selected={on}
                    onClick={() => onScope(h)}
                    className={`rounded-lg px-3.5 py-2 text-[13.5px] font-semibold transition-colors ${
                      on ? "bg-plate text-ink shadow-sm" : "text-ink-2 hover:text-ink"
                    }`}
                  >
                    {h.kind === "admin" ? "Administrator" : h.kind === "collab" ? "Collab" : h.name}
                  </button>
                );
              })}
            </div>
          )}
          <GradientRule className="mt-6" />
        </div>
        <div className="mt-9">{children}</div>
      </main>
    </>
  );
}
