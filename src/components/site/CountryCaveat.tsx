/**
 * The country caveat (Oct 2026): every view that shows results by country
 * (or region) carries this footnote, so no colour or figure can be read as a
 * statement about a nation. Non-negotiable #1: we only ever describe "those
 * who have completed the Index", never a whole population.
 *
 * The wording lives here once, like DataLabel. WorldHeatMap renders it under
 * every country map, so the Collab view, the org dashboard, view-only share
 * links, the print export, the tour and the demo all carry it without each
 * page remembering to. tests/countryCaveat.test.ts checks it stays that way.
 */

export type CaveatLevel = "country" | "region";

/** The caveat as one plain sentence pair, for places that can't take markup (titles, exports). */
export function countryCaveatWords(level: CaveatLevel = "country"): string {
  return (
    `Not a measure of any ${level}. ` +
    `${level === "country" ? "Country" : "Region"} results describe only the young people there who have completed the Index through a participating ministry. ` +
    `They are not a representative sample, and they do not speak for the ${level} or its young people as a whole.`
  );
}

/** The asterisk that points at the caveat. Hidden from screen readers; the caveat itself is read in full. */
export function CaveatMark() {
  return (
    <sup aria-hidden className="ml-0.5 text-[0.75em] font-semibold text-emerald-deeper">
      *
    </sup>
  );
}

/** The footnote itself. */
export function CountryCaveat({ level = "country", className = "" }: { level?: CaveatLevel; className?: string }) {
  const [lead, ...rest] = countryCaveatWords(level).split(". ");
  return (
    <p role="note" className={`max-w-measure text-[12.5px] leading-relaxed text-ink-2 ${className}`}>
      <span aria-hidden className="font-semibold text-emerald-deeper">* </span>
      <b className="font-semibold text-ink">{lead}.</b> {rest.join(". ")}
    </p>
  );
}
