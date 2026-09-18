/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],

  theme: {
    extend: {
      colors: {
        "i-primary": "#0B2241",
        "i-blue": "#4FB0F1",
        "i-green": "#7DF979",
        "i-turquoise": "#7AFDF2",
      },

      fontFamily: {
        brand: ['"Neue Montreal"', "Inter", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
        special: ["Neuropolitical", '"Neue Montreal"', "sans-serif"],
      },

      backgroundImage: {
        "brand-gradient":
          "linear-gradient(135deg, #4FB0F1 0%, #7DF979 100%)",

        "brand-gradient-soft":
          "linear-gradient(135deg, #7DF979 0%, #7AFDF2 100%)",
      },
    },
  },

  plugins: [],
};