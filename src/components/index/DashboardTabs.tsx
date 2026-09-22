import Link from "next/link";

/**
 * The two-tab shell every signed-in surface shares: an org's own dashboard,
 * and Collab Intelligence. Real navigation between two real routes (not
 * client-side state) so each keeps its own data-fetching and auth — but one
 * component, so both read identically and a restyle lands in both places at
 * once. Per the locked Phase 2 brief: after sign-in, an org sees only these
 * two tabs.
 */
export function DashboardTabs({
  active,
  orgSlug,
}: {
  active: "dashboard" | "collab";
  orgSlug: string;
}) {
  return (
    <nav className="flex items-center gap-6 border-b border-rule">
      <TabLink href={`/${orgSlug}/dashboard`} label="Our Dashboard" active={active === "dashboard"} />
      <TabLink href="/intelligence" label="Collab Intelligence" active={active === "collab"} />
    </nav>
  );
}

function TabLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`-mb-px border-b-2 pb-2.5 text-[14px] font-semibold no-underline ${
        active ? "border-accent text-ink" : "border-transparent text-muted hover:text-slate"
      }`}
    >
      {label}
    </Link>
  );
}

/** Matrix / Heat map — the two switchable views that replace a long scroll. */
export function ViewToggle({
  view,
  onChange,
}: {
  view: "matrix" | "heatmap";
  onChange: (v: "matrix" | "heatmap") => void;
}) {
  return (
    <div className="inline-flex gap-0.5 rounded-full border border-rule bg-paper-deep p-1">
      <ToggleButton label="Matrix" active={view === "matrix"} onClick={() => onChange("matrix")} />
      <ToggleButton label="Heat map" active={view === "heatmap"} onClick={() => onChange("heatmap")} />
    </div>
  );
}

function ToggleButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors ${
        active ? "bg-card text-ink shadow-sm" : "text-muted hover:text-slate"
      }`}
    >
      {label}
    </button>
  );
}
