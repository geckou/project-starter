import { beforeEach, describe, expect, it, vi } from 'vitest'

// firebase-admin（adminAuth）をモック
const mockCreateSessionCookie = vi.fn()
const mockVerifySessionCookie = vi.fn()
const mockRevokeRefreshTokens = vi.fn()

vi.mock('@/lib/firebase-admin', () => ({
  adminAuth: {
    createSessionCookie: (...args: unknown[]) =>
      mockCreateSessionCookie(...args),
    verifySessionCookie: (...args: unknown[]) =>
      mockVerifySessionCookie(...args),
    revokeRefreshTokens: (...args: unknown[]) =>
      mockRevokeRefreshTokens(...args),
  },
}))

// next/headers の cookies() をモック
const mockCookieSet = vi.fn()
const mockCookieDelete = vi.fn()
const mockCookieGet = vi.fn()

vi.mock('next/headers', () => ({
  cookies: async () => ({
    set: mockCookieSet,
    delete: mockCookieDelete,
    get: mockCookieGet,
  }),
}))

import { DELETE, POST } from '@/app/api/session/route'

function buildPostRequest(body: string, headers: Record<string, string> = {}) {
  return new Request('https://example.web.app/api/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  })
}

function buildDeleteRequest(headers: Record<string, string> = {}) {
  return new Request('https://example.web.app/api/session', {
    method: 'DELETE',
    headers,
  })
}

describe('POST /api/session', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // 回帰: Origin / Sec-Fetch-Site / Content-Type を見ておらず、攻撃者サイトから
  // text/plain のフォームで攻撃者の idToken を POST させられた（ログイン CSRF）
  it('クロスサイトからの POST は 403 を返す', async () => {
    const response = await POST(
      buildPostRequest(JSON.stringify({ idToken: 'attacker-token' }), {
        'sec-fetch-site': 'cross-site',
      })
    )

    expect(response.status).toBe(403)
    expect(mockCreateSessionCookie).not.toHaveBeenCalled()
  })

  it('別オリジンの Origin ヘッダーは 403 を返す', async () => {
    const response = await POST(
      buildPostRequest(JSON.stringify({ idToken: 'attacker-token' }), {
        origin: 'https://attacker.example',
      })
    )

    expect(response.status).toBe(403)
    expect(mockCreateSessionCookie).not.toHaveBeenCalled()
  })

  it('同一オリジンからの POST は通す', async () => {
    mockCreateSessionCookie.mockResolvedValueOnce('session-cookie-value')

    const response = await POST(
      buildPostRequest(JSON.stringify({ idToken: 'valid-token' }), {
        'sec-fetch-site': 'same-origin',
        origin: 'https://example.web.app',
      })
    )

    expect(response.status).toBe(200)
  })

  it('Content-Type が application/json 以外は 400 を返す', async () => {
    const response = await POST(
      buildPostRequest(JSON.stringify({ idToken: 'attacker-token' }), {
        'content-type': 'text/plain;charset=UTF-8',
      })
    )

    expect(response.status).toBe(400)
    expect(mockCreateSessionCookie).not.toHaveBeenCalled()
  })

  it('不正な JSON body で 400 を返す', async () => {
    const response = await POST(buildPostRequest('not-a-json'))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid request body' })
  })

  it('idToken がない場合 400 を返す', async () => {
    const response = await POST(buildPostRequest(JSON.stringify({})))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'idToken is required' })
  })

  it('idToken が空文字の場合 400 を返す', async () => {
    const response = await POST(
      buildPostRequest(JSON.stringify({ idToken: '' }))
    )

    expect(response.status).toBe(400)
    expect(mockCreateSessionCookie).not.toHaveBeenCalled()
  })

  it('idToken の検証に失敗した場合 401 を返す', async () => {
    mockCreateSessionCookie.mockRejectedValueOnce(new Error('invalid token'))

    const response = await POST(
      buildPostRequest(JSON.stringify({ idToken: 'bad-token' }))
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Invalid idToken' })
    expect(mockCookieSet).not.toHaveBeenCalled()
  })

  it('有効な idToken でセッション cookie を発行し 200 を返す', async () => {
    mockCreateSessionCookie.mockResolvedValueOnce('session-cookie-value')

    const response = await POST(
      buildPostRequest(JSON.stringify({ idToken: 'valid-token' }))
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true })
    expect(mockCreateSessionCookie).toHaveBeenCalledWith('valid-token', {
      expiresIn: expect.any(Number),
    })
    expect(mockCookieSet).toHaveBeenCalledWith(
      'session',
      'session-cookie-value',
      expect.objectContaining({ httpOnly: true, path: '/' })
    )
  })
})

describe('DELETE /api/session', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('セッション cookie を削除し 200 を返す', async () => {
    mockCookieGet.mockReturnValue(undefined)

    const response = await DELETE(buildDeleteRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true })
    expect(mockCookieDelete).toHaveBeenCalledWith('session')
  })

  // 回帰: cookie を消すだけで revoke しておらず、漏れた cookie が最長 5 日使えた
  it('リフレッシュトークンを失効させる', async () => {
    mockCookieGet.mockReturnValue({ value: 'session-cookie-value' })
    mockVerifySessionCookie.mockResolvedValueOnce({ sub: 'user-1' })

    const response = await DELETE(buildDeleteRequest())

    expect(response.status).toBe(200)
    expect(mockRevokeRefreshTokens).toHaveBeenCalledWith('user-1')
    expect(mockCookieDelete).toHaveBeenCalledWith('session')
  })

  it('無効な cookie でもサインアウトは成功する', async () => {
    mockCookieGet.mockReturnValue({ value: 'expired' })
    mockVerifySessionCookie.mockRejectedValueOnce(new Error('expired'))

    const response = await DELETE(buildDeleteRequest())

    expect(response.status).toBe(200)
    expect(mockRevokeRefreshTokens).not.toHaveBeenCalled()
    expect(mockCookieDelete).toHaveBeenCalledWith('session')
  })

  it('クロスサイトからの DELETE は 403 を返す', async () => {
    const response = await DELETE(
      buildDeleteRequest({ 'sec-fetch-site': 'cross-site' })
    )

    expect(response.status).toBe(403)
    expect(mockCookieDelete).not.toHaveBeenCalled()
  })
})
