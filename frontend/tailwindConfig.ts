import type { Config } from "tailwindcss";

// AI Assisted Logic
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        factory: {
          ink: "#141413",
          panel: "#f6f5ef",
          line: "#d8d4c8",
          steel: "#4b5563",
          teal: "#0f766e",
          amber: "#b45309",
          alarm: "#b91c1c",
          pass: "#15803d",
        },
      },
      boxShadow: {
        soft: "0 12px 28px rgba(20, 20, 19, 0.08)",
      },
    },
  },
  plugins: [],
} satisfies Config;

