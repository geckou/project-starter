import { afterEach, describe, expect, it, vi } from 'vitest'

import { resolveCorsOrigin } from '../src/api'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('resolveCorsOrigin', () => {
  it('ALLOWED_ORIGINS を指定していればその一覧を返す', () => {
    vi.stubEnv(
      'ALLOWED_ORIGINS',
      'https://example.com, https://app.example.com'
    )

    expect(resolveCorsOrigin()).toEqual([
      'https://example.com',
      'https://app.example.com',
    ])
  })

  it('エミュレーターでは未設定でも全オリジンを許可する', () => {
    vi.stubEnv('ALLOWED_ORIGINS', '')
    vi.stubEnv('FUNCTIONS_EMULATOR', 'true')

    expect(resolveCorsOrigin()).toBe(true)
  })

  it('エミュレーターの外で未設定なら落とす', () => {
    vi.stubEnv('ALLOWED_ORIGINS', '')
    vi.stubEnv('FUNCTIONS_EMULATOR', '')

    expect(() => resolveCorsOrigin()).toThrow(
      'ALLOWED_ORIGINS is required outside the emulator'
    )
  })
})
