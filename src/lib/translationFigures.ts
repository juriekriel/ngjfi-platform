/**
 * The Translations tile's headline counts — computed from config at import
 * time (no language files loaded), so the console's tile row stays light.
 */
import worldJson from "@/data/languages.world.json";
import { REGISTRY } from "@/lib/i18n";
import { stageOf, worldRows, type WorldLanguage } from "@/lib/translations";

const world = worldRows((worldJson as { languages: WorldLanguage[] }).languages, REGISTRY);

export const LANGUAGE_FIGURES = {
  live: REGISTRY.filter((l) => stageOf(l.status) === "live").length,
  translating: REGISTRY.filter((l) => stageOf(l.status) === "translating").length,
  prospective: REGISTRY.filter((l) => stageOf(l.status) === "prospective").length,
  aspirational: world.filter((w) => w.stage === "aspirational").length,
  onSite: REGISTRY.length,
};
