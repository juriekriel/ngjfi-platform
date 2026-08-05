"use client";

import { useState } from "react";
import { t, type AnswerValue, type InstrumentItem, type Locale } from "@/lib/instrument";

const LIKERT = ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"];

/**
 * The respondent question renderer — ONE implementation, used everywhere.
 *
 * The live white-labelled survey at /[org] and the guided walkthrough at /tour
 * both mount this component. That is deliberate and load-bearing: the tour is
 * not a mock-up of the survey, it IS the survey, so a change to how a Likert
 * item is presented reaches the sales walkthrough on the same deploy. There is
 * no second, prettier version of this screen kept for demos.
 */
export function Question({
  item,
  locale,
  brand,
  busy,
  selected,
  onChoose,
  onBack,
  stepLabel,
}: {
  item: InstrumentItem;
  locale: Locale;
  brand: string;
  busy: boolean;
  selected: AnswerValue;
  onChoose: (v: AnswerValue) => void;
  onBack?: () => void;
  stepLabel: string;
}) {
  const optBtn = "w-full rounded-xl border-2 px-4 py-3 text-left text-sm transition";
  const isSel = (v: AnswerValue) => selected === v;
  const style = (v: AnswerValue) =>
    isSel(v) ? { borderColor: brand, background: `${brand}1a` } : { borderColor: "#e6e8ec" };

  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-widest" style={{ color: brand }}>
        {stepLabel}
      </div>
      <h2 className="mb-2 mt-2 text-xl font-medium leading-snug">{t(item.text, locale)}</h2>
      {item.help && (
        <p className="mb-4 text-xs leading-relaxed text-muted">{t(item.help, locale)}</p>
      )}
      {!item.help && <div className="mb-3" />}

      {item.type === "likert_5" && (
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              disabled={busy}
              onClick={() => onChoose(n)}
              className="flex-1 rounded-xl border-2 py-3 text-center"
              style={style(n)}
            >
              <span className="block text-lg font-bold">{n}</span>
              <span className="mt-1 block text-[8px] uppercase leading-tight text-muted">
                {LIKERT[n - 1]}
              </span>
            </button>
          ))}
        </div>
      )}

      {item.type === "yes_no" && (
        <div className="flex flex-col gap-2">
          {["yes", "no"].map((v) => (
            <button key={v} disabled={busy} onClick={() => onChoose(v)} className={optBtn} style={style(v)}>
              {v === "yes" ? "Yes" : "No"}
            </button>
          ))}
        </div>
      )}

      {(item.type === "single_select" || item.type === "frequency") && (
        <div className="flex flex-col gap-2">
          {(item.options || []).map((o) => (
            <button
              key={String(o.value)}
              disabled={busy}
              onClick={() => onChoose(o.value)}
              className={optBtn}
              style={style(o.value)}
            >
              {t(o.text, locale)}
            </button>
          ))}
        </div>
      )}

      {item.type === "open_text" && (
        <OpenText
          key={item.key}
          brand={brand}
          busy={busy}
          maxLength={item.max_length ?? 300}
          initial={typeof selected === "string" ? selected : ""}
          onSubmit={onChoose}
        />
      )}

      {onBack && (
        <button onClick={onBack} className="mt-5 text-xs text-muted hover:text-ink">
          ← Back
        </button>
      )}
    </div>
  );
}

/**
 * Free-text answer. Deliberately capped and skippable: this is the one place
 * a respondent could type something identifying into a database designed to
 * hold none, so the prompt warns them and the length is bounded.
 */
function OpenText({
  brand,
  busy,
  maxLength,
  initial,
  onSubmit,
}: {
  brand: string;
  busy: boolean;
  maxLength: number;
  initial: string;
  onSubmit: (v: AnswerValue) => void;
}) {
  const [text, setText] = useState(initial);
  const left = maxLength - text.length;

  return (
    <div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, maxLength))}
        rows={4}
        placeholder="Type as much or as little as you like…"
        className="w-full rounded-xl border-2 px-4 py-3 text-sm outline-none"
        style={{ borderColor: text ? brand : "#e6e8ec" }}
      />
      <div className="mt-1 text-right font-mono text-[10px] text-muted">
        {left} characters left
      </div>
      <div className="mt-3 flex gap-2">
        <button
          disabled={busy || !text.trim()}
          onClick={() => onSubmit(text.trim())}
          className="flex-1 rounded-xl px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
          style={{ background: brand }}
        >
          Continue →
        </button>
        <button
          disabled={busy}
          onClick={() => onSubmit("")}
          className="rounded-xl border-2 px-4 py-3 text-sm text-muted"
          style={{ borderColor: "#e6e8ec" }}
        >
          Skip
        </button>
      </div>
    </div>
  );
}

