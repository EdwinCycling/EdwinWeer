/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./views/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./App.tsx",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: "#13b6ec",
        "background-light": "#f6f8f8",
        "background-dark": "var(--bg-primary)",
        "card-dark": "var(--bg-card)",
        strava: "#FC4C02",
      },
      fontFamily: {
        display: ["Space Grotesk", "sans-serif"],
      },
    },
  },
  plugins: [],
}