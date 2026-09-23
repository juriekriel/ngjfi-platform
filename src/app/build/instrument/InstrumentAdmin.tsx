"use client";

/**
 * /build/instrument — the instrument admin UI (administrators and the Collab).
 *
 * Shows exactly what the survey fields: the bundled instrument
 * (src/data/instrument.v4.json — the single source of truth, which is why
 * the survey runs offline). On top of it:
 *   - integrity checks against the brief (src/lib/instrumentChecks.ts);
 *   - the 3 × 4 coverage — scored items per cell;
 *   - the full item bank, filterable, every tag and translation visible;
 *   - what changed from the previous version;
 *   - proposals: anyone here can propose a change to an item; researchers
 *     decide; an accepted proposal is implemented as a reviewed PR that bumps
 *     the version (migration 0035). Items are never edited in place — that
 *     would break version binding, offline fielding and scoring parity.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import v3 from "@/data/instrument.v3.json";
import v4 from "@/data/instrument.v4.json";
import { cellCounts, diffKeys, runChecks, QUESTIONS, TIER_ORDER, type CheckItem } from "@/lib/instrumentChecks";
import { Band, Row, Rows } from "@/components/console/Bands";

type Item = CheckItem & {
  order?: number;
  branch?: string;
  show_if?: unknown;
  help?: Record<string, string>;
  scale?: { points?: number };
  session_field?: string;
};
type Proposal = {
  id: string; created_at: string; version: string; item_key: string | null; kind: string; locale: string | null;
  proposal: string; reason: string | null; status: string; decision_note: string | null; proposed_by: string | null;
};

const LIVE = v4 as unknown as { version: string; scoringVersion: string; locales: string[]; items: Item[] };
const PREV = v3 as unknown as { version: string; items: Item[] };
const KINDS = ["wording", "translation", "tagging", "scoring", "options", "new_item", "remove_item", "other"] as const;

export default function InstrumentAdmin() {
  const sb = useMemo(() => getSupabaseBrowser(), []);
  const [role, setRole] = useState<string | null | undefined>(undefined);
  const [dbVersions, setDbVersions] = useState<{ version: string; status: string }[] | null>(null);
  const [section, setSection] = useState("all");
  const [domain, setDomain] = useState("all");
  const [tier, setTier] = useState("all");
  const [coreOnly, setCoreOnly] = useState(false);
  const [locale, setLocale] = useState(LIVE.locales[0]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [proposing, setProposing] = useState<string | null | "new">(null);
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [perr, setPerr] = useState<string | null>(null);

  useEffect(() => {
    if (!sb) return setRole(null);
    sb.rpc("my_context").then(({ data }) => setRole((data as { role?: string } | null)?.role ?? null));
    sb.from("instrument_versions").select("version,status").order("created_at", { ascending: false }).then(({ data }) => setDbVersions((data as { version: string; status: string }[]) ?? []));
  }, [sb]);

  const loadProposals = useCallback(async () => {
    if (!sb) return;
    const { data, error } = await sb.rpc("list_instrument_changes");
    if (error) setPerr(/list_instrument_changes/.test(error.message) ? "Proposals need migration 0035, which isn't applied to this database yet." : error.message);
    else {
      setPerr(null);
      setProposals(data as Proposal[]);
    }
  }, [sb]);
  useEffect(() => {
    if (role === "admin" || role === "collab") loadProposals();
  }, [role, loadProposals]);

  const checks = useMemo(() => runChecks(LIVE.items, LIVE.locales), []);
  const cells = useMemo(() => cellCounts(LIVE.items), []);
  const diff = useMemo(() => diffKeys(PREV.items, LIVE.items), []);
  const sections = useMemo(() => ["all", ...new Set(LIVE.items.map((i) => i.section ?? "—"))], []);
  const domains = useMemo(() => ["all", ...new Set(LIVE.items.map((i) => i.question_domain))], []);
  const items = useMemo(
    () =>
      [...LIVE.items]
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .filter(
          (i) =>
            (section === "all" || (i.section ?? "—") === section) &&
            (domain === "all" || i.question_domain === domain) &&
            (tier === "all" || i.tier === tier) &&
            (!coreOnly || i.core) &&
            (!q || i.key.includes(q.toLowerCase()) || Object.values(i.text).some((t) => t.toLowerCase().includes(q.toLowerCase()))),
        ),
    [section, domain, tier, coreOnly, q],
  );

  const dbActive = dbVersions?.find((v) => v.status === "active" || v.status === "published");
  const drift = dbActive && dbActive.version !== LIVE.version;

  if (role === undefined) return <Shell><p className="text-[14px] text-muted">Checking access…</p></Shell>;
  if (role !== "admin" && role !== "collab")
    return (
      <Shell>
        <p className="max-w-measure text-[15.5px] leading-relaxed text-ink-2">
          The instrument view is for administrators and the Collab. <Link href="/build">Back to the console</Link>.
        </p>
      </Shell>
    );

  return (
    <Shell>
      <div className="grid gap-3 sm:grid-cols-4">
        <Fig label="Fielded by the survey" value={LIVE.version} note={`scoring ${LIVE.scoringVersion}`} />
        <Fig label="Active in the database" value={dbActive?.version ?? "—"} note={drift ? "differs from the survey — reseed" : dbActive ? "matches" : "not readable here"} warn={Boolean(drift)} />
        <Fig label="Questions" value={String(LIVE.items.length)} note={`${LIVE.items.filter((i) => i.scored).length} scored · ${LIVE.items.filter((i) => i.core).length} core`} />
        <Fig label="Languages" value={LIVE.locales.join(" · ")} note="every string translatable" />
      </div>

      <Band letter="A" title="Integrity" gloss="The brief's rules for the item bank, checked against the live file. The same checks run in CI, so a broken bank can't ship." figure={`${checks.filter((c) => c.ok).length} of ${checks.length} pass`}>
        <Rows>
          {checks.map((c) => (
            <Row key={c.id} tone={c.ok ? "good" : "warn"} label={c.label} meta={c.detail} />
          ))}
        </Rows>
      </Band>

      <Band letter="B" title="Coverage" gloss="Scored items in each cell of the model — the three questions by the four tiers." figure="3 × 4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] table-fixed border-separate border-spacing-1.5 text-center">
            <thead>
              <tr>
                <th className="w-[110px]" />
                {TIER_ORDER.map((t) => <th key={t} className="figcap font-normal">{t}</th>)}
              </tr>
            </thead>
            <tbody>
              {QUESTIONS.map((qq) => (
                <tr key={qq}>
                  <th className="text-left text-[14px] font-semibold capitalize">{qq}</th>
                  {TIER_ORDER.map((t) => (
                    <td key={t} className={`rounded-lg py-3 text-[20px] font-bold ${cells[qq][t] ? "bg-paper-deep" : "bg-vermillion/15 text-vermillion"}`}>{cells[qq][t]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[13px] text-ink-2">
          Since {PREV.version}: {diff.added.length} added · {diff.removed.length} removed · {diff.retagged.length} re-tagged or re-scored.
        </p>
      </Band>

      <Band letter="C" title="The item bank" gloss="Everything a respondent can be asked, in order, with every tag. Open a row for its options, branching and translations — and to propose a change." figure={`${items.length} shown`}>
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <Sel label="Section" value={section} onChange={setSection} options={sections} />
          <Sel label="Domain" value={domain} onChange={setDomain} options={domains} />
          <Sel label="Tier" value={tier} onChange={setTier} options={["all", ...TIER_ORDER, "na"]} />
          <Sel label="Show text in" value={locale} onChange={setLocale} options={LIVE.locales} />
          <label className="flex items-center gap-2 pb-2 text-[13px]"><input type="checkbox" checked={coreOnly} onChange={(e) => setCoreOnly(e.target.checked)} /> Core only</label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wider text-ink-2">
            Search
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="key or wording" className="rounded-lg border border-rule-2 px-3 py-2 text-[14px] normal-case tracking-normal text-ink" />
          </label>
          <button onClick={() => setProposing("new")} className="ml-auto rounded-lg border border-rule-2 px-3.5 py-2 text-[13px] font-semibold hover:border-ink">Propose a new item</button>
        </div>
        {proposing === "new" && <ProposeForm itemKey={null} onDone={() => { setProposing(null); loadProposals(); }} />}

        <ul className="divide-y divide-rule rounded-xl border border-rule bg-plate">
          {items.map((i) => {
            const isOpen = open === i.key;
            return (
              <li key={i.key} className="px-4 py-3">
                <button onClick={() => setOpen(isOpen ? null : i.key)} aria-expanded={isOpen} className="flex w-full flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="font-mono text-[11px] text-ink-2">{i.order ?? "—"} · {i.key}</span>
                    <span className="block text-[15px] leading-snug">{i.text[locale] || <em className="text-vermillion">missing {locale}</em>}</span>
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {[i.section, i.question_domain, i.tier !== "na" ? i.tier : null, i.type, i.scored ? "scored" : "unscored", i.core ? "core" : null, i.reverse_scored ? "reverse" : null, i.measure, i.branch, i.core_activity ? "core activity" : null]
                      .filter((tag, n, all) => Boolean(tag) && all.indexOf(tag) === n)
                      .map((tag) => (
                        <span key={String(tag)} className={`rounded-full px-2 py-0.5 font-mono text-[10.5px] ${tag === "core" || tag === "core activity" ? "bg-emerald/15 text-emerald-deeper" : tag === "reverse" ? "bg-vermillion/10 text-vermillion" : "bg-paper-deep text-ink-2"}`}>{String(tag)}</span>
                      ))}
                  </span>
                </button>
                {isOpen && (
                  <div className="mt-3 grid gap-3 border-t border-rule pt-3 text-[13.5px] md:grid-cols-2">
                    <div>
                      <p className="figcap">Wording</p>
                      {LIVE.locales.map((l) => <p key={l} className="mt-1"><span className="font-mono text-[11px] text-ink-2">{l}</span> {i.text[l] || <em className="text-vermillion">missing</em>}</p>)}
                      {i.options && (
                        <>
                          <p className="figcap mt-3">Options</p>
                          <ul className="mt-1 space-y-0.5">
                            {i.options.map((o) => <li key={String(o.value)}><span className="font-mono text-[11px] text-ink-2">{String(o.value)}</span> {o.text[locale]}</li>)}
                          </ul>
                        </>
                      )}
                    </div>
                    <div>
                      <p className="figcap">Rules</p>
                      <pre className="mt-1 overflow-x-auto rounded-lg bg-paper-deep p-2.5 font-mono text-[11.5px] leading-relaxed">{JSON.stringify({ show_if: i.show_if, scale: i.scale, session_field: i.session_field, attention_check: i.attention_check }, null, 2)}</pre>
                      {proposing === i.key ? (
                        <ProposeForm itemKey={i.key} onDone={() => { setProposing(null); loadProposals(); }} />
                      ) : (
                        <button onClick={() => setProposing(i.key)} className="mt-3 rounded-lg border border-rule-2 px-3.5 py-2 text-[13px] font-semibold hover:border-ink">Propose a change to this item</button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Band>

      <Band letter="D" title="Proposals" gloss="Changes people have asked for. Researchers decide; an accepted change ships as a new version through a reviewed pull request, and every response stays bound to the version it was answered under." figure={proposals ? `${proposals.filter((p) => p.status === "open").length} open` : "…"}>
        {perr && <p className="text-[13px] text-vermillion">{perr}</p>}
        {proposals && (proposals.length === 0 ? (
          <p className="text-[14px] text-ink-2">None yet.</p>
        ) : (
          <ul className="space-y-2.5">
            {proposals.map((p) => (
              <li key={p.id} className="rounded-xl border border-rule bg-plate px-4 py-3">
                <p className="font-mono text-[11px] text-ink-2">{p.version} · {p.item_key ?? "new item"} · {p.kind}{p.locale ? ` · ${p.locale}` : ""} · {p.proposed_by ?? "—"} · {new Date(p.created_at).toLocaleDateString()}</p>
                <p className="mt-1 text-[15px] leading-snug">{p.proposal}</p>
                {p.reason && <p className="mt-1 text-[13px] text-ink-2">Why: {p.reason}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-paper-deep px-2 py-0.5 font-mono text-[10.5px]">{p.status}</span>
                  {p.decision_note && <span className="text-[12.5px] text-ink-2">{p.decision_note}</span>}
                  {role === "admin" && (
                    <span className="ml-auto flex gap-1.5">
                      {(["accepted", "declined", "implemented"] as const).filter((s) => s !== p.status).map((s) => (
                        <button key={s} onClick={async () => {
                          const note = s === "declined" ? window.prompt("Why? (recorded with the decision)") ?? undefined : undefined;
                          await sb?.rpc("decide_instrument_change", { p_id: p.id, p_status: s, p_note: note ?? null });
                          loadProposals();
                        }} className="rounded-md border border-rule-2 px-2.5 py-1 text-[12px] font-semibold capitalize hover:border-ink">{s}</button>
                      ))}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ))}
      </Band>
    </Shell>
  );
}

function ProposeForm({ itemKey, onDone }: { itemKey: string | null; onDone: () => void }) {
  const sb = useMemo(() => getSupabaseBrowser(), []);
  const [kind, setKind] = useState<string>(itemKey ? "wording" : "new_item");
  const [locale, setLocale] = useState("");
  const [proposal, setProposal] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      className="mt-3 space-y-2 rounded-lg border-2 border-ink p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!sb) return;
        const { error } = await sb.rpc("propose_instrument_change", {
          p_version: LIVE.version, p_item_key: itemKey, p_kind: kind, p_proposal: proposal, p_reason: reason || null, p_locale: locale || null,
        });
        if (error) setErr(error.message);
        else onDone();
      }}
    >
      <div className="flex flex-wrap gap-2">
        <Sel label="Kind" value={kind} onChange={setKind} options={[...KINDS]} />
        {kind === "translation" && <Sel label="Language" value={locale} onChange={setLocale} options={["", ...LIVE.locales]} />}
      </div>
      <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wider text-ink-2">
        The change
        <textarea required rows={3} value={proposal} onChange={(e) => setProposal(e.target.value)} className="rounded-lg border border-rule-2 px-3 py-2 text-[14px] normal-case tracking-normal text-ink" />
      </label>
      <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wider text-ink-2">
        Why
        <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className="rounded-lg border border-rule-2 px-3 py-2 text-[14px] normal-case tracking-normal text-ink" />
      </label>
      {err && <p className="text-[13px] text-vermillion">{err}</p>}
      <div className="flex gap-2">
        <button type="submit" className="rounded-lg bg-ink px-4 py-2 text-[13px] font-semibold text-paper">Send to researchers</button>
        <button type="button" onClick={onDone} className="rounded-lg border border-rule-2 px-4 py-2 text-[13px] font-semibold">Cancel</button>
      </div>
    </form>
  );
}

function Sel({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: readonly string[] }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wider text-ink-2">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-lg border border-rule-2 bg-plate px-2.5 py-2 text-[14px] normal-case tracking-normal text-ink">
        {options.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
      </select>
    </label>
  );
}

function Fig({ label, value, note, warn = false }: { label: string; value: string; note: string; warn?: boolean }) {
  return (
    <div className={`rounded-2xl border bg-plate px-4 py-3.5 ${warn ? "border-vermillion" : "border-rule"}`}>
      <p className="font-mono text-[10.5px] uppercase tracking-wider text-ink-2">{label}</p>
      <p className="mt-1 text-[24px] font-bold tracking-tight">{value}</p>
      <p className={`text-[12.5px] ${warn ? "text-vermillion" : "text-ink-2"}`}>{note}</p>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-6xl space-y-8 px-5 py-8 sm:px-8">
      <div>
        <Link href="/build" className="font-mono text-[11px] uppercase tracking-wider text-ink-2 no-underline hover:text-ink">← The console</Link>
        <h1 className="mt-2 text-[30px] font-bold tracking-tight">The instrument</h1>
        <p className="mt-1 max-w-measure text-[15px] leading-relaxed text-ink-2">
          What every respondent is asked, exactly as the survey fields it. Wording and scoring belong to the
          researchers: propose here, decide there, ship as a new version.
        </p>
      </div>
      {children}
    </main>
  );
}
