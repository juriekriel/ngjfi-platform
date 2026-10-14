"use client";

/**
 * The first-visit walkthrough of an organisation's dashboard (migration 0056).
 *
 * Shows once per person per organisation — the first time a member opens the
 * dashboard after activating it — and can be replayed any time from the
 * "Walkthrough" button or a ?tour=1 link (the Collab's step-1 email uses one).
 *
 * It points at the real dashboard, not a picture of it: each step highlights
 * an element marked with data-tour="…" (RoomCards, SignedInFrame,
 * ConsultDrawer). A step whose element isn't on the page — say the
 * organisation switched that panel off — simply shows without a highlight,
 * so the tour can never break the dashboard or depend on a panel existing.
 *
 * Whether it has been seen is kept in org_members.tour_state
 * (my_dashboard_tour / mark_dashboard_tour). Before 0056 is applied it falls
 * back to this browser's localStorage, so a preview deploy still works.
 *
 * Accessible: a labelled dialog that takes focus, ←/→ to move, Esc to close,
 * and no motion when the visitor prefers reduced motion.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

type Step = {
  target?: string;
  kicker: string;
  title: string;
  body: React.ReactNode;
};

const ACTIVE_ATTR = "data-tour-active";

function storageKey(slug: string) {
  return `jfindx:tour:${slug}`;
}
function readLocal(slug: string): string | null {
  try {
    return window.localStorage.getItem(storageKey(slug));
  } catch {
    return null;
  }
}
function writeLocal(slug: string, v: string) {
  try {
    window.localStorage.setItem(storageKey(slug), v);
  } catch {
    /* private mode — the server copy is the real one anyway */
  }
}

export function useDashboardTour(sb: SupabaseClient | null, orgSlug: string, enabled: boolean) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [server, setServer] = useState(true);

  useEffect(() => {
    if (!enabled || !sb) return;
    const params = new URLSearchParams(window.location.search);
    const asked = params.get("tour") === "1";
    if (asked) {
      params.delete("tour");
      const q = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}${window.location.hash}`);
    }
    let live = true;
    sb.rpc("my_dashboard_tour", { p_org_slug: orgSlug }).then(({ data, error }) => {
      if (!live) return;
      if (error) {
        // 0056 not applied yet: remember in this browser instead.
        setServer(false);
        setOpen(asked || !readLocal(orgSlug));
        return;
      }
      const d = data as { show?: boolean; role?: string } | null;
      setRole(d?.role ?? null);
      setOpen(asked || Boolean(d?.show));
    });
    return () => {
      live = false;
    };
  }, [sb, orgSlug, enabled]);

  const close = useCallback(
    (state: "done" | "skipped") => {
      setOpen(false);
      writeLocal(orgSlug, state);
      if (sb && server) sb.rpc("mark_dashboard_tour", { p_org_slug: orgSlug, p_state: state }).then(() => undefined, () => undefined);
    },
    [sb, orgSlug, server],
  );

  return { open, role, start: () => setOpen(true), close };
}

export default function DashboardTour({
  orgName,
  role,
  floor,
  countryGate,
  onClose,
  onBeforeStart,
}: {
  orgName: string;
  /** 'org_admin' | 'coordinator' | null (unknown — treated as a coordinator, the narrower wording). */
  role: string | null;
  /** The minimum responses before a score shows (min_group_n). */
  floor: number;
  countryGate: number;
  onClose: (state: "done" | "skipped") => void;
  /** Put the dashboard on its results view so every highlighted element exists. */
  onBeforeStart?: () => void;
}) {
  const isAdmin = role === "org_admin";
  const steps: Step[] = useMemo(
    () => [
      {
        kicker: "Welcome",
        title: `This is ${orgName}'s dashboard`,
        body: (
          <>
            <p>
              Two minutes, eight stops, and you&apos;ll know your way around. Skip any time — the <b>Walkthrough</b> button brings it back.
            </p>
            <p>
              One promise first: you&apos;ll only ever see results added together. Nobody — not you, not us — can see one young person&apos;s answers.
            </p>
          </>
        ),
      },
      {
        target: "rooms",
        kicker: "The house and its rooms",
        title: "Every link is a room",
        body: (
          <>
            <p>
              <b>The house</b> is every response from every {orgName} link. Each survey link you make — a camp, a youth night, a small group — is its own{" "}
              <b>room</b>, and every room adds up into the house.
            </p>
            <p>Click a card to see the dashboard for just that room. Click the house to come back.</p>
          </>
        ),
      },
      {
        target: "new-survey",
        kicker: "Sending a survey",
        title: "Start a new survey",
        body: (
          <>
            <p>
              This makes a new link with its own QR code. Tick <b>Test</b> to try it yourself first — test answers never count anywhere and are deleted
              after a week.
            </p>
            <p>About seven minutes on a phone, works on a weak signal, and nobody needs an account.</p>
          </>
        ),
      },
      {
        target: "figures",
        kicker: "The three numbers",
        title: "Every score comes with its n",
        body: (
          <>
            <p>
              <b>J12 index</b> — your overall score on a 1–5 scale. <b>Completed the Index</b> — how many people it rests on.{" "}
              <b>Countries active</b> — a country lights up on the shared map once {countryGate.toLocaleString()} people there have taken part.
            </p>
            <p>Every number here is about those who completed the Index — never your whole community.</p>
          </>
        ),
      },
      {
        target: "matrix",
        kicker: "The J12 matrix",
        title: "Three questions, four tiers",
        body: (
          <>
            <p>
              Rows are the three questions — <b>Follow</b>, <b>Mission</b>, <b>World</b>. Columns are how deep it has gone —{" "}
              <b>Exposure → Response → Formation → Multiplication</b>. Read it left to right as a journey: where it&apos;s strong, and where it narrows.
            </p>
            <p>
              A score appears once {floor.toLocaleString()} people have completed it, so no number can point back to one person.
            </p>
          </>
        ),
      },
      {
        target: "views",
        kicker: "Other views",
        title: "Matrix, unengaged, heat map",
        body: (
          <p>
            Switch views here. The <b>Unengaged matrix</b> shows those not yet following, scored on their own. The <b>Heat map</b> outlines where your links
            reached around the world.
          </p>
        ),
      },
      {
        target: "overlay",
        kicker: "Compare",
        title: "Overlay the Collab",
        body: (
          <p>
            Lay the pooled picture from every ministry in the NextGen Global Collab over your own, cell by cell. Comparison is for the whole house only — a
            single room is never compared.
          </p>
        ),
      },
      {
        target: "consult",
        kicker: "From score to strategy",
        title: "What does this mean?",
        body: (
          <p>
            Stuck on what a number means, or what to do about it? Ask here. Your question goes to the Collab team, who&apos;ll help you turn the score into
            your next move.
          </p>
        ),
      },
      isAdmin
        ? {
            target: "settings",
            kicker: "You're the Org Administrator",
            title: "Settings, consent and your team",
            body: (
              <>
                <p>
                  <b>Edit your dashboard</b> holds your brand, which panels show, and <b>consent</b> — a link won&apos;t accept answers until you&apos;ve
                  confirmed it, for {orgName} and for each survey you send.
                </p>
                <p>
                  <b>Your team &amp; access</b> lets you add Coordinators by email and make view-only links for your leaders.
                </p>
              </>
            ),
          }
        : {
            target: "team",
            kicker: "Your team",
            title: "Who runs what",
            body: (
              <p>
                As a Coordinator you can make survey links, read results and export them. Settings, consent and the team belong to your Org Administrator —{" "}
                <b>Your team &amp; access</b> shows who that is.
              </p>
            ),
          },
      {
        kicker: "You're set",
        title: "Your next three steps",
        body: (
          <ol className="list-decimal space-y-1 pl-5">
            {isAdmin ? (
              <li>
                Confirm consent under <b>Edit your dashboard</b> —{" "}
                <a href="/resources/consent" target="_blank" rel="noreferrer">
                  read the consent guide
                </a>
                .
              </li>
            ) : (
              <li>Check with your Org Administrator that consent is confirmed.</li>
            )}
            <li>
              Make a <b>test</b> survey and try it on your phone.
            </li>
            <li>Make a real link for your next gathering, and share it.</li>
          </ol>
        ),
      },
    ],
    [orgName, isAdmin, floor, countryGate],
  );

  const [i, setI] = useState(0);
  const card = useRef<HTMLDivElement>(null);
  const [hasTarget, setHasTarget] = useState(false);
  const step = steps[i];
  const last = i === steps.length - 1;

  useEffect(() => {
    onBeforeStart?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Highlight this step's element, if it is on the page.
  useEffect(() => {
    document.querySelectorAll(`[${ACTIVE_ATTR}]`).forEach((el) => el.removeAttribute(ACTIVE_ATTR));
    const el = step.target ? (document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement | null) : null;
    const visible = Boolean(el && el.getClientRects().length);
    setHasTarget(visible);
    if (el && visible) {
      el.setAttribute(ACTIVE_ATTR, "");
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    }
    card.current?.focus();
    return () => {
      el?.removeAttribute(ACTIVE_ATTR);
    };
  }, [step]);

  useEffect(
    () => () => {
      document.querySelectorAll(`[${ACTIVE_ATTR}]`).forEach((el) => el.removeAttribute(ACTIVE_ATTR));
    },
    [],
  );

  const finish = useCallback(() => onClose("done"), [onClose]);
  const skip = useCallback(() => onClose("skipped"), [onClose]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") skip();
      else if (e.key === "ArrowRight") setI((n) => Math.min(n + 1, steps.length - 1));
      else if (e.key === "ArrowLeft") setI((n) => Math.max(n - 1, 0));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [skip, steps.length]);

  function makeTestSurvey() {
    finish();
    // Opens RoomCards' own "Start a new survey" form — the real one.
    requestAnimationFrame(() => (document.querySelector('[data-tour="new-survey"]') as HTMLButtonElement | null)?.click());
  }

  return (
    <>
      {/* With a highlighted element, its own box-shadow dims the page around it
          (globals.css, [data-tour-active]). Without one, this scrim does. */}
      {!hasTarget && <div aria-hidden className="fixed inset-0 z-[60] bg-ink/45" onClick={skip} />}
      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        tabIndex={-1}
        className={`fixed inset-x-3 bottom-3 z-[62] mx-auto max-w-md rounded-2xl border border-rule bg-plate p-5 text-ink shadow-xl outline-none sm:inset-x-auto sm:right-6 sm:bottom-6 ${
          hasTarget ? "" : "sm:right-1/2 sm:bottom-1/2 sm:translate-x-1/2 sm:translate-y-1/2"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="figcap">
            {step.kicker} · {i + 1} of {steps.length}
          </p>
          <button type="button" onClick={skip} className="text-[13px] font-semibold text-ink-2 hover:text-ink">
            {last ? "Close" : "Skip tour"}
          </button>
        </div>
        <h2 id="tour-title" className="mt-1.5 text-[19px] font-bold leading-snug">
          {step.title}
        </h2>
        <div id="tour-body" className="mt-2 space-y-2 text-[14.5px] leading-relaxed text-ink-2 [&_a]:font-semibold [&_a]:text-emerald-deeper [&_b]:text-ink">
          {step.body}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex gap-1" aria-hidden>
            {steps.map((_, n) => (
              <span key={n} className={`h-1.5 rounded-full ${n === i ? "w-5 bg-emerald" : "w-1.5 bg-rule-2"}`} />
            ))}
          </div>
          <div className="flex gap-2">
            {i > 0 && (
              <button
                type="button"
                onClick={() => setI(i - 1)}
                className="rounded-lg border border-rule-2 px-3.5 py-2 text-[14px] font-semibold text-ink hover:border-ink"
              >
                Back
              </button>
            )}
            {last ? (
              <button type="button" onClick={makeTestSurvey} className="rounded-lg bg-emerald px-3.5 py-2 text-[14px] font-semibold text-plate hover:bg-emerald-deep">
                Make a test survey →
              </button>
            ) : (
              <button type="button" onClick={() => setI(i + 1)} className="rounded-lg bg-emerald px-3.5 py-2 text-[14px] font-semibold text-plate hover:bg-emerald-deep">
                {i === 0 ? "Show me around" : "Next"}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
