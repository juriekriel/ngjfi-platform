"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import { Action, LinkRow, Row, Rows, Trouble } from "./Bands";
import { TOTAL_COUNT, WELCOME_MINUTES } from "@/lib/instrument";
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
  // One instrument, no shorter versions (migration 0040).
  const itemSet = "full" as const;
  const [audiences, setAudiences] = useState<Set<string>>(new Set(["community"]));
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

  function toggleAudience(a: string) {
    const next = new Set(audiences);
    if (next.has(a)) next.delete(a);
    else next.add(a);
    // Never let it reach zero — a survey nobody can take is not a survey.
    if (next.size) setAudiences(next);
  }

  async function publish() {
    if (!sb || !org) return;
    setBusy(true);
    setErr(null);
    let last: Record<string, { url: string; label: string; note: string }> | null = null;

    // One call per audience. Two links are two campaigns off one instrument —
    // which is exactly what makes the comparison between them legitimate.
    for (const audience of audiences) {
      const { data, error } = await sb.rpc("campaign_upsert", {
        p_org_short_name: org,
        p_audience: audience,
        p_item_set: itemSet,
        p_locale: locale,
      });
      if (error) {
        setErr(error.message);
        setBusy(false);
        return;
      }
      last = (data as { links: typeof last })?.links ?? last;
    }
    setLinks(last);
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
            comparable with everyone else&apos;s. Every survey asks the whole instrument — there are no
            shorter versions — and each respondent only sees the questions their answers lead to.
          </p>
          <div className="mt-5 rounded-xl border-2 border-ink bg-paper-deep p-4">
            <p className="figcap">{TOTAL_COUNT} items in the bank · about {WELCOME_MINUTES} minutes for most people</p>
            <p className="mt-1 text-[17px]">The full instrument</p>
            <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">
              The whole three-by-four grid, the Exploration Index for those not yet following, and the
              optional Drivers, Journey and Belong–Trust questions.
            </p>
          </div>
          <p className="margin-note mt-4 border-l-2 border-rule pl-3">
            Every organisation asks the same instrument, so every result sits in the same
            benchmark — no cell is ever empty because a shorter version was chosen.
          </p>
        </div>
      )}

      {/* ── 02 · who we ask ───────────────────────────────────────────── */}
      {step === 2 && (
        <div className="mt-5">
          <p className="max-w-measure text-[15.5px] leading-relaxed text-ink-2">
            Two links off one survey. The gap between them — what is true of the young people you
            already reach, against the ones you do not — is the most useful number the Index will
            give you.
          </p>
          <Rows>
            {[
              {
                k: "community",
                t: "Your community",
                b: "Camps, services, small groups — the young people already in your world.",
              },
              {
                k: "public",
                t: "Beyond your community",
                b: "Social media and the wider city. Uninfluenced by your ministry, which is the point.",
              },
            ].map((a) => (
              <Row
                key={a.k}
                tone={audiences.has(a.k) ? "good" : "plain"}
                label={
                  <>
                    {a.t}
                    <span className="margin-note mt-0.5 block">{a.b}</span>
                  </>
                }
              >
                <button
                  onClick={() => toggleAudience(a.k)}
                  className={`rounded-md border px-2.5 py-1 text-[13px] font-semibold ${
                    audiences.has(a.k)
                      ? "border-emerald bg-emerald text-plate"
                      : "border-rule-2 text-ink-2 hover:border-ink hover:text-ink"
                  }`}
                >
                  {audiences.has(a.k) ? "Included" : "Add"}
                </button>
              </Row>
            ))}
          </Rows>
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
              meta={`the full instrument · ${TOTAL_COUNT} items`}
            />
            <Row label="Audiences" meta={[...audiences].join(" + ")} />
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
            It is live. Anyone with these links can answer right now.
          </p>
          {links && (
            <ul className="mt-4 border-t border-ink">
              {audiences.has("community") && links.community && (
                <LinkRow {...links.community} />
              )}
              {audiences.has("public") && links.public && <LinkRow {...links.public} />}
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
