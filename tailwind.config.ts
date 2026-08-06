import type { Config } from "tailwindcss";

/**
 * The Jesus Index — design tokens.
 *
 * From Brand Proof № 2 (5 Aug 2026). The language is an almanac, not an app:
 * warm paper, near-black ink, hairline rules, square corners, one working colour
 * used scarcely. No gradients, no glass, no shadows, no motion.
 *
 * The token NAMES are deliberately unchanged from the pre-brand palette so every
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

        // One working colour. Up-is-growth belongs to the subject matter.
        emerald: c("emerald"),
        "emerald-deep": c("emerald-deep"),
        accent: c("emerald"),
        "accent-soft": c("emerald-deep"),
        moss: c("emerald"),

        // Levels, never decoration.
        navy: c("navy"),
        bench: c("navy"),
        violet: c("navy"),

        // Semantic only: vermillion means "down". Never styling.
        vermillion: c("vermillion"),

        slate: c("ink-2"),
        muted: c("muted"),
        faint: c("muted"),
      },
      fontFamily: {
        // If it's a sentence, it's serif. If it's a number, it's mono.
        // If it's a control, it's the quiet grotesk. No exceptions.
        serif: ["var(--font-serif)", "Georgia", "Times New Roman", "serif"],
        sans: ["var(--font-serif)", "Georgia", "serif"],
        ui: ["var(--font-ui)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        // Square corners are part of the argument: everything collapses to 0.
        none: "0", sm: "0", DEFAULT: "0", md: "0", lg: "0",
        xl: "0", "2xl": "0", "3xl": "0", full: "9999px",
      },
      boxShadow: {
        none: "none", sm: "none", DEFAULT: "none", md: "none", lg: "none", xl: "none",
      },
      maxWidth: {
        measure: "34rem", // a comfortable reading measure for serif body copy
      },
    },
  },
  plugins: [],
};

export default config;
