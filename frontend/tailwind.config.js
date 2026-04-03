/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        poker: {
          green: "#1a5c38",
          felt: "#1b4d2e",
          dark: "#0f1419",
          gold: "#d4a937",
        },
      },
    },
  },
  plugins: [],
};
