"use client";

/**
 * The house and its rooms — the scope row on an organisation's dashboard.
 *
 * One card for the whole house, then one per distribution link ("room",
 * migration 0028): its own name (rename in place), its own URL, its own open
 * and close date/time, its status and its n. Selecting a card scopes the
 * dashboard to that room. A room's data rolls up into the house; only the
 * house is ever compared to the Collab (the frame is told overlay allowed =
 * false whenever a room is selected).
 */
import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LinkForm, type DistributionLink } from "@/components/index/LinksPanel";
import QrCode from "@/components/index/QrCode";
import SurveyConsentStep, { consentOpen, type SurveyConsentStatus } from "@/components/index/SurveyConsentStep";
import { ITEM_SETS } from "@/lib/instrument";

export type RoomSelection = { kind: "house" } | { kind: "room"; link: DistributionLink };
/** The dashboard's views (?view=) — switched by the tiles beside "+ New link". */
export type DashboardView = "results" | "settings" | "share" | "team";

const STATUS: Record<DistributionLink["status"], { label: string; dot: string }> = {
  active: { label: "Open", dot: "rgb(var(--c-green))" },
  scheduled: { label: "Scheduled", dot: "rgb(var(--c-navy))" },
  ended: { label: "Closed", dot: "rgb(var(--c-muted))" },
};

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function windowLines(l: DistributionLink): [string, string] {
  const now = Date.now();
  const opens = l.active_from
    ? `${new Date(l.active_from).getTime() > now ? "Opens" : "Opened"} ${when(l.active_from)}`
    : "Open from creation";
  const closes = l.active_to ? `${new Date(l.active_to).getTime() > now ? "Closes" : "Closed"} ${when(l.active_to)}` : "No close date";
  return [opens, closes];
}

export default function RoomCards({
  sb,
  orgSlug,
  houseN,
  selected,
  onSelect,
  orgName,
  view = "results",
  onView,
}: {
  sb: SupabaseClient;
  orgSlug: string;
  houseN: number | null;
  selected: RoomSelection;
  onSelect: (s: RoomSelection) => void;
  /** The organisation's registered name — the house card reads "All <name> surveys". */
  orgName: string;
  /** Which dashboard view is showing; the two tiles beside "+ New link" switch it. */
  view?: DashboardView;
  onView?: (v: DashboardView) => void;
}) {
  const [links, setLinks] = useState<DistributionLink[] | null>(null);
  // Test links and their test-answer counts (0038) — counted apart from real answers.
  const [tests, setTests] = useState<Record<string, { started: number; completed: number; retention_days: number }>>({});
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<DistributionLink | "new" | null>(null);
  const [qr, setQr] = useState<{ name: string; url: string; cards: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [origin, setOrigin] = useState("https://jfindx.org");
  // Two-level consent (0053): a survey's link and QR appear only once it is consented.
  const [consents, setConsents] = useState<Record<string, SurveyConsentStatus> | null>(null);
  const [consenting, setConsenting] = useState<{ linkId: string | null; name: string } | null>(null);

  useEffect(() => setOrigin(window.location.origin), []);

  const load = useCallback(async () => {
    const [{ data, error }, t, c] = await Promise.all([
      sb.rpc("org_distribution_links", { p_org_slug: orgSlug }),
      sb.rpc("org_test_links", { p_org_slug: orgSlug }),
      sb.rpc("org_survey_consents", { p_org_slug: orgSlug }),
    ]);
    // A database without 0053 has no survey consents: show links as before.
    if (c.error) setConsents(null);
    else {
      const list = ((c.data as { surveys: SurveyConsentStatus[] | null })?.surveys ?? []);
      setConsents(Object.fromEntries(list.map((x) => [x.link_id ?? "house", x])));
    }
    const testMap = (t.error ? {} : (t.data as Record<string, { started: number; completed: number; retention_days: number }>) ?? {});
    setTests(testMap);
    if (error) setErr(error.message);
    else {
      setErr(null);
      setLinks(((data as DistributionLink[]) ?? []).slice().reverse().map((l) => ({ ...l, is_test: l.id in testMap })));
    }
  }, [sb, orgSlug]);

  useEffect(() => {
    load();
  }, [load]);

  async function rename(l: DistributionLink, name: string) {
    const next = name.trim();
    if (!next || next === l.name) return;
    const { error } = await sb.rpc("upsert_distribution_link", {
      p_org_slug: orgSlug,
      p_id: l.id,
      p_name: next,
      p_slug: l.slug,
      p_item_set: l.item_set,
      p_active_from: l.active_from,
      p_active_to: l.active_to,
    });
    if (error) setErr(error.message);
    else {
      await load();
      if (selected.kind === "room" && selected.link.id === l.id) onSelect({ kind: "room", link: { ...l, name: next } });
    }
  }

  async function copy(url: string, id: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1600);
    } catch {
      setErr("Couldn't copy — select the link text instead.");
    }
  }

  const houseUrl = `${origin}/${orgSlug}`;
  const houseOpen = consents === null || consentOpen(consents.house);
  const houseOn = selected.kind === "house";

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">The house and its rooms<span className="hidden sm:inline"> · each link is its own room</span></p>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {onView && (
            <>
              <button
                type="button"
                aria-pressed={view === "share"}
                onClick={() => onView(view === "share" ? "results" : "share")}
                className={`whitespace-nowrap rounded-lg border px-4 py-2.5 text-[14px] font-semibold ${view === "share" ? "border-ink bg-ink text-paper" : "border-rule-2 bg-plate text-ink hover:border-ink"}`}
              >
                Share about the JFINDX
              </button>
              <button
                type="button"
                aria-pressed={view === "team"}
                onClick={() => onView(view === "team" ? "results" : "team")}
                className={`whitespace-nowrap rounded-lg border px-4 py-2.5 text-[14px] font-semibold ${view === "team" ? "border-ink bg-ink text-paper" : "border-rule-2 bg-plate text-ink hover:border-ink"}`}
              >
                Team &amp; access
              </button>
              <button
                type="button"
                aria-pressed={view === "settings"}
                onClick={() => onView(view === "settings" ? "results" : "settings")}
                className={`whitespace-nowrap rounded-lg bg-gradient-to-r from-violet via-violet-deep to-violet-deeper px-4 py-2.5 text-[14px] font-semibold text-plate hover:opacity-90 ${view === "settings" ? "ring-2 ring-violet-deeper ring-offset-2" : ""}`}
              >
                {view === "settings" ? "← Back to results" : "Survey settings"}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="whitespace-nowrap rounded-lg bg-gradient-to-r from-emerald via-emerald-deep to-emerald-deeper px-4 py-2.5 text-[14px] font-semibold text-plate"
          >
            + New link
          </button>
        </div>
      </div>

      {err && <p className="text-[13px] text-vermillion">{err}</p>}

      <div className="-mx-1 flex snap-x gap-2.5 overflow-x-auto px-1 pb-1 lg:grid lg:grid-cols-5 lg:overflow-visible">
        <Card on={houseOn}>
          <button type="button" aria-pressed={houseOn} onClick={() => onSelect({ kind: "house" })} className="flex w-full items-center justify-between text-left">
            <Kicker on={houseOn}>The house</Kicker>
            <Status on={houseOn} dot="rgb(var(--c-emerald))" label="total" />
          </button>
          <button type="button" onClick={() => onSelect({ kind: "house" })} className="py-1 text-left text-[16px] font-bold">
            All {orgName} surveys
          </button>
          {houseOpen ? (
            <Mono on={houseOn}>{houseUrl.replace(/^https?:\/\//, "")}</Mono>
          ) : (
            <NeedsConsent on={houseOn} />
          )}
          <ConsentLine on={houseOn} s={consents?.house} />
          <p className={`text-[12.5px] leading-snug ${houseOn ? "text-paper/75" : "text-ink-2"}`}>
            Every room rolls up here. Only the house compares to the Collab.
          </p>
          <div className="mt-auto flex items-center justify-between gap-2 pt-1.5">
            <span className="whitespace-nowrap text-[13px] font-semibold">n {houseN == null ? "—" : houseN.toLocaleString()}</span>
            <span className="flex gap-1.5">
              {houseOpen ? (
                <>
                  <Mini on={houseOn} onClick={() => copy(houseUrl, "house")}>{copied === "house" ? "Copied" : "Copy"}</Mini>
                  <Mini on={houseOn} onClick={() => setQr({ name: "Your survey", url: houseUrl, cards: `/${orgSlug}/dashboard/cards` })}>QR</Mini>
                </>
              ) : (
                <Mini on={houseOn} onClick={() => setConsenting({ linkId: null, name: "Your survey" })}>Confirm consent</Mini>
              )}
            </span>
          </div>
        </Card>

        {links === null && !err && <p className="self-center px-2 text-[13px] text-ink-2">Loading links…</p>}

        {links?.map((l) => {
          const on = selected.kind === "room" && selected.link.id === l.id;
          const url = `${origin}/${orgSlug}/l/${l.slug}`;
          const [opens, closes] = windowLines(l);
          const st = STATUS[l.status];
          const test = l.is_test ? tests[l.id] : undefined;
          const open = l.is_test || consents === null || consentOpen(consents[l.id]);
          return (
            <Card key={l.id} on={on}>
              <button type="button" aria-pressed={on} onClick={() => onSelect({ kind: "room", link: l })} className="flex w-full items-center justify-between text-left">
                <Kicker on={on}>
                  {l.is_test ? (
                    <span className="rounded bg-amber-300 px-1.5 py-0.5 font-bold text-ink">TEST</span>
                  ) : l.item_set && l.item_set !== "full" ? (
                    ITEM_SETS.find((s) => s.name === l.item_set)?.label ?? l.item_set
                  ) : "Survey link"}
                </Kicker>
                <Status on={on} dot={st.dot} label={st.label} />
              </button>
              <label className="flex flex-col gap-0.5">
                <span className={`font-mono text-[10px] uppercase ${on ? "text-paper/70" : "text-ink-2"}`}>Name · rename any time</span>
                <input
                  key={l.name}
                  defaultValue={l.name}
                  onFocus={() => !on && onSelect({ kind: "room", link: l })}
                  onBlur={(e) => rename(l, e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  aria-label={`Name of link ${l.name}`}
                  className={`w-full rounded-md border px-2 py-1 text-[15px] font-bold ${
                    on ? "border-paper/30 bg-paper/10 text-paper" : "border-rule bg-plate text-ink"
                  }`}
                />
              </label>
              {open ? <Mono on={on}>{url.replace(/^https?:\/\//, "")}</Mono> : <NeedsConsent on={on} />}
              {!l.is_test && <ConsentLine on={on} s={consents?.[l.id]} />}
              <p className={`text-[12.5px] leading-snug ${on ? "text-paper/75" : "text-ink-2"}`}>
                {test ? (
                  <>Never counted · deleted after {test.retention_days} days</>
                ) : (
                  <>
                    {opens}
                    <br />
                    {closes}
                  </>
                )}
              </p>
              <div className="mt-auto flex items-center justify-between gap-2 pt-1.5">
                <span className="whitespace-nowrap text-[13px] font-semibold">
                  {test ? `${test.completed} test` : `n ${l.n.toLocaleString()}`}
                </span>
                <span className="flex gap-1.5">
                  {open ? (
                    <>
                      <Mini on={on} onClick={() => copy(url, l.id)}>{copied === l.id ? "Copied" : "Copy"}</Mini>
                      <Mini on={on} onClick={() => setQr({ name: l.name, url, cards: `/${orgSlug}/dashboard/cards?link=${encodeURIComponent(l.slug)}` })}>QR</Mini>
                    </>
                  ) : (
                    <Mini on={on} onClick={() => setConsenting({ linkId: l.id, name: l.name })}>Confirm consent</Mini>
                  )}
                  <Mini on={on} onClick={() => setEditing(l)}>Dates</Mini>
                </span>
              </div>
            </Card>
          );
        })}
      </div>

      {consenting && (
        <Modal wide label={`Consent for ${consenting.name}`} onClose={() => setConsenting(null)}>
          <SurveyConsentStep
            sb={sb}
            orgSlug={orgSlug}
            linkId={consenting.linkId}
            surveyName={consenting.name}
            existing={consents?.[consenting.linkId ?? "house"]}
            onCancel={() => setConsenting(null)}
            onDone={() => {
              setConsenting(null);
              load();
            }}
          />
        </Modal>
      )}

      {editing && (
        <Modal label={editing === "new" ? "New link" : `Edit ${editing.name}`} onClose={() => setEditing(null)}>
          <LinkForm
            sb={sb}
            orgSlug={orgSlug}
            link={editing === "new" ? null : editing}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              load();
            }}
          />
        </Modal>
      )}

      {qr && (
        <Modal label={`QR code for ${qr.name}`} onClose={() => setQr(null)}>
          <div className="flex flex-col items-center gap-3 p-2 text-center">
            <p className="text-[16px] font-semibold">{qr.name}</p>
            <QrCode value={qr.url} size={240} label={`QR code linking to ${qr.url}`} />
            <p className="font-mono text-[12px] text-ink-2">{qr.url.replace(/^https?:\/\//, "")}</p>
            <a href={qr.cards} className="rounded-lg bg-ink px-4 py-2.5 text-[14px] font-semibold text-paper no-underline">
              Print cards →
            </a>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Card({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`flex min-h-[176px] w-[240px] shrink-0 snap-start flex-col gap-1.5 rounded-2xl border px-3.5 pb-3.5 pt-3 lg:w-auto ${
        on ? "border-ink bg-ink text-paper" : "border-rule-2 bg-plate text-ink"
      }`}
    >
      {children}
    </div>
  );
}

function Kicker({ on, children }: { on: boolean; children: React.ReactNode }) {
  return <span className={`font-mono text-[10.5px] uppercase tracking-[0.06em] ${on ? "text-paper/75" : "text-ink-2"}`}>{children}</span>;
}

function Mono({ on, children }: { on: boolean; children: React.ReactNode }) {
  return <span className={`truncate font-mono text-[11.5px] ${on ? "text-paper/75" : "text-ink-2"}`}>{children}</span>;
}

function Status({ on, dot, label }: { on: boolean; dot: string; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[10.5px] ${on ? "bg-paper/15 text-paper" : "bg-paper-deep text-ink"}`}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />
      {label}
    </span>
  );
}

function Mini({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[32px] rounded-md px-2 text-[12px] font-semibold ${
        on ? "border border-paper/40 text-paper" : "border border-rule-2 bg-plate text-ink hover:border-ink"
      }`}
    >
      {children}
    </button>
  );
}

function Modal({ label, onClose, children, wide = false }: { label: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()} className={`w-full ${wide ? "max-w-2xl" : "max-w-md"} rounded-2xl bg-plate p-4 shadow-xl`}>
        {children}
      </div>
    </div>
  );
}

/** Where the link would be, until the survey is consented (0053). */
function NeedsConsent({ on }: { on: boolean }) {
  return (
    <p className={`rounded-md border border-dashed px-2 py-1 text-[12.5px] leading-snug ${on ? "border-paper/40 text-paper/85" : "border-rule-2 text-ink-2"}`}>
      Needs consent — the link and QR appear once it&apos;s confirmed.
    </p>
  );
}

/** "Consent ✓ Ana Lead · 8 Oct" — who confirmed this survey, and when. */
function ConsentLine({ on, s }: { on: boolean; s?: SurveyConsentStatus | null }) {
  if (!s || !s.confirmed_at || !(s.state === "current" || s.state === "outdated")) return null;
  const when = new Date(s.confirmed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return (
    <p className={`text-[11.5px] ${on ? "text-paper/75" : "text-ink-2"}`}>
      Consent ✓ {s.confirmed_by ?? "confirmed"} · {when}
      {s.state === "outdated" ? " · please reconfirm" : ""}
    </p>
  );
}
