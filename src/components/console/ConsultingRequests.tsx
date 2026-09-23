"use client";

/**
 * Consulting Requests — tile E on the Collab console.
 *
 * Every "What does this mean?" an organisation sends from either dashboard
 * tab lands here (submit_consulting_question() → list_consulting_questions(),
 * migrations 0030/0033). Each request carries the question and a description
 * of the aggregate view the asker was on — never a respondent's answers.
 * list_consulting_questions() and update_consulting_question() both check
 * Collab/admin tier in the database; this component renders what it is
 * allowed to fetch.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";

export type ConsultStatus = "new" | "assigned" | "answered";
export type ConsultRequest = {
  id: string;
  org: { slug: string; short_name: string; name: string };
  prompt: string;
  context: { summary?: string; tab?: string; scope?: string; room?: string; view?: string; tier?: string } | null;
  status: ConsultStatus;
  assigned_to: string | null;
  requested_by: string | null;
  created_at: string;
};

const LABEL: Record<ConsultStatus, string> = { new: "New", assigned: "With a facilitator", answered: "Answered" };
const DOT: Record<ConsultStatus, string> = {
  new: "rgb(var(--c-navy))",
  assigned: "rgb(var(--c-violet))",
  answered: "rgb(var(--c-green))",
};

/** One fetch, shared by the tile (counts) and the band (the list). */
export function useConsultingRequests() {
  const sb = useMemo(() => getSupabaseBrowser(), []);
  const [items, setItems] = useState<ConsultRequest[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sb) return;
    const { data, error } = await sb.rpc("list_consulting_questions");
    if (error)
      setErr(
        /context|status|assigned_to/.test(error.message)
          ? "Consulting Requests reads the fields added in migration 0033, which isn't applied to this database yet."
          : error.message,
      );
    else {
      setErr(null);
      setItems((data as ConsultRequest[]).map((q) => ({ ...q, status: q.status ?? "new" })));
    }
  }, [sb]);

  useEffect(() => {
    load();
  }, [load]);

  const update = useCallback(
    async (id: string, patch: { status?: ConsultStatus; assigned_to?: string }) => {
      if (!sb) return;
      const { error } = await sb.rpc("update_consulting_question", {
        p_id: id,
        p_status: patch.status ?? null,
        p_assigned_to: patch.assigned_to ?? null,
      });
      if (error) setErr(error.message);
      else load();
    },
    [sb, load],
  );

  const counts = useMemo(() => {
    const c = { new: 0, assigned: 0, answered: 0 };
    for (const q of items ?? []) c[q.status] += 1;
    return c;
  }, [items]);

  return { items, err, counts, update };
}

export function ConsultingRequestsBand({
  items,
  err,
  counts,
  update,
}: ReturnType<typeof useConsultingRequests>) {
  const [filter, setFilter] = useState<"all" | ConsultStatus>("all");
  const [assigning, setAssigning] = useState<string | null>(null);
  const [who, setWho] = useState("");

  if (err) return <p className="text-[13px] text-vermillion">{err}</p>;
  if (!items) return <p className="text-[13px] text-muted">Loading…</p>;

  const shown = items.filter((q) => filter === "all" || q.status === filter);
  const filters: [typeof filter, string][] = [
    ["all", `All · ${items.length}`],
    ["new", `New · ${counts.new}`],
    ["assigned", `With a facilitator · ${counts.assigned}`],
    ["answered", `Answered · ${counts.answered}`],
  ];

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Filter requests" className="flex flex-wrap gap-2">
        {filters.map(([k, label]) => (
          <button
            key={k}
            type="button"
            aria-pressed={filter === k}
            onClick={() => setFilter(k)}
            className={`rounded-full px-3.5 py-2 text-[13px] font-semibold ${
              filter === k ? "border border-ink bg-ink text-paper" : "border border-rule-2 bg-plate text-ink-2 hover:border-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="text-[14px] text-ink-2">{items.length === 0 ? "Nobody has asked yet." : "Nothing here."}</p>
      ) : (
        <ul className="space-y-2.5">
          {shown.map((q) => (
            <li key={q.id} className="rounded-2xl border border-rule bg-plate px-4 py-4 shadow-sm sm:px-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="text-[15.5px] font-bold">{q.org.name}</span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-paper-deep px-2 py-0.5 font-mono text-[10.5px] text-ink">
                      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: DOT[q.status] }} />
                      {LABEL[q.status]}
                    </span>
                    {q.assigned_to && <span className="font-mono text-[11px] text-ink-2">· {q.assigned_to}</span>}
                  </div>
                  <p className="text-[16px] leading-snug">&ldquo;{q.prompt}&rdquo;</p>
                  <p className="font-mono text-[11.5px] text-ink-2">
                    {q.context?.summary ?? "No view recorded (asked before 0033)"} ·{" "}
                    {new Date(q.created_at).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    {q.requested_by ? ` · ${q.requested_by}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {q.requested_by && (
                    <a
                      href={`mailto:${q.requested_by}?subject=${encodeURIComponent("Re: your question to the Collab")}&body=${encodeURIComponent(`You asked: “${q.prompt}”\n\n`)}`}
                      className="rounded-lg border border-ink bg-ink px-3.5 py-2.5 text-[13px] font-semibold text-paper no-underline"
                    >
                      Reply
                    </a>
                  )}
                  {q.status !== "answered" && (
                    <button
                      type="button"
                      onClick={() => {
                        setAssigning(assigning === q.id ? null : q.id);
                        setWho(q.assigned_to ?? "");
                      }}
                      className="rounded-lg border border-rule-2 bg-plate px-3.5 py-2.5 text-[13px] font-semibold text-ink hover:border-ink"
                    >
                      {q.assigned_to ? "Reassign" : "Assign facilitator"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => update(q.id, { status: q.status === "answered" ? "assigned" : "answered" })}
                    className="rounded-lg border border-rule-2 bg-plate px-3.5 py-2.5 text-[13px] font-semibold text-ink hover:border-ink"
                  >
                    {q.status === "answered" ? "Reopen" : "Mark answered"}
                  </button>
                </div>
              </div>
              {assigning === q.id && (
                <form
                  className="mt-3 flex flex-wrap items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (who.trim()) update(q.id, { assigned_to: who.trim() });
                    setAssigning(null);
                  }}
                >
                  <label className="sr-only" htmlFor={`who-${q.id}`}>Facilitator</label>
                  <input
                    id={`who-${q.id}`}
                    value={who}
                    onChange={(e) => setWho(e.target.value)}
                    placeholder="Facilitator's name"
                    className="min-w-[220px] flex-1 rounded-lg border border-rule-2 px-3 py-2 text-[14px]"
                  />
                  <button type="submit" className="rounded-lg bg-ink px-3.5 py-2 text-[13px] font-semibold text-paper">Assign</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
