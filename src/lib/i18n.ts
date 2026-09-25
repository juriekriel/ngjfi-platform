/**
 * The survey's languages, bound to the registry (src/data/locales.json) and
 * the per-language files (src/data/i18n/<code>.json). Logic in i18nCore.ts.
 *
 * English is bundled; every other language is its own small chunk, fetched
 * only when chosen (a cheap phone never downloads nineteen languages), and
 * kept by the service worker once fetched, so it works offline after that.
 *
 * Text resolution, for a question or a screen string, walks the language's
 * fallback chain — e.g. es-419 → es → en — taking the first language that
 * has the text: the language file's own translation first, then the
 * instrument's built-in text for that language.
 */
import registryJson from "@/data/locales.json";
import enFile from "@/data/i18n/en.json";
import { useEffect, useState } from "react";
import { bestMatch, chain, fmt, offered, pick, type LocaleInfo } from "@/lib/i18nCore";
import type { InstrumentItem, InstrumentOption } from "@/lib/instrument";

export type LangFile = {
  ui: Record<string, string>;
  items: Record<string, { text?: string; help?: string; options?: Record<string, string> }>;
};

export const REGISTRY = (registryJson as { locales: LocaleInfo[] }).locales;
export const localeInfo = (code: string) => REGISTRY.find((l) => l.code === code);

// One explicit loader per language, so the bundler splits each into its own chunk.
const LOADERS: Record<string, () => Promise<LangFile>> = {
  es: () => import("@/data/i18n/es.json").then((m) => m.default as LangFile),
  "es-419": () => import("@/data/i18n/es-419.json").then((m) => m.default as LangFile),
  "es-ES": () => import("@/data/i18n/es-ES.json").then((m) => m.default as LangFile),
  pt: () => import("@/data/i18n/pt.json").then((m) => m.default as LangFile),
  fr: () => import("@/data/i18n/fr.json").then((m) => m.default as LangFile),
  de: () => import("@/data/i18n/de.json").then((m) => m.default as LangFile),
  it: () => import("@/data/i18n/it.json").then((m) => m.default as LangFile),
  ru: () => import("@/data/i18n/ru.json").then((m) => m.default as LangFile),
  ar: () => import("@/data/i18n/ar.json").then((m) => m.default as LangFile),
  "ar-EG": () => import("@/data/i18n/ar-EG.json").then((m) => m.default as LangFile),
  "ar-LB": () => import("@/data/i18n/ar-LB.json").then((m) => m.default as LangFile),
  "ar-AE": () => import("@/data/i18n/ar-AE.json").then((m) => m.default as LangFile),
  "ar-MA": () => import("@/data/i18n/ar-MA.json").then((m) => m.default as LangFile),
  "zh-Hans": () => import("@/data/i18n/zh-Hans.json").then((m) => m.default as LangFile),
  ja: () => import("@/data/i18n/ja.json").then((m) => m.default as LangFile),
  hi: () => import("@/data/i18n/hi.json").then((m) => m.default as LangFile),
  id: () => import("@/data/i18n/id.json").then((m) => m.default as LangFile),
  th: () => import("@/data/i18n/th.json").then((m) => m.default as LangFile),
  sw: () => import("@/data/i18n/sw.json").then((m) => m.default as LangFile),
  zu: () => import("@/data/i18n/zu.json").then((m) => m.default as LangFile),
  af: () => import("@/data/i18n/af.json").then((m) => m.default as LangFile),
};

/** A loaded language: its direction, and text lookups that walk its fallback chain. */
export type Lang = {
  code: string;
  dir: "ltr" | "rtl";
  ui: (key: string, vars?: Record<string, string | number>) => string;
  item: (item: InstrumentItem, field?: "text" | "help") => string;
  option: (item: InstrumentItem, option: InstrumentOption) => string;
};

function build(code: string, files: Record<string, LangFile>): Lang {
  const order = chain(code, REGISTRY);
  const uiMap = (key: string) => Object.fromEntries(order.map((c) => [c, files[c]?.ui?.[key]]));
  return {
    code,
    dir: localeInfo(code)?.dir ?? "ltr",
    ui: (key, vars) => fmt(pick(uiMap(key), order) || key, vars),
    item: (item, field = "text") => {
      const src = (field === "help" ? item.help : item.text) as unknown as Record<string, string> | undefined;
      for (const c of order) {
        const own = files[c]?.items?.[item.key]?.[field];
        if (own && own.trim()) return own;
        const builtIn = src?.[c];
        if (builtIn && builtIn.trim()) return builtIn;
      }
      return "";
    },
    option: (item, option) => {
      for (const c of order) {
        const own = files[c]?.items?.[item.key]?.options?.[String(option.value)];
        if (own && own.trim()) return own;
        const builtIn = (option.text as unknown as Record<string, string>)[c];
        if (builtIn && builtIn.trim()) return builtIn;
      }
      return String(option.value);
    },
  };
}

/** English, synchronously — what renders before any other language loads. */
export const ENGLISH: Lang = build("en", { en: enFile as LangFile });

/** Load a language and everything it falls back to. Unknown codes give English. */
export async function loadLang(code: string): Promise<Lang> {
  if (!localeInfo(code) || code === "en") return ENGLISH;
  const files: Record<string, LangFile> = { en: enFile as LangFile };
  for (const c of chain(code, REGISTRY)) {
    if (c !== "en" && LOADERS[c]) files[c] = await LOADERS[c]();
  }
  return build(code, files);
}

/** Split "You're invited to share [where you're at]." into plain / highlighted / plain. */
export function highlightParts(s: string): [string, string, string] {
  const m = s.match(/^(.*?)\[(.*?)\](.*)$/s);
  return m ? [m[1], m[2], m[3]] : [s, "", ""];
}

/**
 * The phone's language among LIVE languages, for screens shown before the
 * survey's own picker (e.g. "this link has closed"). English until loaded.
 */
export function usePhoneLang(): Lang {
  const [lang, setLang] = useState<Lang>(ENGLISH);
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem("jfindx-lang"); } catch { /* ignore */ }
    const avail = offered(REGISTRY, false).map((l) => l.code);
    const code = saved && avail.includes(saved) ? saved : bestMatch(navigator.languages ?? [navigator.language], avail);
    if (code !== "en") loadLang(code).then(setLang);
  }, []);
  return lang;
}
