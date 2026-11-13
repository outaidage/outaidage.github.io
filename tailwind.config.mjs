/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#090B0F",
        panel: "#11151C",
        line: "#232A35",
        muted: "#929BAA",
        lime: "#B5F36B"
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"]
      },
      boxShadow: { glow: "0 0 40px rgba(181,243,107,.12)" }
    }
  },
  plugins: []
};
