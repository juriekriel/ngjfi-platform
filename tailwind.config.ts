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
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1B1F27",
        "ink-2": "#4C5260",
        paper: "#FAF7F1",
        "paper-deep": "#F1ECE1",
        plate: "#FFFDF8",
        card: "#FFFDF8",
        rule: "#D9D2C4",
        "rule-2": "#C8BFAC",

        // One working colour. Up-is-growth belongs to the subject matter.
        emerald: "#0B8A60",
        "emerald-deep": "#086C4C",
        accent: "#0B8A60",
        "accent-soft": "#086C4C",
        moss: "#0B8A60",

        // Levels, never decoration.
        navy: "#35639C",
        bench: "#35639C",
        violet: "#35639C",

        // Semantic only: vermillion means "down". Never styling.
        vermillion: "#B5451B",

        slate: "#4C5260",
        muted: "#8A8F9B",
        faint: "#8A8F9B",
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
