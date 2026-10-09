"use client";

/**
 * Edge-consent confirmation (migration 0042).
 *
 * Consent is gathered by the organisation, at the edge, and never held by the
 * Index (non-negotiable #2). What the Index DOES hold is the organisation's
 * word that it has done so: a timestamp, the person, and the version of the
 * statement below. Until that exists, a real organisation's links politely
 * refuse answers (test links still work).
 *
 * One component, used in Survey settings and in the survey wizard, so the two
 * can never show different wording. The authority check lives in
 * attest_edge_consent(), not here.
 */
import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { CONSENT_STATEMENT, CONSENT_STATEMENT_VERSION } from "@/lib/consent";
import { WhyConsentBlock } from "@/content/consent/ConsentResource";
import { WHY_CONSENT_VERSION } from "@/content/consent/why-consent";

export type ConsentStatus = {
  attested: boolean;
  attested_at: string | null;
  statement_version: string | null;
  current_version: string | null;
  current: boolean;
  required: boolean;
  can_attest: boolean;
};

export function useConsentStatus(sb: SupabaseClient | null, orgSlug: string | null) {
  const [status, setStatus] = useState<ConsentStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!sb || !orgSlug) return;
    const { data, error } = await sb.rpc("org_consent_status", { p_org_slug: orgSlug });
    if (error) setError(/org_consent_status/.test(error.message) ? "Consent confirmation needs migration 0042, which isn't applied to this database yet." : error.message);
    else {
      setError(null);
      setStatus(data as ConsentStatus);
    }
  }, [sb, orgSlug]);
  useEffect(() => {
    load();
  }, [load]);
  return { status, error, reload: load, setStatus };
}

export default function ConsentAttestation({
  sb,
  orgSlug,
  onChange,
}: {
  sb: SupabaseClient | null;
  orgSlug: string;
  /** Called with the fresh status after a successful confirmation. */
  onChange?: (s: ConsentStatus) => void;
}) {
  const { status, error, setStatus } = useConsentStatus(sb, orgSlug);
  const [ticked, setTicked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function confirm() {
    if (!sb) return;
    setBusy(true);
    setErr(null);
    const { data, error } = await sb.rpc("attest_edge_consent", {
      p_org_slug: orgSlug,
      p_statement_version: CONSENT_STATEMENT_VERSION,
    });
    setBusy(false);
    if (error) return setErr(error.message);
    setStatus(data as ConsentStatus);
    onChange?.(data as ConsentStatus);
  }

  if (error) return <p className="text-[13.5px] text-vermillion">{error}</p>;
  if (!status) return <p className="text-[13.5px] text-ink-2">Checking consent…</p>;

  if (!status.required)
    return <p className="text-[13.5px] leading-relaxed text-ink-2">This is a sample organisation, so there are no respondents to gather consent from.</p>;

  if (status.attested && status.current)
    return (
      <p className="flex items-start gap-2 text-[14px] leading-relaxed">
        <span aria-hidden className="mt-1.5 h-2.5 w-2.5 flex-none rounded-full" style={{ background: "rgb(var(--c-green))" }} />
        <span>
          Confirmed on {new Date(status.attested_at as string).toLocaleDateString()}. Keep your consent records with you — the
          Index never asks for them. Each survey you send is confirmed on its own card, before its link and QR code appear.
        </span>
      </p>
    );

  return (
    <div className="flex flex-col gap-3">
      <WhyConsentBlock compact />
      <p className="text-[13px] text-ink-2">
        <Link href="/resources/consent" className="font-semibold text-ink underline underline-offset-2">Read the full consent resource</Link>{" "}
        — the parent letter, a script to read, and the rules country by country.
      </p>
      <p className="text-[13.5px] leading-relaxed text-ink-2">
        {status.attested
          ? "The consent statement has been updated since your organisation last confirmed it. Your links keep working; please read and confirm the current version."
          : "Your links will accept answers once an organisation admin confirms the following — and then confirms each survey you send. Test links work in the meantime."}
      </p>
      <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[13.5px] leading-relaxed text-ink">
        {CONSENT_STATEMENT.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {status.can_attest ? (
        <>
          <label className="flex items-start gap-2.5 text-[14px] font-semibold leading-snug">
            <input
              type="checkbox"
              checked={ticked}
              onChange={(e) => setTicked(e.target.checked)}
              className="mt-0.5 h-4 w-4 flex-none accent-[rgb(var(--c-emerald))]"
            />
            I&apos;ve read “Why consent?”, and on behalf of my organisation I confirm all of the above.
          </label>
          <button
            type="button"
            onClick={confirm}
            disabled={!ticked || busy}
            className="self-start rounded-lg bg-ink px-4 py-2.5 text-[14px] font-semibold text-paper disabled:opacity-40"
          >
            {busy ? "Confirming…" : "Confirm consent"}
          </button>
          {err && <p className="text-[13px] text-vermillion">{err}</p>}
          <p className="text-[12px] text-muted">
            Statement version {CONSENT_STATEMENT_VERSION} · Why consent? {WHY_CONSENT_VERSION}. Your name and the time are recorded.
          </p>
        </>
      ) : (
        <p className="rounded-lg bg-paper-deep px-3 py-2 text-[13.5px] text-ink-2">
          An organisation admin on your team needs to confirm this.
        </p>
      )}
    </div>
  );
}
