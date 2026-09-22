import type { Config } from "tailwindcss";

/**
 * The Jesus Index — design tokens.
 *
 * Brand Proof № 3 (Sep 2026, see docs/PALETTE.md) replaces the almanac: white
 * ground, coral as the single working colour, violet/blue/green as supporting
 * accents. Rounded corners and soft shadows are back in — see borderRadius /
 * boxShadow below, which the almanac had collapsed to 0.
 *
 * The token NAMES are deliberately unchanged from the almanac palette so every
 * existing surface — the respondent survey, the org dashboard, Collab
 * Intelligence — re-skins from this one file. That is the point: the landing
 * page, the guided tour and the live product cannot drift apart, because they
 * are all reading these same values.
 *
 * THE VALUES THEMSELVES LIVE IN src/app/globals.css, in the :root block.
 * This file only maps Tailwind's token names onto those CSS variables, so that
 * the stylesheet, the utility classes and the chart primitives in
 * src/lib/model.ts cannot drift apart either. To change a colour, edit
 * globals.css — not here.
 *
 * The `rgb(var(--x) / <alpha-value>)` form is what keeps Tailwind's opacity
 * modifiers working (`bg-paper/95`, `text-ink/60`).
 */
const c = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: c("ink"),
        "ink-2": c("ink-2"),
        paper: c("paper"),
        "paper-deep": c("paper-deep"),
        plate: c("plate"),
        card: c("plate"),
        rule: c("rule"),
        "rule-2": c("rule-2"),

        // One working colour (now coral) — chrome, marks, the tier ramp.
        emerald: c("emerald"),
        "emerald-deep": c("emerald-deep"),
        "emerald-deeper": c("emerald-deeper"),
        accent: c("emerald"),
        "accent-soft": c("emerald-deep"),
        moss: c("emerald"),

        // "Up" in delta() — kept off the brand colour on purpose. See the note
        // above --c-emerald in globals.css.
        green: c("green"),

        // Levels, never decoration.
        navy: c("navy"),
        bench: c("navy"),

        // A domain accent (Follow), never a semantic.
        violet: c("violet"),
        "violet-deep": c("violet-deep"),
        "violet-deeper": c("violet-deeper"),

        // Semantic only: vermillion means "down". Never styling.
        vermillion: c("vermillion"),

        slate: c("ink-2"),
        muted: c("muted"),
        faint: c("muted"),
      },
      fontFamily: {
        // Brand Proof № 3: everything is the grotesk — body copy AND controls.
        // The bookface (Newsreader) is kept only for the "font-serif" /
        // ".wordmark" masthead lockup — it is the one deliberate exception,
        // not a second voice for general text.
        serif: ["var(--font-serif)", "Georgia", "Times New Roman", "serif"],
        sans: ["var(--font-ui)", "system-ui", "sans-serif"],
        ui: ["var(--font-ui)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        // Rounded corners are back — the almanac's collapse-to-0 is gone.
        none: "0", sm: "6px", DEFAULT: "10px", md: "12px", lg: "16px",
        xl: "20px", "2xl": "24px", "3xl": "28px", full: "9999px",
      },
      boxShadow: {
        none: "none",
        sm: "0 1px 2px rgb(0 0 0 / 0.04)",
        DEFAULT: "0 1px 3px rgb(0 0 0 / 0.06), 0 1px 2px rgb(0 0 0 / 0.04)",
        md: "0 4px 10px rgb(0 0 0 / 0.06)",
        lg: "0 10px 24px rgb(0 0 0 / 0.08)",
        xl: "0 18px 40px rgb(0 0 0 / 0.10)",
      },
      maxWidth: {
        measure: "34rem", // a comfortable reading measure for serif body copy
      },
    },
  },
  plugins: [],
};

export default config;
