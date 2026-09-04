import { describe, expect, it } from 'vitest'

import { sanitizeRedirect } from '@/lib/sanitize-redirect'

describe('sanitizeRedirect', () => {
  it('サイト内パスはそのまま返す', () => {
    expect(sanitizeRedirect('/dashboard')).toBe('/dashboard')
    expect(sanitizeRedirect('/dashboard?tab=1#top')).toBe(
      '/dashboard?tab=1#top'
    )
  })

  it('未指定なら / を返す', () => {
    expect(sanitizeRedirect(null)).toBe('/')
    expect(sanitizeRedirect('')).toBe('/')
  })

  // 回帰: `\` は WHATWG URL パーサが `/` と同一視するため、/\evil.com は
  // https://evil.com/ に解決され、ログイン直後に外部サイトへ飛んでいた
  it('外部へ解決されうる値を弾く', () => {
    for (const redirect of [
      '/\\evil.com',
      '/\\\\evil.com',
      '//evil.com',
      'https://evil.com',
      'http://evil.com',
      'evil.com',
      '/path\\..\\evil.com',
    ]) {
      expect(sanitizeRedirect(redirect)).toBe('/')
    }
  })

  it('弾いた値は同一オリジンに解決されないことまで確かめる', () => {
    const origin = 'https://example.com'

    for (const redirect of ['/\\evil.com', '//evil.com', 'https://evil.com']) {
      expect(new URL(redirect, origin).origin).not.toBe(origin)
      expect(new URL(sanitizeRedirect(redirect), origin).origin).toBe(origin)
    }
  })
})
