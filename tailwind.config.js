/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        gold: "#F5A623",
        green: "#10B981",
        blue: "#3B82F6",
        red: "#EF4444",
        surface: "#E8E8F0",
        muted: "#7B7B9A",
        border: "#1E1E2E",
      },
      fontFamily: {
        inter: ["var(--font-inter)"],
        grotesk: ["var(--font-grotesk)"],
      },
    },
  },
  plugins: [],
}
