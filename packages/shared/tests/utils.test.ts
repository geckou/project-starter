import { describe, expect, it } from 'vitest'

import { formatDate, sleep } from '../src/utils'

describe('formatDate', () => {
  // ローカルタイムゾーン基準のため、テストもローカル時刻のコンストラクタで作る
  it('YYYY-MM-DD 形式でフォーマットする', () => {
    const date = new Date(2026, 3, 3, 12, 0, 0)
    expect(formatDate(date)).toBe('2026-04-03')
  })

  it('月・日が1桁でもゼロ埋めされる', () => {
    const date = new Date(2026, 0, 5)
    expect(formatDate(date)).toBe('2026-01-05')
  })

  it('年末の日付を正しく処理する', () => {
    const date = new Date(2026, 11, 31, 23, 59, 59)
    expect(formatDate(date)).toBe('2026-12-31')
  })

  it('年始の日付を正しく処理する', () => {
    const date = new Date(2026, 0, 1, 0, 0, 0)
    expect(formatDate(date)).toBe('2026-01-01')
  })

  it('深夜0時直後でも日付がズレない（旧実装は UTC 基準で前日になっていた）', () => {
    const date = new Date(2026, 5, 11, 0, 30, 0)
    expect(formatDate(date)).toBe('2026-06-11')
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
