"use client";

/**
 * Choosing a survey version — just two choices, "J12" and "Full survey"
 * (instrument item_sets, migration 0044), with "What each survey measures"
 * one tap away for anyone who wants to know what they are deciding.
 *
 * One picker for every place a version is chosen: a new or edited survey
 * link (LinkForm) and the organisation's own survey link (Edit your
 * dashboard → Survey version). Labels, minutes and question counts come from
 * the instrument config, never from here.
 */
import { useState } from "react";
import { ITEM_SETS } from "@/lib/instrument";

export default function SurveyVersionPicker({
  value,
  onChange,
  disabled = false,
  id = "survey-version",
}: {
  value: string;
  onChange: (name: string) => void;
  disabled?: boolean;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-labelledby={`${id}-label`} className="grid grid-cols-2 gap-1 rounded-xl bg-rule/70 p-1">
        {ITEM_SETS.map((s) => (
          <button
            key={s.name}
            type="button"
            role="radio"
            aria-checked={value === s.name}
            disabled={disabled}
            onClick={() => onChange(s.name)}
            className={`rounded-lg px-3 py-2 text-[14px] font-semibold disabled:cursor-default ${
              value === s.name ? "bg-plate text-ink shadow-sm" : "text-ink-2 hover:text-ink"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-measures`}
        onClick={() => setOpen((o) => !o)}
        className="self-start text-[13px] font-semibold text-violet-deeper underline decoration-violet/40 underline-offset-2"
      >
        {open ? "Hide what each survey measures" : "What each survey measures"}
      </button>
      {open && <WhatEachMeasures id={`${id}-measures`} />}
    </div>
  );
}

/** Side by side: what each version asks, how long it takes, and what it adds to the dashboard. */
export function WhatEachMeasures({ id }: { id?: string }) {
  const j12 = ITEM_SETS.find((s) => s.name === "j12");
  const full = ITEM_SETS.find((s) => s.name === "full");
  const cols = [
    j12 && {
      s: j12,
      best: "Best when time is short — a youth night, a camp session, a first try.",
      asks: [
        "Where they are with faith (the screener), so each person gets the right path",
        "The J12: Follow, Mission and World, each at four depths — Exposure, Response, Formation, Multiplication",
        "Four about-you questions: age group, gender (optional), country, city (optional)",
      ],
      shows: "Your J12 index, the J12 and Unengaged matrices, and the heat map.",
    },
    full && {
      s: full,
      best: "Best when you want to know why, not just where — and to track prayer and scripture.",
      asks: [
        "Everything in the J12",
        "How often they pray and read scripture each week",
        "Optional extras: what helps or holds their faith back (Drivers), and what shaped it (Journey)",
      ],
      shows: "Everything the J12 shows, plus grouped answers to the Drivers and Journey questions beside your score (under Export your results). Prayer and scripture are recorded too — never folded into the score.",
    },
  ].filter(Boolean) as { s: (typeof ITEM_SETS)[number]; best: string; asks: string[]; shows: string }[];

  return (
    <div id={id} className="grid gap-2.5 sm:grid-cols-2">
      {cols.map(({ s, best, asks, shows }) => (
        <section key={s.name} className="flex flex-col gap-2 rounded-xl border border-rule bg-paper-deep px-3.5 py-3 text-[13px] leading-relaxed text-ink-2">
          <p className="flex items-baseline justify-between gap-2">
            <b className="text-[14.5px] text-ink">{s.label}</b>
            <span className="font-mono text-[10.5px] uppercase tracking-wider">about {s.minutes} min · up to {s.count} questions</span>
          </p>
          <p>{best}</p>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-ink">It asks</p>
            <ul className="mt-0.5 list-disc pl-4">
              {asks.map((a) => <li key={a}>{a}</li>)}
            </ul>
          </div>
          <p><b className="text-ink">On your dashboard:</b> {shows}</p>
        </section>
      ))}
      <p className="text-[12.5px] leading-relaxed text-ink-2 sm:col-span-2">
        Both ask the J12 questions in exactly the same way, so your score is comparable whichever you choose — and
        each person only sees the questions their answers lead to. Answers stay tied to the version they were given under.
      </p>
    </div>
  );
}
