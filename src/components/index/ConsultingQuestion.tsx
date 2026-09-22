"use client";

/**
 * "What do we do with this?" — the org dashboard's consulting-question
 * button (CLAUDE.md build brief, production-readiness round). Submits free
 * text to consulting_questions via submit_consulting_question() (migration
 * 0030), which records the prompt, the asking org, and the date — nothing
 * else. The Collab/admin-facing repository view (list_consulting_questions())
 * belongs in the admin console, not here.
 */
import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

export default function ConsultingQuestion({ sb, orgSlug }: { sb: SupabaseClient; orgSlug: string }) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  async function submit() {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setStatus("sending");
    setErrMsg(null);
    const { error } = await sb.rpc("submit_consulting_question", {
      p_org_slug: orgSlug,
      p_prompt: trimmed,
    });
    if (error) {
      setStatus("error");
      setErrMsg(error.message);
      return;
    }
    setStatus("sent");
    setPrompt("");
  }

  if (!open) {
    return (
      <div className="mt-4 border-t border-rule pt-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg border border-ink px-4 py-2 text-[13.5px] font-semibold text-ink hover:bg-ink hover:text-paper"
        >
          What do we do with this? →
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-rule bg-paper p-4">
      <p className="font-mono text-[9px] uppercase tracking-wider text-muted">
        Ask the Collab &mdash; &quot;what do we do with this?&quot;
      </p>
      <p className="mt-1.5 max-w-lg text-[13px] leading-relaxed text-slate">
        Send a question about what you&apos;re seeing here straight to the Collab&apos;s consulting
        repository, along with your organisation&apos;s name and today&apos;s date. Aggregates only —
        this doesn&apos;t carry any individual response with it.
      </p>

      {status === "sent" ? (
        <p className="mt-3 text-sm font-semibold text-emerald">Sent. The Collab will follow up.</p>
      ) : (
        <>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            maxLength={4000}
            placeholder="e.g. Multiplication is our weakest tier three seasons running — what should we actually change?"
            className="mt-3 w-full rounded-lg border border-rule px-3 py-2 text-sm"
          />
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={submit}
              disabled={status === "sending" || !prompt.trim()}
              className="rounded-lg bg-ink px-4 py-2 text-[13.5px] font-semibold text-paper disabled:opacity-50"
            >
              {status === "sending" ? "Sending…" : "Send to the Collab"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[13px] font-semibold text-slate"
            >
              Cancel
            </button>
          </div>
          {status === "error" && errMsg && <p className="mt-2 text-[13px] text-accent">{errMsg}</p>}
        </>
      )}
    </div>
  );
}
