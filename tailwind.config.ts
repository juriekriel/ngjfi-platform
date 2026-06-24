import type { Config } from "tailwindcss";

// Design tokens mirror the leadership pitch (clean research-dashboard palette).
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#22252b",
        paper: "#f5f6f8",
        "paper-deep": "#eceef2",
        card: "#ffffff",
        rule: "#e2e5ea",
        accent: "#ff7a47",
        "accent-soft": "#ff9762",
        violet: "#8b5cf6",
        moss: "#3f9d72",
        slate: "#5b6470",
        muted: "#8b9099",
        bench: "#2f80c4",
      },
      fontFamily: {
        sans: ["Inter Tight", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
