import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globals: true,
    // api.ts は ALLOWED_ORIGINS 未設定を起動時に落とす。配線を見るテストは
    // エミュレーター相当で動かす（未設定時の挙動は cors-origin.test.ts で検証する）
    env: { FUNCTIONS_EMULATOR: 'true' },
  },
})
