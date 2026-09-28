/**
 * Collab Insights — the shape collab_insights() returns (migration 0041), and
 * the pure functions that turn it into bands and export tables.
 *
 * No imports, so tests/collabInsights.test.ts loads it directly. Everything
 * here works on aggregates the database already gated: a suppressed cell
 * stays suppressed in every table built from it, and nothing here can
 * un-suppress it (there is no n to recover).
 */

export type RateBands = { exceptional: number; healthy: number; average: number; low: number };
export type RateBand = "exceptional" | "healthy" | "average" | "low" | "not_yet";

/**
 * One locality-year. `rate` is year-on-year retention (completions ÷ last
 * year's, capped at 1). No rate when it's the locality's first year
 * (`baseline`), when last year was too small to show (`prev_suppressed`),
 * or when there was no activity either year. `match` triangulates the
 * registered locality against respondents' own answer, once enough answered.
 */
export type LocalityCell =
  | {
      suppressed?: false;
      n: number;
      rate?: number;
      prev_n?: number;
      baseline?: boolean;
      prev_suppressed?: boolean;
      answered?: number;
      match?: number;
    }
  | { suppressed: true };
export type LocalityRow = { locality: string; region: string | null; cells: Record<string, LocalityCell> };

export type YearScores =
  | { year: number; n: number; suppressed: true }
  | {
      year: number;
      n: number;
      suppressed?: false;
      funnel: Record<string, number | null> | null;
      domains: Record<string, number | null> | null;
      matrix: Record<string, Record<string, number | null>> | null;
    };

export type Insights = {
  space?: "live" | "demo";
  published: boolean;
  reason?: "awaiting_release" | "below_critical_mass";
  gate?: number;
  completions?: number;
  min_group_n?: number;
  locality?: { unit: string; measure?: string; bands: RateBands };
  years?: number[];
  timeline?: { year: number; started: number; completed: number }[];
  countries_by_year?: { year: number; countries: number }[];
  countries_total?: number;
  languages_by_year?: { year: number; languages: number; locales: { code: string; n: number }[] }[];
  languages_total?: number;
  locality_rates?: LocalityRow[];
  index_by_year?: YearScores[];
};

export const DEFAULT_BANDS: RateBands = { exceptional: 0.9, healthy: 0.7, average: 0.5, low: 0.3 };

/** Which band a 0–1 rate falls in. Cut-offs come from config (platform_settings.locality_rate_bands). */
export function rateBand(rate: number, bands: RateBands = DEFAULT_BANDS): RateBand {
  if (rate >= bands.exceptional) return "exceptional";
  if (rate >= bands.healthy) return "healthy";
  if (rate >= bands.average) return "average";
  if (rate >= bands.low) return "low";
  return "not_yet";
}

export const BAND_LABEL: Record<RateBand, string> = {
  exceptional: "Exceptional",
  healthy: "Healthy",
  average: "Average",
  low: "Low",
  not_yet: "Not yet",
};

// ── Export ──────────────────────────────────────────────────────────────────

export const DATASETS = [
  { key: "timeline", label: "Timeline — started vs completed", yearly: true },
  { key: "countries", label: "Countries reached per year", yearly: true },
  { key: "languages", label: "Survey languages in use per year", yearly: true },
  { key: "translations", label: "Translation pipeline (languages created)", yearly: false },
  { key: "locality", label: "Locality retention (year on year)", yearly: true },
  { key: "funnel", label: "Journey funnel by year", yearly: true },
  { key: "domains", label: "The three questions by year", yearly: true },
  { key: "matrix", label: "J12 matrix by year", yearly: true },
] as const;
export type DatasetKey = (typeof DATASETS)[number]["key"];

export const FORMATS = [
  { key: "csv", label: "CSV", note: "one file per dataset — zipped when you pick more than one" },
  { key: "xlsx", label: "Excel (.xlsx)", note: "one sheet per dataset" },
  { key: "json", label: "JSON", note: "one file, every dataset" },
] as const;
export type FormatKey = (typeof FORMATS)[number]["key"];

export type Cell = string | number | null;
export type Table = { key: DatasetKey | "about"; name: string; rows: Cell[][] };

export type Language = { code: string; name: string; status: string; dir: string };

export type BuildContext = {
  /** Order for tier / domain columns — pass the model's, never restate it. */
  tiers: readonly string[];
  domains: readonly string[];
  languages: Language[];
  generatedAt: Date;
};

const pct = (num: number, den: number): number | null => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

/** Years present in the data, oldest first. */
export function yearsOf(d: Insights): number[] {
  const ys = new Set<number>(d.years ?? []);
  for (const t of d.timeline ?? []) ys.add(t.year);
  return [...ys].sort((a, b) => a - b);
}

/** One table per requested dataset, filtered to `years` (empty = all). */
export function buildTables(d: Insights, datasets: DatasetKey[], years: number[], ctx: BuildContext): Table[] {
  const want = new Set(years.length ? years : yearsOf(d));
  const inYear = (y: number) => want.has(y);
  const langName = new Map(ctx.languages.map((l) => [l.code, l.name]));
  const bands = d.locality?.bands ?? DEFAULT_BANDS;
  const out: Table[] = [];

  for (const key of DATASETS.map((x) => x.key).filter((k) => datasets.includes(k))) {
    switch (key) {
      case "timeline":
        out.push({
          key, name: "Timeline",
          rows: [
            ["year", "sessions_started", "sessions_completed", "completion_rate_pct"],
            ...(d.timeline ?? []).filter((t) => inYear(t.year)).map((t) => [t.year, t.started, t.completed, pct(t.completed, t.started)]),
          ],
        });
        break;
      case "countries":
        out.push({
          key, name: "Countries",
          rows: [
            ["year", "countries_reached"],
            ...(d.countries_by_year ?? []).filter((t) => inYear(t.year)).map((t) => [t.year, t.countries]),
          ],
        });
        break;
      case "languages":
        out.push({
          key, name: "Languages",
          rows: [
            ["year", "languages_in_use", "language_code", "language_name", "sessions_started"],
            ...(d.languages_by_year ?? []).filter((t) => inYear(t.year)).flatMap((t) =>
              t.locales.map((l) => [t.year, t.languages, l.code, langName.get(l.code) ?? l.code, l.n] as Cell[]),
            ),
          ],
        });
        break;
      case "translations":
        out.push({
          key, name: "Translations",
          rows: [["language_code", "language_name", "status", "direction"], ...ctx.languages.map((l) => [l.code, l.name, l.status, l.dir])],
        });
        break;
      case "locality": {
        const rows: Cell[][] = [["locality", "region", "year", "completions", "prev_year_completions", "retention_0_1", "band", "note", "country_answered", "country_match_0_1"]];
        for (const r of d.locality_rates ?? []) {
          for (const [y, c] of Object.entries(r.cells).sort(([a], [b]) => Number(a) - Number(b))) {
            if (!inYear(Number(y))) continue;
            if (c.suppressed) { rows.push([r.locality, r.region, Number(y), null, null, null, null, "suppressed", null, null]); continue; }
            const note = c.rate !== undefined ? null : c.baseline ? "baseline (first year)" : c.prev_suppressed ? "previous year suppressed" : "no activity";
            rows.push([
              r.locality, r.region, Number(y), c.n, c.prev_n ?? null, c.rate ?? null,
              c.rate !== undefined ? BAND_LABEL[rateBand(c.rate, bands)] : null, note,
              c.answered ?? null, c.match ?? null,
            ]);
          }
        }
        out.push({ key, name: "Locality retention", rows });
        break;
      }
      case "funnel":
      case "domains":
      case "matrix": {
        const head: Cell[] =
          key === "funnel" ? ["year", "n", "tier", "score_1_5"]
          : key === "domains" ? ["year", "n", "question", "score_1_5"]
          : ["year", "n", "question", "tier", "score_1_5"];
        const rows: Cell[][] = [head];
        for (const y of (d.index_by_year ?? []).filter((t) => inYear(t.year))) {
          if (y.suppressed) {
            rows.push(key === "matrix" ? [y.year, y.n, null, null, "suppressed"] : [y.year, y.n, null, "suppressed"]);
            continue;
          }
          if (key === "funnel") for (const t of ctx.tiers) rows.push([y.year, y.n, t, y.funnel?.[t] ?? null]);
          else if (key === "domains") for (const dm of ctx.domains) rows.push([y.year, y.n, dm, y.domains?.[dm] ?? null]);
          else for (const dm of ctx.domains) for (const t of ctx.tiers) rows.push([y.year, y.n, dm, t, y.matrix?.[dm]?.[t] ?? null]);
        }
        out.push({ key, name: key === "funnel" ? "Funnel" : key === "domains" ? "Questions" : "J12 matrix", rows });
        break;
      }
    }
  }

  // Every export carries its own scope and definitions, so a file that
  // travels without the page still can't be read as a whole population.
  out.unshift({
    key: "about", name: "About",
    rows: [
      ["field", "value"],
      ["scope", "Of those who have completed the Index — never a whole population. Aggregates only; no individual response."],
      ["data_space", d.space ?? "live"],
      ["generated_at", ctx.generatedAt.toISOString()],
      ["years", [...want].sort().join(" ")],
      ["year_basis", "Calendar year the session started"],
      ["locality_unit", "Country the survey was registered to when created (the survey link's, else the survey's)"],
      ["retention", "Completions this year ÷ completions last year, same locality, capped at 1.00"],
      ["country_match", "Share of respondents who gave a country whose answer matches the registered locality"],
      ["rate_bands", `exceptional ≥ ${bands.exceptional} · healthy ≥ ${bands.healthy} · average ≥ ${bands.average} · low ≥ ${bands.low}`],
      ["score_gate_n", d.gate ?? null],
      ["min_group_n", d.min_group_n ?? null],
      ["suppressed", "A cell or year below its gate carries no figure — shown as 'suppressed'."],
    ],
  });
  return out;
}

function csvCell(v: Cell): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const toCsv = (rows: Cell[][]): string => rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

/** Rows → objects, for the JSON export. */
export function toRecords(rows: Cell[][]): Record<string, Cell>[] {
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [String(h), r[i] ?? null])));
}

export const fileStem = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "data";
