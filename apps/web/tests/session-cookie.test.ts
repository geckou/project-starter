import { describe, expect, it } from 'vitest'

import {
  isInvalidSessionError,
  nullIfInvalidSession,
} from '@/lib/session-cookie'

function authError(code: string) {
  return Object.assign(new Error(code), { code })
}

describe('isInvalidSessionError', () => {
  it.each([
    'auth/argument-error',
    'auth/id-token-expired',
    'auth/id-token-revoked',
    'auth/session-cookie-expired',
    'auth/session-cookie-revoked',
    'auth/user-disabled',
    'auth/user-not-found',
  ])('%s は無効なセッションとして扱う', (code) => {
    expect(isInvalidSessionError(authError(code))).toBe(true)
  })

  // 回帰（#302）: 設定漏れを「未ログイン」として握ると、ログインループになる
  it.each([
    [
      'コードの無いエラー（Project Id を検出できない）',
      new Error('Unable to detect a Project Id'),
    ],
    ['app/invalid-credential', authError('app/invalid-credential')],
    ['auth/internal-error', authError('auth/internal-error')],
    ['文字列でない code', Object.assign(new Error('x'), { code: 401 })],
    ['Error でない値', 'auth/argument-error'],
    ['null', null],
  ])('%s は無効なセッションとして扱わない', (_label, error) => {
    expect(isInvalidSessionError(error)).toBe(false)
  })
})

describe('nullIfInvalidSession', () => {
  it('無効なセッションなら null を返す', () => {
    expect(
      nullIfInvalidSession(authError('auth/session-cookie-revoked'))
    ).toBeNull()
  })

  it('それ以外は原因を付けて throw する', () => {
    const cause = new Error('Unable to detect a Project Id')

    expect(() => nullIfInvalidSession(cause)).toThrow(/firebase-admin/)

    try {
      nullIfInvalidSession(cause)
    } catch (error) {
      expect((error as Error).cause).toBe(cause)
    }
  })
})
