"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import { Action, LinkRow, Row, Rows, Trouble } from "./Bands";
import { ITEM_SETS, TOTAL_COUNT } from "@/lib/instrument";
import { REGISTRY } from "@/lib/i18n";
import ConsentAttestation, { useConsentStatus } from "./ConsentAttestation";

/** Only languages researchers have approved can be fielded (locales.json). */
const LIVE_LOCALES = REGISTRY.filter((l) => l.status === "live");
const COMING_LOCALES = REGISTRY.filter((l) => l.status !== "live");

/**
 * Setting up a survey — one wizard, every tier.
 *
 * Step 00 asks WHO is fielding, and the answer always resolves to exactly one
 * organisation. That is the load-bearing rule of the whole design: a response
 * with no owning organisation cannot be counted once, compared, or deleted on
 * request. An organisation skips the step because the answer is itself; a
 * network, the Collab and an administrator must choose, and the database logs
 * the choice when it is not their own house.
 *
 * The tier check is NOT here. `campaign_upsert()` re-derives authority from
 * `field_authority()` inside the function body, so a bug in this component can
 * make the UI wrong but cannot make the database wrong.
 */

type Fieldable = {
  short_name: string;
  name: string;
  is_demo: boolean;
  authority: string;
};

const AUTHORITY_GLOSS: Record<string, string> = {
  own_organisation: "your organisation",
  network_delegated: "granted survey management",
  administrator: "administrator — this will be logged",
  collab: "Collab — this will be logged",
};

export default function SurveyWizard({
  fixedOrg,
  onDone,
  onCancel,
}: {
  /** Set at the organisation tier, where step 00 has only one possible answer. */
  fixedOrg?: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const sb = useMemo(() => getSupabaseBrowser(), []);
  const [step, setStep] = useState(fixedOrg ? 1 : 0);
  const [orgs, setOrgs] = useState<Fieldable[] | null>(null);
  const [org, setOrg] = useState<string | null>(fixedOrg ?? null);
  // Which version of the survey (instrument item_sets, migration 0044).
  const [itemSet, setItemSet] = useState<string>("full");
  const [locale, setLocale] = useState("en");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [links, setLinks] = useState<Record<string, { url: string; label: string; note: string }> | null>(null);
  const consent = useConsentStatus(sb, org);
  const consentDone = !consent.status || !consent.status.required || consent.status.attested;

  useEffect(() => {
    if (fixedOrg || !sb) return;
    sb.rpc("fieldable_orgs").then(({ data, error }) => {
      if (error) setErr(error.message);
      else setOrgs((data as Fieldable[]) ?? []);
    });
  }, [sb, fixedOrg]);

  async function publish() {
    if (!sb || !org) return;
    setBusy(true);
    setErr(null);
    // One survey link per organisation (migration 0044).
    const { data, error } = await sb.rpc("campaign_upsert", {
      p_org_short_name: org,
      p_item_set: itemSet,
      p_locale: locale,
    });
    if (error) {
      setErr(error.message);
      setBusy(false);
      return;
    }
    setLinks((data as { links: Record<string, { url: string; label: string; note: string }> | null })?.links ?? null);
    setBusy(false);
    setStep(5);
  }

  const chosen = orgs?.find((o) => o.short_name === org);

  return (
    <div className="rounded-2xl border-2 border-ink bg-plate p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule pb-3">
        <h3 className="text-[21px] leading-tight">Set up a survey</h3>
        <p className="figcap">
          Step {String(step).padStart(2, "0")} of 05
          {org && <span className="ml-2 normal-case tracking-normal">· {org}</span>}
        </p>
      </div>

      {err && (
        <div className="mt-4">
          <Trouble message={err} />
        </div>
      )}

      {/* ── 00 · who is fielding this ─────────────────────────────────── */}
      {step === 0 && (
        <div className="mt-5">
          <p className="max-w-measure text-[15.5px] leading-relaxed text-ink-2">
            Every survey is owned by exactly one organisation, so its responses can be counted
            once and removed on request. Which house is this one for?
          </p>
          {orgs === null && <p className="mt-4 text-[15px] text-muted">Loading…</p>}
          {orgs?.length === 0 && (
            <p className="mt-4 max-w-measure text-[15px] leading-relaxed text-ink-2">
              There is no organisation you may field for yet. A network can field for a member
              only once that member has granted it, and that consent defaults to off.
            </p>
          )}
          {orgs && orgs.length > 0 && (
            <Rows>
              {orgs.map((o) => (
                <Row
                  key={o.short_name}
                  label={
                    <>
                      {o.name}
                      {o.is_demo && <span className="margin-note ml-2">sandbox</span>}
                    </>
                  }
                  meta={AUTHORITY_GLOSS[o.authority] ?? o.authority}
                >
                  <button
                    onClick={() => {
                      setOrg(o.short_name);
                      setStep(1);
                    }}
                    className="rounded-md border border-ink px-2.5 py-1 text-[13px] font-semibold text-ink hover:bg-ink hover:text-paper"
                  >
                    Choose
                  </button>
                </Row>
              ))}
            </Rows>
          )}
        </div>
      )}

      {/* ── 01 · what we ask ──────────────────────────────────────────── */}
      {step === 1 && (
        <div className="mt-5">
          <p className="max-w-measure text-[15.5px] leading-relaxed text-ink-2">
            The instrument version is fixed to the current published one, so your results stay
            comparable with everyone else&apos;s. Choose how much of it to ask — each respondent only sees
            the questions their answers lead to.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {ITEM_SETS.map((o) => (
              <button
                key={o.name}
                type="button"
                aria-pressed={itemSet === o.name}
                onClick={() => setItemSet(o.name)}
                className={`rounded-xl border-2 p-4 text-left ${itemSet === o.name ? "border-ink bg-paper-deep" : "border-rule-2 bg-plate hover:border-ink"}`}
              >
                <p className="figcap">{o.count} items · about {o.minutes} minutes for most people</p>
                <p className="mt-1 text-[17px]">{o.label}</p>
                <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">{o.description}</p>
              </button>
            ))}
          </div>
          <p className="margin-note mt-4 border-l-2 border-rule pl-3">
            Every version asks the twelve-cell grid the same way, so every result sits in the same
            benchmark — no cell is ever empty because a shorter version was chosen.
          </p>
        </div>
      )}

      {/* ── 02 · who we ask ───────────────────────────────────────────── */}
      {step === 2 && (
        <div className="mt-5">
          <p className="max-w-measure text-[15.5px] leading-relaxed text-ink-2">
            One link for everyone you invite — camps, services, groups, social media. Make named
            links later from the dashboard if you want to see where answers came from.
          </p>
          <div className="mt-5">
            <p className="figcap">Language</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {LIVE_LOCALES.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  aria-pressed={locale === l.code}
                  onClick={() => setLocale(l.code)}
                  className={`rounded-md border px-3 py-1.5 text-[13px] font-semibold ${
                    locale === l.code ? "border-ink bg-ink text-paper" : "border-rule-2 text-ink-2"
                  }`}
                >
                  {l.native}
                </button>
              ))}
            </div>
            {COMING_LOCALES.length > 0 && (
              <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
                Being translated: {COMING_LOCALES.map((l) => l.native).join(" · ")}. A language can be fielded once
                researchers have approved its translation.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── 03 · consent ──────────────────────────────────────────────── */}
      {step === 3 && (
        <div className="mt-5">
          <p className="max-w-measure text-[15.5px] leading-relaxed text-ink-2">
            Consent is handled by you, at the edge, because you are the one who knows these
            families. Here is everything the Index stores about a respondent:
          </p>
          <Rows>
            <Row label="Their answers" meta="bound to the instrument version" tone="good" />
            <Row label="An age band" meta="never a birthdate" tone="good" />
            <Row label="A country, and optionally a city" meta="coarse, never precise" tone="good" />
            <Row label="A name, email or phone number" meta="never asked" />
            <Row label="An IP address" meta="never stored with answers (our hosts see it briefly, as every website's do)" />
            <Row label="An under-13" meta="the survey ends at the age question and keeps nothing" />
          </Rows>
          <p className="margin-note mt-4 border-l-2 border-emerald pl-3">
            Nothing on that list can identify a young person, which is what makes it safe to run
            with 13-to-17s. Parental consent, where your context requires it, is yours to gather
            before you hand out the link — we deliberately never hold it centrally.
          </p>
          <div className="mt-5 rounded-xl border border-rule bg-paper-deep p-4">
            {org && <ConsentAttestation sb={sb} orgSlug={org} onChange={() => consent.reload()} />}
          </div>
        </div>
      )}

      {/* ── 04 · confirm ──────────────────────────────────────────────── */}
      {step === 4 && (
        <div className="mt-5">
          <p className="max-w-measure text-[15.5px] leading-relaxed text-ink-2">
            One last look before this becomes a live link.
          </p>
          <Rows>
            <Row label="Fielding for" meta={chosen?.name ?? org ?? ""} />
            <Row
              label="Questions"
              meta={`${ITEM_SETS.find((o) => o.name === itemSet)?.label ?? itemSet} · ${ITEM_SETS.find((o) => o.name === itemSet)?.count ?? TOTAL_COUNT} items`}
            />
            <Row label="Link" meta="one survey link" />
            <Row label="Language" meta={REGISTRY.find((l) => l.code === locale)?.native ?? locale} />
            <Row
              label="Consent"
              meta={consentDone ? "confirmed" : "not yet confirmed — the links will refuse answers until an organisation admin confirms"}
            />
          </Rows>
          {chosen && chosen.authority !== "own_organisation" && (
            <p className="margin-note mt-4 border-l-2 border-vermillion pl-3">
              You are setting this up on behalf of another organisation. That is allowed and it is
              recorded — your name, the organisation and the time go into the action log.
            </p>
          )}
        </div>
      )}

      {/* ── 05 · published ────────────────────────────────────────────── */}
      {step === 5 && (
        <div className="mt-5">
          <p className="max-w-measure text-[16px] leading-relaxed">
            It is live. Anyone with this link can answer right now.
          </p>
          {links && (
            <ul className="mt-4 border-t border-ink">
              {links.community && <LinkRow {...links.community} />}
            </ul>
          )}
          <p className="margin-note mt-4 border-l-2 border-emerald pl-3">
            Your own results appear the moment the first person finishes. A benchmark for your
            country appears once enough people there have completed the Index — until then the
            dashboard says so, rather than showing you a number it cannot stand behind.
          </p>
        </div>
      )}

      {/* ── the rail ──────────────────────────────────────────────────── */}
      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-rule pt-4">
        {step === 5 ? (
          <Action primary onClick={onDone}>
            Done →
          </Action>
        ) : (
          <>
            {step > (fixedOrg ? 1 : 0) && (
              <Action onClick={() => setStep(step - 1)}>← Back</Action>
            )}
            {step >= 1 && step < 4 && (
              <Action primary onClick={() => setStep(step + 1)}>
                Continue →
              </Action>
            )}
            {step === 4 && (
              <Action primary disabled={busy} onClick={publish}>
                {busy ? "Publishing…" : "Publish the survey →"}
              </Action>
            )}
            <button
              onClick={onCancel}
              className="text-[13px] font-semibold text-muted hover:text-ink"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
