import type { Config } from 'tailwindcss'
import { colors, fontFamily, borderRadius } from '@geckou/shared/theme'

const config: Config = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors,
      fontFamily,
      borderRadius,
    },
  },
}

export default config
