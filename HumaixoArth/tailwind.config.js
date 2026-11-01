/** @type {import('tailwindcss').Config} */
module.exports = {
  // Expo's forced dark appearance is a manual color-scheme override, so NativeWind
  // must use the class strategy instead of the default prefers-color-scheme media query.
  darkMode: 'class',
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        arth: {
          background: '#090910',
          surface: '#15151f',
          primary: '#805cff',
          accent: '#b5a4ff',
          income: '#21c997',
          expense: '#ff6375',
          muted: '#a1a1b3',
        },
      },
    },
  },
  plugins: [],
};
