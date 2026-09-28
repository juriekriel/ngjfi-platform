import { instrument, t, type Instrument, type InstrumentItem } from "@/lib/instrument";
import en from "@/data/i18n/en.json";

/**
 * The answer choices an insight item reports on, as {value, label}. Likert
 * items carry no options in the instrument (the scale labels are screen
 * strings), so they are filled from the English UI copy.
 */
export function optionsFor(i: InstrumentItem): { value: string; label: string }[] {
  if (i.options?.length) return i.options.map((o) => ({ value: String(o.value), label: t(o.text, "en") }));
  if (i.type === "likert_5") {
    const ui = (en as { ui: Record<string, string> }).ui;
    return [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: ui[`likert_${n}`] ?? String(n) }));
  }
  return [];
}

/**
 * Insight modules — short, unscored blocks inside the Index (section "module").
 * Everything here is derived from the instrument; the only thing a new module
 * needs in code is a human label for its group headings, and even that falls
 * back to the raw tag.
 */
export const MODULE_LABEL: Record<string, string> = {
  belong_trust: "Belong & trust",
};
export const MODULE_GROUP_LABEL: Record<string, string> = {
  belong: "Belong",
  trust: "Trust",
  context: "Context — for the planting comparison",
};

export type ModuleItem = {
  key: string;
  group: string;
  label: string;
  multi: boolean;
  options: { value: string; label: string }[];
};
export type ModuleSpec = { id: string; label: string; draft: boolean; items: ModuleItem[] };

export function modulesOf(inst: Instrument = instrument): ModuleSpec[] {
  const by = new Map<string, ModuleSpec>();
  for (const i of [...inst.items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    if (i.section !== "module" || !i.module) continue;
    const m = by.get(i.module) ?? { id: i.module, label: MODULE_LABEL[i.module] ?? i.module, draft: false, items: [] };
    m.draft = m.draft || !!i.draft;
    m.items.push({
      key: i.key,
      group: i.question_domain,
      label: t(i.text, "en"),
      multi: i.type === "multi_select",
      options: optionsFor(i),
    });
    by.set(i.module, m);
  }
  return [...by.values()];
}

export const MODULES = modulesOf();
