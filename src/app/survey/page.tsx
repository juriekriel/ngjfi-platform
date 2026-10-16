import Link from "next/link";
import { Footer, GradientRule, Masthead } from "@/components/site/Chrome";
import {
  ITEM_SETS,
  WELCOME_MINUTES,
  fieldedItems,
  instrument,
  t,
  type InstrumentItem,
  type ShowIf,
} from "@/lib/instrument";
import { inOrder } from "@/lib/branching";
import { optionsFor } from "@/lib/modules";
import { DOMAIN_SHORT, TIER_LABEL } from "@/lib/model";
import en from "@/data/i18n/en.json";

export const metadata = {
  title: "The entire survey — The Jesus Index",
  description: "Every question young people are asked today, word for word, in the order they meet them.",
};

/**
 * /survey — the whole instrument, read-only (Oct 2026: "Want to see the entire
 * survey? Click here." under the phone demo).
 *
 * Everything on this page is derived from the ACTIVE instrument JSON — the
 * same fielded items, order, wording and show_if rules the respondent survey
 * runs. Nothing is typed in here, so the page cannot drift from what young
 * people actually see when researchers change the instrument.
 *
 * Grouping: items are walked in order and grouped by their show_if rule.
 * Items with no rule are asked of everyone — split into "before" and "after"
 * the first conditional item, so the page reads in the order a respondent
 * meets it. Items that share a rule are one path; each respondent walks
 * exactly one path, so merging a path's items keeps their real order.
 * No database, no respondent data.
 */

const UI = (en as { ui: Record<string, string> }).ui;

/** Section headings — UI copy only; an unknown section falls back to its tag. */
const SECTION_HEADING: Record<string, string> = {
  demographic: "About them",
  screener: "Where they're at",
  index: "The Index questions",
  driver: "What shapes their faith",
  journey: "Their journey so far",
  exploration: "Exploring",
  module: "Insight module",
};

/** Path titles by the branch tag the instrument puts on its items. */
const BRANCH_TITLE: Record<string, string> = {
  engaged: "If they follow Jesus",
  unengaged: "If they don't follow Jesus yet",
};

type Group = { id: string; title: string; rule?: ShowIf; items: InstrumentItem[] };

const signature = (r?: ShowIf) => (r && (r.all?.length || r.any?.length) ? JSON.stringify(r) : "");

function buildGroups(items: InstrumentItem[]): Group[] {
  const groups = new Map<string, Group>();
  let seenConditional = false;
  for (const it of items) {
    const sig = signature(it.show_if);
    if (sig) seenConditional = true;
    const key = sig || (seenConditional ? "everyone-after" : "everyone-before");
    if (!groups.has(key)) groups.set(key, { id: "", title: "", rule: it.show_if, items: [] });
    groups.get(key)!.items.push(it);
  }
  let pathN = 0;
  return [...groups.entries()].map(([key, g]) => {
    if (key === "everyone-before") return { ...g, id: "start", title: "Everyone starts here" };
    if (key === "everyone-after") return { ...g, id: "finish", title: "Everyone finishes here" };
    pathN += 1;
    const branches = new Set(g.items.map((i) => i.branch).filter(Boolean));
    const branch = branches.size === 1 ? [...branches][0]! : null;
    const title = branch && BRANCH_TITLE[branch] ? BRANCH_TITLE[branch] : g.items.length === 1 ? "Only for some" : `Path ${pathN}`;
    return { ...g, id: `path-${pathN}`, title };
  });
}

/** A show_if rule, in plain words, from the questions and options it names. */
function describeRule(rule: ShowIf, all: InstrumentItem[]): string {
  const clause = (c: NonNullable<ShowIf["all"]>[number]) => {
    const q = all.find((i) => i.key === c.key);
    const name = q ? `“${t(q.text)}”` : c.key;
    const label = (v: unknown) => q?.options?.find((o) => String(o.value) === String(v))?.text.en ?? String(v);
    const list = (vs: unknown[]) => vs.map((v) => `“${label(v)}”`).join(" or ");
    if (c.in?.length) return `they answered ${name} with ${list(c.in)}`;
    if (c.not_in?.length) return `they didn't answer ${name} with ${list(c.not_in)}`;
    if (c.gte != null && c.lte != null) return `their answer to ${name} is between ${c.gte} and ${c.lte}`;
    if (c.gte != null) return `their answer to ${name} is at least ${c.gte}`;
    if (c.lte != null) return `their answer to ${name} is at most ${c.lte}`;
    return name;
  };
  const parts: string[] = [];
  if (rule.all?.length) parts.push(rule.all.map(clause).join(", and "));
  if (rule.any?.length) parts.push(rule.any.map(clause).join(" — or "));
  return `Asked only when ${parts.join(", and ")}.`;
}

function answerKind(i: InstrumentItem): string {
  if (i.attention_check) return "Attention check · five-point scale";
  switch (i.type) {
    case "likert_5":
      return "Five-point scale";
    case "multi_select":
      return i.max_select ? `Choose up to ${i.max_select}` : "Choose any";
    case "open_text":
      return "Typed answer";
    case "frequency":
      return "How often";
    default:
      return "Choose one";
  }
}

/** The section a heading should sit under: an attention check belongs to the run it interrupts. */
function sectionRuns(items: InstrumentItem[]): { section: string; items: InstrumentItem[] }[] {
  const runs: { section: string; items: InstrumentItem[] }[] = [];
  for (const it of items) {
    const s = it.attention_check && runs.length ? runs[runs.length - 1].section : it.section ?? it.question_domain;
    if (runs.length && runs[runs.length - 1].section === s) runs[runs.length - 1].items.push(it);
    else runs.push({ section: s, items: [it] });
  }
  return runs;
}

export default function SurveyPage() {
  const items = inOrder(fieldedItems());
  const groups = buildGroups(items);
  const likert = [1, 2, 3, 4, 5].map((n) => UI[`likert_${n}`] ?? String(n));

  return (
    <>
      <Masthead />

      <main className="mx-auto max-w-5xl px-5">
        {/* standfirst */}
        <section className="grid gap-8 py-10 md:grid-cols-[1.4fr_1fr] md:gap-12">
          <div>
            <p className="figcap">The entire survey</p>
            <h1 className="mt-3 text-[38px] font-bold leading-[1.02] tracking-tight sm:text-[46px]">
              Every question, word for word.
            </h1>
            <p className="mt-6 max-w-measure text-[18px] leading-relaxed text-ink-2">
              This is what your young people are asked today, in the order they meet it. Nobody answers every
              question: the early answers decide which path someone takes, so each person sees about{" "}
              {WELCOME_MINUTES} minutes of it.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/#try"
                className="rounded-lg border-2 border-emerald bg-emerald px-5 py-3 text-[14px] font-semibold text-plate no-underline hover:bg-emerald-deep"
              >
                Try it on the phone →
              </Link>
              <Link href="/join" className="rounded-lg border border-ink px-5 py-3 text-[14px] font-semibold text-ink no-underline hover:bg-ink hover:text-paper">
                Start your own →
              </Link>
            </div>
          </div>
          <aside className="self-end">
            <div className="rounded-2xl border border-rule bg-plate p-5 shadow-sm">
              <p className="figcap">Two versions to choose from</p>
              <ul className="mt-3 space-y-3">
                {ITEM_SETS.map((s) => (
                  <li key={s.name}>
                    <p className="text-[15px] font-semibold text-ink">
                      {s.label} <span className="tabular font-normal text-muted">· about {s.minutes} min</span>
                    </p>
                    {s.description && <p className="mt-0.5 text-[13.5px] leading-snug text-ink-2">{s.description}</p>}
                  </li>
                ))}
              </ul>
              <p className="mt-4 border-t border-rule pt-3 text-[12.5px] leading-snug text-muted">
                Instrument {instrument.version}. Answers are anonymous; nobody, including you, sees an individual&apos;s
                answers.
              </p>
            </div>
          </aside>
        </section>

        {/* jump links */}
        <nav aria-label="Parts of the survey" className="flex flex-wrap gap-2 pb-2">
          {groups.map((g) => (
            <a
              key={g.id}
              href={`#${g.id}`}
              className="rounded-lg border border-rule-2 px-3.5 py-2 text-[13.5px] font-semibold text-ink-2 no-underline hover:border-ink hover:text-ink"
            >
              {g.title} <span className="tabular font-normal text-muted">· {g.items.length}</span>
            </a>
          ))}
        </nav>

        {groups.map((g) => (
          <section key={g.id} id={g.id} aria-labelledby={`${g.id}-heading`} className="scroll-mt-6 py-10">
            <GradientRule className="mb-8" />
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 id={`${g.id}-heading`} className="text-[27px] font-bold leading-tight tracking-tight">
                {g.title}
              </h2>
              <span className="figcap">
                {g.items.length} question{g.items.length === 1 ? "" : "s"}
              </span>
            </div>
            {g.rule && signature(g.rule) && (
              <p className="mt-2 max-w-measure text-[14.5px] leading-relaxed text-ink-2">{describeRule(g.rule, items)}</p>
            )}

            {sectionRuns(g.items).map((run, ri) => (
              <div key={`${run.section}-${ri}`} className="mt-7">
                <p className="figcap">{SECTION_HEADING[run.section] ?? run.section}</p>
                {run.items.some((i) => i.type === "likert_5") && (
                  <p className="mt-1.5 text-[13px] leading-snug text-ink-2">
                    Five-point scale: {likert.map((l, i) => (i ? ` · ${l}` : l)).join("")}
                  </p>
                )}
                <ol className="mt-3 grid gap-2.5">
                  {run.items.map((it) => {
                    const n = g.items.indexOf(it) + 1;
                    const opts = it.type === "likert_5" ? [] : optionsFor(it);
                    const tags = [
                      it.section === "index" && DOMAIN_SHORT[it.question_domain],
                      it.section === "index" && it.tier !== "na" && TIER_LABEL[it.tier],
                      answerKind(it),
                    ].filter(Boolean) as string[];
                    return (
                      <li key={it.key} className="flex gap-4 rounded-xl border border-rule bg-plate px-4 py-3.5 shadow-sm sm:px-5">
                        <span className="tabular w-6 shrink-0 pt-0.5 text-right text-[13px] text-muted">{n}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[15.5px] font-semibold leading-snug text-ink">{t(it.text)}</p>
                          {it.help && <p className="mt-1 text-[13.5px] leading-snug text-ink-2">{t(it.help)}</p>}
                          {opts.length > 0 && (
                            <ul className="mt-2.5 flex flex-wrap gap-1.5">
                              {opts.map((o) => {
                                const ends = it.options?.find((x) => String(x.value) === o.value)?.ends_survey;
                                return (
                                  <li
                                    key={o.value}
                                    className="rounded-md border border-rule bg-paper-deep px-2 py-1 text-[12.5px] leading-snug text-ink-2"
                                  >
                                    {o.label}
                                    {ends && <span className="text-muted"> · ends the survey, nothing is kept</span>}
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                          <p className="mt-2 text-[12px] text-muted">{tags.join(" · ")}</p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </section>
        ))}

        <section className="py-10">
          <GradientRule className="mb-8" />
          <h2 className="text-[27px] font-bold leading-tight tracking-tight">Ready to hear from your young people?</h2>
          <p className="mt-3 max-w-measure text-[16px] leading-relaxed text-ink-2">
            Put your own logo and colour on it, share one link, and watch your dashboard fill in as answers arrive.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/join"
              className="rounded-lg border-2 border-emerald bg-emerald px-5 py-3 text-[14px] font-semibold text-plate no-underline hover:bg-emerald-deep"
            >
              Join the Jesus Index →
            </Link>
            <Link href="/see-a-demo" className="rounded-lg border border-ink px-5 py-3 text-[14px] font-semibold text-ink no-underline hover:bg-ink hover:text-paper">
              See a Demo →
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
