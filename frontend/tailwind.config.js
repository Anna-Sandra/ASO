/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["DM Sans", "system-ui", "sans-serif"],
        display: ["Fraunces", "Georgia", "serif"]
      },
      colors: {
        night: {
          950: "#020617",
          900: "#0a0f1e",
          850: "#0c1224",
          800: "#0f172a",
          700: "#111c3a"
        },
        ice: {
          400: "#7dd3fc",
          500: "#38bdf8",
          600: "#0ea5e9"
        }
      },
      boxShadow: {
        glass: "0 8px 32px rgba(2, 6, 23, 0.45), inset 0 1px 0 rgba(255,255,255,0.06)"
      },
      backgroundImage: {
        "mesh-dark":
          "radial-gradient(ellipse 120% 80% at 20% 0%, rgba(14,165,233,0.18), transparent 55%), radial-gradient(ellipse 90% 60% at 100% 20%, rgba(99,102,241,0.12), transparent 50%), radial-gradient(ellipse 70% 50% at 50% 100%, rgba(56,189,248,0.08), transparent 45%)"
      },
      keyframes: {
        "buyer-ticker": {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" }
        }
      },
      animation: {
        "buyer-ticker": "buyer-ticker 28s linear infinite"
      }
    }
  },
  plugins: []
};
