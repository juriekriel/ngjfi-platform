"use client";

/**
 * "What does this mean?" — the consulting prompt, on both dashboard tabs.
 *
 * Sends the question plus a description of the aggregate view on screen
 * (src/lib/consult.ts) to submit_consulting_question() (migration 0033). It
 * lands in Consulting Requests, tile E on the Collab console. The database
 * whitelists the context again; nothing about any respondent travels with it.
 *
 * Replaces the older inline ConsultingQuestion box — same RPC, now with the
 * view snapshot, suggestions, and a drawer instead of a scroll-down panel.
 */
import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { consultContext, consultSuggestions, type ConsultView } from "@/lib/consult";

export function ConsultButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-emerald/45 bg-emerald/10 px-4 py-2.5 text-[14px] font-semibold text-emerald-deeper hover:bg-emerald/15"
    >
      What does this mean?
    </button>
  );
}

export default function ConsultDrawer({
  sb,
  orgSlug,
  view,
  email,
  onClose,
}: {
  sb: SupabaseClient;
  orgSlug: string;
  view: ConsultView;
  email: string | null;
  onClose: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const ctx = consultContext(view);
  const suggestions = consultSuggestions(view);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function send() {
    const q = question.trim();
    if (!q) return;
    setStatus("sending");
    setErr(null);
    const { error } = await sb.rpc("submit_consulting_question", {
      p_org_slug: orgSlug,
      p_prompt: q,
      p_context: ctx,
    });
    if (error) {
      setStatus("error");
      setErr(error.message);
    } else setStatus("sent");
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/40" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="consult-title"
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-[460px] flex-col gap-5 overflow-y-auto bg-plate px-6 py-7 shadow-xl sm:px-8"
        style={{ paddingTop: "max(1.75rem, env(safe-area-inset-top))" }}
      >
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-emerald-deeper">Consulting</span>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-rule-2 text-ink hover:border-ink"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>

        {status === "sent" ? (
          <div className="flex flex-col gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green/15">
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="rgb(var(--c-map-exposure))" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 11.5l4.5 4.5L18 6" />
              </svg>
            </div>
            <h2 id="consult-title" className="text-[26px] font-bold leading-tight tracking-tight">Request sent</h2>
            <p className="text-[14.5px] leading-relaxed text-ink-2">
              It is now in <b className="text-ink">Consulting Requests</b> on the Collab console.
              {email ? <> A facilitator replies to {email}.</> : " A facilitator will reply by email."}
            </p>
            <div className="rounded-xl border border-rule bg-paper-deep px-4 py-3.5">
              <p className="text-[14.5px] font-semibold leading-snug">&ldquo;{question.trim()}&rdquo;</p>
              <p className="mt-1.5 font-mono text-[11.5px] text-ink-2">{ctx.summary}</p>
            </div>
            <button type="button" onClick={onClose} className="self-start rounded-lg bg-ink px-4 py-3 text-[14px] font-semibold text-paper">
              Back to the dashboard
            </button>
          </div>
        ) : (
          <>
            <h2 id="consult-title" className="text-[26px] font-bold leading-tight tracking-tight">What does this mean?</h2>
            <p className="text-[14.5px] leading-relaxed text-ink-2">
              Ask the Collab. A facilitator reads the same view you are looking at and comes back to
              you with what it means and what to try next.
            </p>
            <div className="rounded-xl border border-rule bg-paper-deep px-4 py-3.5">
              <p className="font-mono text-[10.5px] uppercase tracking-wider text-ink-2">You are looking at</p>
              <p className="mt-1 text-[14.5px] font-semibold leading-snug">{ctx.summary}</p>
            </div>
            <div className="flex flex-col gap-2">
              <p className="font-mono text-[10.5px] uppercase tracking-wider text-ink-2">Start from one of these</p>
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setQuestion(s)}
                  className="rounded-lg border border-rule-2 bg-plate px-3.5 py-2.5 text-left text-[14px] text-ink hover:border-ink"
                >
                  {s}
                </button>
              ))}
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10.5px] uppercase tracking-wider text-ink-2">Your question</span>
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                rows={4}
                maxLength={4000}
                placeholder="What are you trying to understand?"
                className="resize-none rounded-lg border border-rule-2 px-3.5 py-3 text-[15px] leading-snug"
              />
            </label>
            <p className="border-l-2 border-rule pl-3 text-[13px] leading-relaxed text-ink-2">
              What is sent: your question, your organisation&apos;s name, your sign-in email and the
              view above. No respondent&apos;s answers go with it — there are none to send.
            </p>
            {status === "error" && err && <p className="text-[13px] text-vermillion">{err}</p>}
            <div className="mt-auto flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={send}
                disabled={!question.trim() || status === "sending"}
                className="rounded-lg bg-gradient-to-r from-emerald via-emerald-deep to-emerald-deeper px-5 py-3 text-[14px] font-semibold text-plate disabled:cursor-not-allowed disabled:opacity-50"
              >
                {status === "sending" ? "Sending…" : "Send to the Collab →"}
              </button>
              <button type="button" onClick={onClose} className="rounded-lg border border-rule-2 px-5 py-3 text-[14px] font-semibold text-ink">
                Cancel
              </button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
