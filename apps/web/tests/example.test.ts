import { formatDate } from '@geckou/shared'
import { describe, expect, it } from 'vitest'

describe('shared utils', () => {
  it('formatDate returns YYYY-MM-DD', () => {
    const date = new Date('2026-01-15T00:00:00Z')
    expect(formatDate(date)).toBe('2026-01-15')
  })
})
