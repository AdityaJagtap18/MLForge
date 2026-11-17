/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#E96B18",
        amber: "#F59E0B",
        "deep-orange": "#E85D04",
        bg: "#FAF8F5",
        surface: "#FFFFFF",
        ink: "#242424",
        muted: "#77716B",
        line: "#EAE4DC",
      },
      borderRadius: {
        card: "12px",
      },
    },
  },
  plugins: [],
};
