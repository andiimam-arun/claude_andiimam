import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { 50: "#f1f5fb", 100: "#dde7f5", 200: "#b9cdea", 300: "#8aa9d8", 400: "#5b82c0", 500: "#3b64a6", 600: "#2c4e87", 700: "#243f6d", 800: "#1b2f55", 900: "#12203d", 950: "#0b1428" },
        ok: { DEFAULT: "#15803d", soft: "#dcfce7", ink: "#14532d" },
        warn: { DEFAULT: "#b45309", soft: "#fef3c7", ink: "#78350f" },
        bad: { DEFAULT: "#b91c1c", soft: "#fee2e2", ink: "#7f1d1d" },
      },
      fontFamily: { sans: ["Inter Variable", "ui-sans-serif", "system-ui", "sans-serif"] },
      boxShadow: { card: "0 1px 2px rgba(18,32,61,.06), 0 4px 16px rgba(18,32,61,.06)" },
    },
  },
  plugins: [],
};
export default config;
