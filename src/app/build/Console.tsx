"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import { Colophon, Masthead } from "@/components/site/Chrome";
import { Action, Awaiting, Band, LinkRow, Row, Rows, Trouble, Worklist, type WorkItem } from "@/components/console/Bands";
import SurveyWizard from "@/components/console/SurveyWizard";

/**
 * The Index — the authenticated engine, at every tier.
 *
 * One console, four scopes. The five bands are the same components in the same
 * order whether you are Shoreline Church or an administrator; what changes is
 * which RPC fills them. See /build/wireframes for the specification, and
 * `claude/index-console-tiers-and-survey-verbs.md` for why.
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
  orgs?: { short_name: string; name: string; is_demo: boolean }[];
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
      else if (c.orgs?.length)
        setScope({ kind: "org", short_name: c.orgs[0].short_name, name: c.orgs[0].name });
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

  if (!ctx?.signed_in)
    return (
      <Shell tier="" scope={null} ctx={null} onScope={() => {}}>
        <Band letter="—" title="Not signed in" gloss="The Index is the working engine behind jfindx.org. It needs a ministry email and a one-time sign-in link.">
          <Link
            href="/access"
            className="tabular inline-block border-2 border-ink bg-ink px-5 py-3 text-[11px] uppercase tracking-[0.14em] text-paper no-underline"
          >
            Sign in →
          </Link>
        </Band>
      </Shell>
    );

  const tier = scope ? TIER_LABEL[scope.kind] : "";

  return (
    <Shell tier={tier} scope={scope} ctx={ctx} onScope={setScope}>
      {err && <Trouble message={err} />}

      {!scope && (
        <Band
          letter="—"
          title="No house yet"
          gloss="You are signed in, but you are not yet attached to an organisation or a network, and you do not hold a Collab or administrator tier."
        >
          <p className="max-w-measure text-[15.5px] leading-relaxed text-ink-2">
            Access is granted deliberately rather than automatically. Ask Jurie or Ulrich to
            attach you, then reload this page.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/build/wireframes" className="tabular border border-ink px-4 py-2.5 text-[11px] uppercase tracking-[0.14em] text-ink no-underline">
              What the console will do →
            </Link>
            <Link href="/demo" className="tabular border border-rule px-4 py-2.5 text-[11px] uppercase tracking-[0.14em] text-ink-2 no-underline">
              The sandbox →
            </Link>
          </div>
        </Band>
      )}

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

      <Band letter="B" title="Surveys" gloss="Your survey, your brand, your links. About four minutes on a phone." figure={short}>
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
              <ul className="mt-5 border-t border-ink">
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
              className="tabular mt-4 inline-block border border-ink px-4 py-2.5 text-[11px] uppercase tracking-[0.14em] text-ink no-underline hover:bg-ink hover:text-paper"
            >
              Open the full dashboard →
            </Link>
          </>
        )}
      </Band>

      <Band letter="D" title="The roll" gloss="Who else at your organisation can see this. Small, deliberately." figure={name}>
        <Awaiting what="Invitations" why="Adding colleagues arrives with the next build step. For now, ask an administrator to attach someone." />
      </Band>

      <Band letter="E" title="The house" gloss="Everything a respondent sees: your brand at the top, the Index in the footer, nothing in between that says us." figure="white-label">
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

      <Band letter="E" title="The house" gloss="A member's survey always carries the member's brand, never the network's. White-label means theirs." figure={`jfindx.org/${short}`}>
        <Awaiting what="Network brand and invitations" why="The next build step. The network page and the invite flow read the columns that already exist." />
      </Band>
    </div>
  );
}

/* ══ Collab ═══════════════════════════════════════════════════════════ */

function CollabConsole() {
  const sb = useMemo(() => getSupabaseBrowser(), []);
  const [wl, setWl] = useState<{
    gate: number;
    waves: { short_name: string; name: string; item_set: string; adopted: number; opens_on: string | null }[];
    items: WorkItem[];
  } | null>(null);
  const [wizard, setWizard] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sb) return;
    const { data, error } = await sb.rpc("collab_worklist");
    if (error) setErr(error.message);
    else setWl(data as typeof wl);
  }, [sb]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-10">
      {err && <Trouble message={err} />}

      <Band letter="A" title="Waiting on you" gloss="The Collab's worklist is about coverage, not tickets. Every item is a country or a cohort that will or will not reach a benchmark this season." figure={`gate ${wl?.gate ?? 400}`}>
        <Worklist items={wl?.items ?? []} empty="Nothing pending. No country is close enough to its benchmark to chase, and every organisation that joined has fielded." />
      </Band>

      <Band letter="B" title="Surveys" gloss="Convening is the Collab's verb and the reason benchmarks exist. A wave fixes the version, item set, audiences and window — organisations adopt it in one click and are automatically comparable." figure={`${wl?.waves.length ?? 0} wave${wl?.waves.length === 1 ? "" : "s"}`}>
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
            <div className="flex flex-wrap gap-3">
              <Action primary onClick={() => setWizard(true)}>
                Field for an organisation →
              </Action>
            </div>
            {wl?.waves.length ? (
              <Rows>
                {wl.waves.map((w) => (
                  <Row key={w.short_name} label={w.name} meta={`${w.item_set} · ${w.adopted} adopted`} />
                ))}
              </Rows>
            ) : (
              <div className="mt-5">
                <Awaiting
                  what="No wave convened yet"
                  why="A wave collects nothing itself — it is a shape campaigns are cut to, which is what makes forty organisations comparable rather than merely simultaneous. The convening surface is the next build step; wave_upsert() is already applied."
                />
              </div>
            )}
          </>
        )}
      </Band>

      <Band letter="C" title="The reading" gloss="The pooled picture — live space only, never the sandbox. Every figure carries its sample size, and no geography is named until it passes the gate." figure="live space">
        <Link
          href="/intelligence"
          className="tabular inline-block border border-ink px-4 py-2.5 text-[11px] uppercase tracking-[0.14em] text-ink no-underline hover:bg-ink hover:text-paper"
        >
          Open Collab Intelligence →
        </Link>
      </Band>

      <Band letter="D" title="The roll" gloss="Cohorts, countries and the coverage arithmetic. Concentration beats count: sixty organisations across forty countries unlocks nothing; the same sixty across ten unlocks all ten." figure={`gate ${wl?.gate ?? 400}`}>
        <Worklist items={wl?.items ?? []} empty="No completions yet, so no coverage to steer." />
      </Band>

      <Band letter="E" title="The house" gloss="The instrument is researcher-owned. This tier reads every version and proposes changes; it cannot edit a published one, because responses are bound to the version they were captured under." figure="read + propose">
        <Awaiting what="The instrument register" why="Reading, diffing and proposing arrive with the instrument admin surface." />
      </Band>
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
  }[];
  clusters: { country: string; completions: number; orgs: number }[];
  instrument: { version: string; status: string; items: number } | null;
  spaces: {
    live: { orgs: number; sessions: number; responses: number };
    demo: { orgs: number; sessions: number; responses: number };
    gate: number;
    global_view_published: boolean;
  };
};

function AdminConsole() {
  const sb = useMemo(() => getSupabaseBrowser(), []);
  const [wl, setWl] = useState<Worklist | null>(null);
  const [nets, setNets] = useState<{ short_name: string; name: string; kind: string }[]>([]);
  const [wizard, setWizard] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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

  async function decide(id: string, decision: "approved" | "declined") {
    if (!sb) return;
    await sb.rpc("decide_access_request", { p_id: id, p_decision: decision });
    load();
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

  return (
    <div className="space-y-10">
      {err && <Trouble message={err} />}

      <Band letter="A" title="Waiting on you" gloss="A worklist, not a dashboard. If nothing is on it, nobody is blocked on you." figure={`${pending.length} item${pending.length === 1 ? "" : "s"}`}>
        {wl?.access_requests.length ? (
          <ul className="border-t border-ink">
            {wl.access_requests.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule py-3">
                <div className="min-w-0">
                  <p className="text-[15.5px]">
                    <span className="mr-2 text-vermillion">▲</span>
                    {a.email}
                  </p>
                  {a.reason && <p className="margin-note mt-0.5">{a.reason}</p>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => decide(a.id, "approved")} className="tabular border-2 border-emerald bg-emerald px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-plate">
                    Approve
                  </button>
                  <button onClick={() => decide(a.id, "declined")} className="tabular border border-rule px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-ink-2">
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        <div className={wl?.access_requests.length ? "mt-4" : ""}>
          <Worklist items={pending.filter((p) => !wl?.access_requests.some((a) => a.email === p.label))} empty="Nothing pending. Nobody is blocked on you." />
        </div>
        <p className="margin-note mt-3 border-l-2 border-rule pl-3">
          Approving records the decision. It does not grant a tier — that stays a separate,
          deliberate act, so nobody becomes an administrator as a side effect of clearing a queue.
        </p>
      </Band>

      <Band letter="B" title="Surveys" gloss="Both verbs, unrestricted — and every act of fielding on someone else's behalf is written to the action log with your name on it." figure="unrestricted">
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
      </Band>

      <Band letter="C" title="The reading" gloss="The only console that sees both data spaces at once, side by side, always labelled. This is where a claim could escape unlabelled, so this is where the guard rails are loudest." figure="both spaces">
        {wl && (
          <>
            <table className="w-full text-left">
              <thead>
                <tr className="figcap">
                  <th className="border-b border-ink pb-2 font-normal">Space</th>
                  <th className="border-b border-ink pb-2 text-right font-normal">Orgs</th>
                  <th className="border-b border-ink pb-2 text-right font-normal">Sessions</th>
                  <th className="border-b border-ink pb-2 text-right font-normal">Responses</th>
                </tr>
              </thead>
              <tbody>
                {(["live", "demo"] as const).map((k) => (
                  <tr key={k} className="border-b border-rule">
                    <th scope="row" className="py-2.5 text-left text-[15px] font-normal">
                      {k === "live" ? "Live" : "Sandbox"}
                      <span className="ml-2 italic text-muted">{k === "live" ? "published" : "never published"}</span>
                    </th>
                    <td className="tabular py-2.5 text-right text-[15px]">{wl.spaces[k].orgs.toLocaleString()}</td>
                    <td className="tabular py-2.5 text-right text-[15px]">{wl.spaces[k].sessions.toLocaleString()}</td>
                    <td className="tabular py-2.5 text-right text-[15px]">{wl.spaces[k].responses.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="margin-note mt-3">
              Gate: <b>{wl.spaces.gate}</b> completions before a geography is named. Global view{" "}
              {wl.spaces.global_view_published ? "published" : "not published"}. Instrument{" "}
              <b>{wl.instrument ? `${wl.instrument.version} · ${wl.instrument.items} items` : "not loaded"}</b>.
            </p>
          </>
        )}
      </Band>

      <Band letter="D" title="The roll" gloss="Every person, organisation and network — and the one thing only this tier can do: step into any other console and see exactly what they see." figure={`${wl?.organisations.length ?? 0} org · ${nets.length} network`}>
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <p className="figcap">Organisations</p>
            {wl?.organisations.length ? (
              <Rows>
                {wl.organisations.map((o) => (
                  <Row key={o.short_name} label={o.name} meta={`${o.responses.toLocaleString()} responses`}>
                    <Link href={`/${o.short_name}/dashboard`} className="tabular border border-rule-2 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-ink-2 no-underline hover:border-ink hover:text-ink">
                      Open
                    </Link>
                  </Row>
                ))}
              </Rows>
            ) : (
              <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
                None yet. The live space stays empty on purpose until a real organisation arrives.
              </p>
            )}
          </div>
          <div>
            <p className="figcap">Networks</p>
            {nets.length ? (
              <Rows>
                {nets.map((n) => (
                  <Row key={n.short_name} label={n.name} meta={n.kind} />
                ))}
              </Rows>
            ) : (
              <p className="mt-2 text-[15px] text-ink-2">None yet.</p>
            )}
          </div>
        </div>
        <div className="mt-5">
          <p className="figcap">People</p>
          <Rows>
            {(wl?.people ?? []).map((p) => (
              <Row key={p.email} label={p.email} meta={p.role} />
            ))}
          </Rows>
        </div>
        <p className="margin-note mt-3 border-l-2 border-rule pl-3">
          Tiers are changed with <span className="tabular">set_user_role()</span>, which refuses
          unless you are already an administrator and refuses to change your own — so one
          compromised session cannot promote itself or lock the others out.
        </p>
      </Band>

      <Band letter="E" title="The house" gloss="The instrument register, the reserved names, the settings. Rarely touched — everything here changes the meaning of every number already collected." figure={wl?.instrument?.version ?? "not loaded"}>
        <Rows>
          <Row
            label="Instrument"
            meta={wl?.instrument ? `${wl.instrument.version} · ${wl.instrument.items} items · ${wl.instrument.status}` : "not loaded"}
            tone={wl?.instrument ? "good" : "warn"}
          />
          <Row label="Critical-mass gate" meta={`${wl?.spaces.gate ?? 400} completions`} />
          <Row
            label="Global view published"
            meta={wl?.spaces.global_view_published ? "yes" : "no"}
            tone={wl?.spaces.global_view_published ? "warn" : "plain"}
          />
        </Rows>
        <p className="margin-note mt-3 border-l-2 border-vermillion pl-3">
          The publish switch is the single control on the whole platform that can overclaim. It
          lives here, alone, with the sample size next to it — never on a settings page with
          fifteen others.
        </p>
      </Band>
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
      <Masthead edition={`The Index${tier ? ` · ${tier}` : ""} · working engine · not public`} />
      <main className="mx-auto max-w-5xl px-5 py-10">
        <div className="border-b border-ink pb-4">
          <p className="figcap">The engine</p>
          <h1 className="mt-2 text-[34px] leading-tight">
            The <span className="italic">Index</span>
            {tier && <span className="text-ink-2"> · {tier}</span>}
          </h1>
          <p className="mt-2 max-w-measure text-[15px] leading-relaxed text-ink-2">
            Five bands, the same order at every tier. What is on this page is what is waiting on a
            person.
          </p>

          {houses.length > 1 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {houses.map((h) => (
                <button
                  key={key(h)}
                  onClick={() => onScope(h)}
                  className={`tabular px-3.5 py-2 text-[10px] uppercase tracking-[0.14em] ${
                    scope && key(scope) === key(h)
                      ? "border-2 border-ink bg-ink text-paper"
                      : "border border-rule-2 text-ink-2 hover:border-ink hover:text-ink"
                  }`}
                >
                  {h.kind === "admin" ? "Administrator" : h.kind === "collab" ? "Collab" : h.name}
                </button>
              ))}
            </div>
          )}

          <Link
            href="/build/wireframes"
            className="tabular mt-4 inline-block border border-rule-2 px-3.5 py-2 text-[10px] uppercase tracking-[0.14em] text-ink-2 no-underline hover:border-ink hover:text-ink"
          >
            The console spec — all four tiers →
          </Link>
        </div>
        <div className="mt-9">{children}</div>
      </main>
      <Colophon />
    </>
  );
}
