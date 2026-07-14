import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        black: "#0A0A0F",
        deep: "#111118",
        card: "#16161F",
        border: "#1E1E2E",
        gold: "#F5A623",
        "gold-dim": "#C4821A",
        green: "#00D68F",
        red: "#FF4D6D",
        muted: "#7B7B9A",
        surface: "#E8E8F0",
      },
      fontFamily: {
        grotesk: ["Space Grotesk", "sans-serif"],
        sans: ["Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
