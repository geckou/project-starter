import { beforeEach, describe, expect, it, vi } from 'vitest'

// firebase-admin（adminAuth）をモック
const mockCreateSessionCookie = vi.fn()

vi.mock('@/lib/firebase-admin', () => ({
  adminAuth: {
    createSessionCookie: (...args: unknown[]) =>
      mockCreateSessionCookie(...args),
  },
}))

// next/headers の cookies() をモック
const mockCookieSet = vi.fn()
const mockCookieDelete = vi.fn()

vi.mock('next/headers', () => ({
  cookies: async () => ({
    set: mockCookieSet,
    delete: mockCookieDelete,
  }),
}))

import { DELETE, POST } from '@/app/api/session/route'

function buildPostRequest(body: string) {
  return new Request('https://example.web.app/api/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  })
}

describe('POST /api/session', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    const response = await DELETE()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true })
    expect(mockCookieDelete).toHaveBeenCalledWith('session')
  })
})
