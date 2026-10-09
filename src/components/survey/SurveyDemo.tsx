"use client";

/**
 * The respondent survey, clickable, held in memory — never written anywhere.
 * Extracted from the tour so the front page ("Try it yourself") and /tour
 * show the same thing: the real QuestionCard, the real ACTIVE instrument
 * (v5 today) with its branching, the real welcome and thank-you states.
 * It never creates a database client (tests/frontPage.test.ts).
 */
import { useMemo, useState } from "react";
import { ENGLISH } from "@/lib/i18n";
import { Question } from "@/components/survey/QuestionCard";
import {
  nextVisibleIndex,
  fieldedItems,
  endsSurvey,
  WELCOME_MINUTES,
  prevVisibleIndex,
  visibleItems,
  type AnswerValue,
} from "@/lib/instrument";
import { SAMPLE_ORG } from "@/lib/sample";

/**
 * A device frame. Used by the tour and the front page. The actual respondent survey at /[org] never
 * wraps itself in a phone mockup — on a real phone that would be a phone
 * inside a phone — this exists purely so a visitor browsing on a laptop
 * immediately reads "this is what shows up on someone's phone" rather than
 * mistaking it for an ordinary card on the page.
 */
export function PhoneFrame({ children, large = false }: { children: React.ReactNode; large?: boolean }) {
  if (large)
    // A modern phone's proportions (about 9 : 19.5): tall, rounded corners, a
    // camera island, side buttons and a home bar — the screen scrolls inside.
    return (
      <div className="relative mx-auto aspect-[9/19.5] w-full max-w-[340px]">
        <span aria-hidden className="absolute -left-[3px] top-[18%] h-10 w-[3px] rounded-l bg-ink" />
        <span aria-hidden className="absolute -left-[3px] top-[27%] h-14 w-[3px] rounded-l bg-ink" />
        <span aria-hidden className="absolute -right-[3px] top-[24%] h-20 w-[3px] rounded-r bg-ink" />
        <div className="flex h-full flex-col rounded-[3rem] border-[11px] border-ink bg-ink shadow-2xl">
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[2.2rem] bg-plate">
            <div aria-hidden className="absolute left-1/2 top-2 z-10 h-[22px] w-[30%] -translate-x-1/2 rounded-full bg-ink" />
            <div className="h-9 shrink-0 bg-[var(--phone-top,transparent)]" />
            {children}
            <div aria-hidden className="flex shrink-0 justify-center bg-plate pb-2 pt-1">
              <div className="h-1 w-[34%] rounded-full bg-ink/80" />
            </div>
          </div>
        </div>
      </div>
    );
  return (
    <div className="mx-auto w-full max-w-[320px] rounded-[2.25rem] border-[10px] border-ink bg-ink shadow-xl">
      <div className="flex justify-center py-1.5">
        <div className="h-1.5 w-16 rounded-full bg-ink-2" />
      </div>
      <div className="overflow-hidden rounded-[1.5rem] bg-plate">{children}</div>
    </div>
  );
}


/**
 * A working click-through of the real respondent survey — same welcome
 * screen, progress bar, card chrome and thank-you state as `Survey.tsx`
 * (the component /[org] actually mounts), just held in memory instead of
 * writing anywhere. Living here, next to the branching demonstration,
 * because trying the flow means the most once you have just read why it
 * stops asking certain questions.
 */
export default function SurveyDemo({ caption = true, large = false }: { caption?: boolean; large?: boolean } = {}) {
  const items = useMemo(() => fieldedItems(), []);
  const steps = items.length;
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [i, setI] = useState(-1); // -1 = welcome, matching Survey.tsx exactly
  const [ended, setEnded] = useState(false); // an ineligible answer, matching Survey.tsx

  const path = useMemo(() => visibleItems(answers), [answers]);
  const answeredCount = path.filter((it) => answers[it.key] !== undefined).length;
  const pathLength = Math.max(path.length, 1);
  const pct = i < 0 ? 0 : i >= steps ? 100 : Math.round((answeredCount / pathLength) * 100);
  const stepNumber = path.findIndex((it) => it.key === items[i]?.key) + 1;
  const hasEarlier = i > 0 && prevVisibleIndex(i, answers) !== -1;

  function choose(v: AnswerValue) {
    if (endsSurvey(items[i], v)) {
      setAnswers({});
      setEnded(true);
      setI(steps);
      return;
    }
    const nextAnswers = { ...answers, [items[i].key]: v };
    setAnswers(nextAnswers);
    const next = nextVisibleIndex(i, nextAnswers);
    setI(next === -1 ? steps : next);
  }
  function back() {
    const prev = prevVisibleIndex(i, answers);
    if (prev !== -1) setI(prev);
  }
  function reset() {
    setAnswers({});
    setEnded(false);
    setI(-1);
  }

  return (
    <div className={`mx-auto w-full ${large ? "max-w-[340px]" : "max-w-[320px]"}`} style={large ? ({ "--phone-top": SAMPLE_ORG.brand } as React.CSSProperties) : undefined}>
      <PhoneFrame large={large}>
        <div className={`${large ? "shrink-0 pt-1" : ""} px-6 py-5 text-white`} style={{ background: SAMPLE_ORG.brand }}>
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-lg font-black"
              style={{ color: SAMPLE_ORG.brand }}
            >
              {SAMPLE_ORG.name.charAt(0)}
            </div>
            <div>
              <div className="font-semibold leading-tight">{SAMPLE_ORG.name}</div>
              <div className="text-xs opacity-90">{SAMPLE_ORG.country}</div>
            </div>
          </div>
          <div className="mt-4 h-1.5 overflow-hidden rounded bg-white/30">
            <div className="h-full bg-white transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className={`${large ? "min-h-0 flex-1" : "max-h-[420px]"} overflow-y-auto bg-plate p-6`}>
          {i < 0 && (
            <div>
              <h1 className="text-xl font-bold leading-tight text-ink">
                You&apos;re invited to share{" "}
                <span style={{ color: SAMPLE_ORG.brand }}>where you&apos;re at</span>.
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-ink-2">
                {ENGLISH.ui("welcome_body", { org: SAMPLE_ORG.name, minutes: WELCOME_MINUTES })}
              </p>
              <button
                onClick={() => setI(0)}
                className="mt-6 rounded-lg px-6 py-3 font-semibold text-white"
                style={{ background: SAMPLE_ORG.brand }}
              >
                Begin →
              </button>
            </div>
          )}

          {i >= 0 && i < steps && (
            <Question
              item={items[i]}
              lang={ENGLISH}
              brand={SAMPLE_ORG.brand}
              busy={false}
              selected={answers[items[i].key]}
              onChoose={choose}
              onBack={hasEarlier ? back : undefined}
              stepLabel={`Question ${stepNumber} of ${pathLength}`}
              moveFocus={false}
            />
          )}

          {i >= steps && ended && (
            <div className="py-6 text-center">
              <h2 className="text-xl font-bold text-ink">{ENGLISH.ui("ended_title")}</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm text-ink-2">{ENGLISH.ui("ended_body")}</p>
              <button
                type="button"
                onClick={reset}
                className="mt-5 rounded-lg border border-ink px-4 py-2 text-[14px] font-semibold text-ink"
              >
                Walk it again
              </button>
            </div>
          )}

          {i >= steps && !ended && (
            <div className="py-6 text-center">
              <div
                className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full text-3xl text-white"
                style={{ background: SAMPLE_ORG.brand }}
              >
                ✓
              </div>
              <h2 className="text-xl font-bold text-ink">Thank you!</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm text-ink-2">
                Their answer joins {SAMPLE_ORG.name}&apos;s picture of how their community is
                following Jesus. Nobody — not even their own youth leader — will ever see this
                individual response.
              </p>
              <button
                type="button"
                onClick={reset}
                className="mt-5 rounded-lg border border-ink px-4 py-2 text-[14px] font-semibold text-ink"
              >
                Walk it again
              </button>
            </div>
          )}
        </div>
        <p className="shrink-0 border-t border-rule px-5 py-3 text-center font-mono text-[9px] uppercase tracking-widest text-muted">
          Powered by the Next Gen Jesus-Following Index
        </p>
      </PhoneFrame>
      {caption && (
        <p className="figcap mt-3 text-center leading-relaxed">
          Demo — nothing you tap is saved · the questions young people see today
        </p>
      )}
    </div>
  );
}

