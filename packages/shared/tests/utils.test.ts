import { describe, expect, it } from 'vitest'

import { formatDate, sleep } from '../src/utils'

describe('formatDate', () => {
  it('YYYY-MM-DD 形式でフォーマットする', () => {
    const date = new Date('2026-04-03T12:00:00Z')
    expect(formatDate(date)).toBe('2026-04-03')
  })

  it('月・日が1桁でもゼロ埋めされる', () => {
    const date = new Date('2026-01-05T00:00:00Z')
    expect(formatDate(date)).toBe('2026-01-05')
  })

  it('年末の日付を正しく処理する', () => {
    const date = new Date('2026-12-31T23:59:59Z')
    expect(formatDate(date)).toBe('2026-12-31')
  })

  it('年始の日付を正しく処理する', () => {
    const date = new Date('2026-01-01T00:00:00Z')
    expect(formatDate(date)).toBe('2026-01-01')
  })
})

describe('sleep', () => {
  it('指定ミリ秒待機する', async () => {
    const start = Date.now()
    await sleep(50)
    const elapsed = Date.now() - start
    expect(elapsed).toBeGreaterThanOrEqual(40)
  })

  it('Promise を返す', () => {
    const result = sleep(1)
    expect(result).toBeInstanceOf(Promise)
  })
})
