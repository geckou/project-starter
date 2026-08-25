import { colors, fontFamily, borderRadius } from '@geckou/shared/theme'
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
    '../../node_modules/@geckou/ui-react/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors,
      fontFamily,
      borderRadius,
    },
  },
}

export default config
