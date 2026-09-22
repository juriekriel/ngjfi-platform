/**
 * Org dashboard CSV export — "All data" / "Yearly data" (CLAUDE.md build
 * brief, production-readiness round). Exports only what org_dashboard()/
 * org_dashboard_season() already return: per-item AGGREGATE means and counts.
 * There is no individual-response export anywhere in this file, on purpose —
 * non-negotiable #6 ("orgs see aggregates only") applies just as much to a
 * downloaded file as it does to the screen.
 */
import { instrument, t } from "@/lib/instrument";
import { TIER_LABEL } from "@/lib/model";

type ExportItem = { key: string; domain: string; tier: string; mean: number | null; n: number };
type ExportDash = {
  org: { slug: string; name: string };
  n: number;
  scale?: number;
  season?: { start: string | null; end: string | null };
  items: ExportItem[];
};

const ITEM_LABEL: Record<string, string> = Object.fromEntries(
  instrument.items.map((i) => [i.key, t(i.text, "en")]),
);

function csvCell(v: string | number | null): string {
  const s = v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Builds a CSV of per-item aggregates and triggers a browser download. */
export function exportItemsCsv(dash: ExportDash, filenameStem: string): void {
  const rows: string[][] = [
    ["organisation", "season_start", "season_end", "n_total", "item_key", "item_label", "domain", "tier", "mean_1_5", "item_n"],
  ];
  const seasonStart = dash.season?.start ?? "";
  const seasonEnd = dash.season?.end ?? "";
  for (const it of dash.items ?? []) {
    rows.push([
      dash.org.name,
      seasonStart,
      seasonEnd,
      String(dash.n),
      it.key,
      ITEM_LABEL[it.key] ?? it.key,
      it.domain,
      TIER_LABEL[it.tier] ?? it.tier,
      it.mean === null ? "" : String(it.mean),
      String(it.n),
    ]);
  }
  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenameStem}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
