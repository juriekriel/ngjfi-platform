"use client";

/**
 * Console → D · "Instrument versions": every instrument version from v1 to the
 * live one, a tab each, showing what changed from the version before — added,
 * removed, reworded and re-tagged questions, answer options, routing, and the
 * decisions recorded with each lock. Administrators only (it sits inside the
 * console); respondents never see an older version (non-negotiable #3).
 *
 * The files are discovered, not listed: v1, v2, … are loaded on demand from
 * src/data/instrument.vN.json up to the live version (src/lib/instrument.ts),
 * so v8 appears here the day it becomes live, with no edit to this file. Each
 * file is its own chunk, fetched only when this band opens.
 */
import { useEffect, useMemo, useState } from "react";
import { instrument } from "@/lib/instrument";
import { summarize, versionDiff, versionNumber, type DiffInstrument, type VersionDiff } from "@/lib/instrumentDiff";

const FIRST = 1;

async function loadVersions(upTo: number): Promise<DiffInstrument[]> {
  const out: DiffInstrument[] = [];
  // v0 is loaded only as the baseline v1 is compared with.
  for (let n = FIRST - 1; n <= upTo; n++) {
    try {
      const m = await import(`@/data/instrument.v${n}.json`);
      out.push((m.default ?? m) as DiffInstrument);
    } catch {
      /* a gap in the numbering: skip it */
    }
  }
  return out;
}

export default function VersionHistory({ activeInDatabase }: { activeInDatabase?: string | null }) {
  const live = instrument.version;
  const [versions, setVersions] = useState<DiffInstrument[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<string>(live);

  useEffect(() => {
    loadVersions(versionNumber(live))
      .then(setVersions)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [live]);

  const tabs = useMemo(() => (versions ?? []).filter((v) => versionNumber(v.version) >= FIRST), [versions]);
  const idx = tabs.findIndex((v) => v.version === tab);
  const current = idx >= 0 ? tabs[idx] : null;
  const prev = versions && current ? versions[versions.indexOf(current) - 1] ?? null : null;
  const diff = useMemo(() => (current && prev ? versionDiff(prev, current) : null), [current, prev]);
  const sum = current ? summarize(current) : null;

  if (err) return <p className="text-[14px] text-vermillion">Couldn&apos;t load the version files: {err}</p>;
  if (!versions) return <p className="text-[14px] text-ink-2">Loading the version files…</p>;

  const go = (i: number) => tabs[i] && setTab(tabs[i].version);
  const mismatch = activeInDatabase && activeInDatabase !== live;

  return (
    <div className="flex flex-col gap-4">
      {mismatch && (
        <p role="alert" className="rounded-xl border border-vermillion/40 bg-vermillion/10 px-4 py-3 text-[14px] leading-relaxed text-ink">
          <b>The database has {activeInDatabase} active, but the app fields {live}.</b> Phones ask {live}&apos;s questions while
          surveys in the database are still on {activeInDatabase}. Run <code className="font-mono text-[13px]">node scripts/seed-instrument.mjs</code>{" "}
          (it defaults to {live}) with a valid SUPABASE_ACCESS_TOKEN, then check <code className="font-mono text-[13px]">instrument_status()</code>.
        </p>
      )}

      <div role="tablist" aria-label="Instrument versions" className="flex flex-wrap gap-1 rounded-xl bg-rule/70 p-1">
        {tabs.map((v, i) => {
          const on = v.version === tab;
          return (
            <button
              key={v.version}
              role="tab"
              id={`ver-tab-${v.version}`}
              aria-selected={on}
              aria-controls="ver-panel"
              tabIndex={on ? 0 : -1}
              onClick={() => setTab(v.version)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight") go(Math.min(i + 1, tabs.length - 1));
                if (e.key === "ArrowLeft") go(Math.max(i - 1, 0));
              }}
              className={`rounded-lg px-3.5 py-2 text-[14px] font-semibold ${on ? "bg-plate text-ink shadow-sm" : "text-ink-2 hover:text-ink"}`}
            >
              {v.version}
              {v.version === live && <span className="ml-1.5 text-[11.5px] font-semibold text-emerald-deeper">live</span>}
              {activeInDatabase === v.version && v.version !== live && (
                <span className="ml-1.5 text-[11.5px] font-semibold text-vermillion">in database</span>
              )}
            </button>
          );
        })}
      </div>

      {current && sum && (
        <div id="ver-panel" role="tabpanel" aria-labelledby={`ver-tab-${current.version}`} className="rounded-xl border border-rule bg-plate p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h3 className="text-[20px] font-bold tracking-tight">
              {current.version}
              {prev && <span className="ml-2 text-[14px] font-normal text-ink-2">changes since {prev.version}</span>}
            </h3>
            <span className="text-[13px] text-ink-2">
              {sum.locked_on ? `Locked ${sum.locked_on}` : "Not locked"}
              {sum.decided_by ? ` · ${sum.decided_by}` : ""}
            </span>
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat k="Questions fielded" v={sum.fielded} />
            <Stat k="Scored" v={sum.scored} />
            <Stat k="In the file" v={sum.items} note={sum.archived ? `${sum.archived} archived` : sum.draft ? `${sum.draft} draft` : undefined} />
            <Stat k="Full survey" v={sum.minutes.full ? `≈${sum.minutes.full} min` : "—"} />
            <Stat k="J12 only" v={sum.minutes.j12 ? `≈${sum.minutes.j12} min` : "—"} />
          </dl>

          {diff && <Changes d={diff} />}

          {sum.decisions.length > 0 && (
            <section className="mt-5">
              <p className="figcap mb-2">Decisions recorded with the lock</p>
              <ul className="list-disc space-y-1.5 pl-5 text-[14px] leading-relaxed text-ink">
                {sum.decisions.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </section>
          )}
          {sum.note && (
            <details className="mt-4 text-[13.5px] leading-relaxed text-ink-2">
              <summary className="cursor-pointer font-semibold text-ink">The version note</summary>
              <p className="mt-2 whitespace-pre-line">{sum.note}</p>
            </details>
          )}

          <div className="mt-5 flex items-center justify-between border-t border-rule pt-4">
            <button
              type="button"
              disabled={idx <= 0}
              onClick={() => go(idx - 1)}
              className="rounded-lg border border-rule-2 px-3 py-1.5 text-[13.5px] font-semibold text-ink-2 hover:border-ink hover:text-ink disabled:opacity-40"
            >
              ← {idx > 0 ? tabs[idx - 1].version : ""}
            </button>
            <span className="text-[12.5px] text-ink-2">
              {idx + 1} of {tabs.length}
            </span>
            <button
              type="button"
              disabled={idx >= tabs.length - 1}
              onClick={() => go(idx + 1)}
              className="rounded-lg border border-rule-2 px-3 py-1.5 text-[13.5px] font-semibold text-ink-2 hover:border-ink hover:text-ink disabled:opacity-40"
            >
              {idx < tabs.length - 1 ? tabs[idx + 1].version : ""} →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ k, v, note }: { k: string; v: string | number; note?: string }) {
  return (
    <div className="rounded-lg bg-paper-deep px-3 py-2">
      <dt className="figcap">{k}</dt>
      <dd className="tabular text-[18px] text-ink">{v}</dd>
      {note && <dd className="text-[12px] text-ink-2">{note}</dd>}
    </div>
  );
}

function Changes({ d }: { d: VersionDiff }) {
  if (d.same)
    return <p className="mt-5 text-[14px] text-ink-2">Nothing a respondent is asked, or how it is scored, changed from {d.from}.</p>;
  return (
    <div className="mt-5 grid gap-5">
      <List title="Added" tone="good" items={d.added.map((a) => ({ k: a.key, t: a.text, m: [a.section, a.scored ? "scored" : "unscored"].filter(Boolean).join(" · ") }))} />
      <List title="Removed" tone="bad" items={d.removed.map((a) => ({ k: a.key, t: a.text, m: [a.section, a.scored ? "scored" : "unscored"].filter(Boolean).join(" · ") }))} />
      <List title="Archived (kept in the file, never fielded)" items={d.archived.map((a) => ({ k: a.key, t: a.text }))} />
      <List title="Brought back from the archive" tone="good" items={d.restored.map((a) => ({ k: a.key, t: a.text }))} />
      <List title="Reworded (English)" items={d.reworded.map((r) => ({ k: r.key, t: r.to, m: `was: ${r.from}` }))} />
      <List
        title="Re-tagged (scoring or routing tags)"
        items={d.retagged.map((r) => ({ k: r.key, t: r.text, m: r.changes.map((c) => `${c.field}: ${c.from} → ${c.to}`).join(" · ") }))}
      />
      <List
        title="Answer options"
        items={d.options.map((o) => ({
          k: o.key,
          t: o.text,
          m: [o.added.length ? `+ ${o.added.join(", ")}` : "", o.removed.length ? `− ${o.removed.join(", ")}` : "", ...o.relabelled].filter(Boolean).join(" · "),
        }))}
      />
      <List title="Who is asked (routing rule changed)" items={d.routing.map((r) => ({ k: r.key, t: r.text }))} />
      {d.meta.length > 0 && (
        <section>
          <p className="figcap mb-2">Version settings</p>
          <ul className="divide-y divide-rule rounded-lg border border-rule">
            {d.meta.map((m) => (
              <li key={m.label} className="flex flex-wrap justify-between gap-2 px-3 py-2 text-[13.5px]">
                <span className="text-ink-2">{m.label}</span>
                <span className="tabular text-ink">
                  {m.from} → {m.to}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

const SHOW = 8;

function List({ title, items, tone }: { title: string; items: { k: string; t: string; m?: string }[]; tone?: "good" | "bad" }) {
  const [all, setAll] = useState(false);
  if (!items.length) return null;
  const shown = all ? items : items.slice(0, SHOW);
  const mark = tone === "good" ? "text-emerald-deeper" : tone === "bad" ? "text-vermillion" : "text-ink-2";
  return (
    <section>
      <p className="figcap mb-2">
        {title} · <span className={mark}>{items.length}</span>
      </p>
      <ul className="divide-y divide-rule rounded-lg border border-rule">
        {shown.map((i) => (
          <li key={i.k} className="px-3 py-2">
            <span className="block text-[14px] leading-snug text-ink">{i.t || <i className="text-ink-2">(no English text)</i>}</span>
            <span className="mt-0.5 block font-mono text-[11.5px] text-ink-2">
              {i.k}
              {i.m ? ` · ${i.m}` : ""}
            </span>
          </li>
        ))}
      </ul>
      {items.length > SHOW && (
        <button type="button" onClick={() => setAll(!all)} className="mt-1.5 text-[13px] font-semibold text-violet-deeper hover:underline">
          {all ? "Show fewer" : `Show all ${items.length}`}
        </button>
      )}
    </section>
  );
}
