import { defineConfig } from 'vitest/config'

// 対象は react-native に依存しない純粋なロジックだけ（設定の条件分岐・文字列化など）。
// 画面と、react-native / expo を import するモジュールはここでは検証しない
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globals: true,
  },
})
