const { colors, fontFamily, borderRadius } = require('@geckou/shared/theme')

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors,
      fontFamily,
      borderRadius,
    },
  },
  plugins: [],
}
