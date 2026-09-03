import { colors, fontFamily, borderRadius } from '@geckou/shared/theme'
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
    // 0.2.0 から dist 配布。src は tarball に含まれないのでスキャンできない
    '../../node_modules/@geckou/ui-react/dist/**/*.js',
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
