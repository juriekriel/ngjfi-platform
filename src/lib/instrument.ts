import instrumentV0 from "@/data/instrument.v0.json";

export type Locale = "en" | "es";

export interface LocalizedText {
  en: string;
  es?: string;
}

export interface InstrumentOption {
  value: string | number;
  text: LocalizedText;
}

export interface InstrumentItem {
  key: string;
  question_domain: "follow" | "mission" | "world" | "screener" | "journey" | "demographic";
  tier: "exposure" | "response" | "formation" | "multiplication" | "na";
  type: "likert_5" | "yes_no" | "frequency" | "single_select" | "multi_select" | "screener";
  scored: boolean;
  reverse_scored?: boolean;
  scale?: { points?: number };
  order?: number;
  core_activity?: boolean;
  text: LocalizedText;
  options?: InstrumentOption[];
}

export interface Instrument {
  version: string;
  scoringVersion: string;
  locales: Locale[];
  items: InstrumentItem[];
}

export const instrument = instrumentV0 as unknown as Instrument;

/** Localized string with English fallback. */
export function t(text: LocalizedText, locale: Locale = "en"): string {
  return (locale === "es" && text.es) || text.en;
}

/** Items in display order. */
export function orderedItems(inst: Instrument = instrument): InstrumentItem[] {
  return [...inst.items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
