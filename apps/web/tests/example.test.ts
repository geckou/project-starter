import { formatDate } from '@geckou/shared'
import { describe, expect, it } from 'vitest'

describe('shared utils', () => {
  it('formatDate returns YYYY-MM-DD', () => {
    // formatDate はローカル時刻で組み立てるため、UTC 指定の文字列を渡すと
    // UTC より西のタイムゾーンで前日になる
    const date = new Date(2026, 0, 15)
    expect(formatDate(date)).toBe('2026-01-15')
  })
})
