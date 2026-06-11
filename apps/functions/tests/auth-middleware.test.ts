import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type Request, type Response } from 'express'

const mockVerifyIdToken = vi.fn()

vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: mockVerifyIdToken,
  }),
}))

import {
  requireAuth,
  type AuthenticatedRequest,
} from '../src/lib/auth-middleware'

function createMockRequest(authorization?: string): Request {
  return {
    headers: authorization ? { authorization } : {},
  } as Request
}

function createMockResponse(): Response & {
  statusCode: number
  body: unknown
} {
  const res = {
    statusCode: 0,
    body: null as unknown,
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(data: unknown) {
      res.body = data
      return res
    },
  }
  return res as unknown as Response & { statusCode: number; body: unknown }
}

describe('requireAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('トークンなしで 401 を返す', async () => {
    const req = createMockRequest()
    const res = createMockResponse()
    const next = vi.fn()

    await requireAuth(req, res as unknown as Response, next)

    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('無効なトークンで 401 を返す', async () => {
    mockVerifyIdToken.mockRejectedValueOnce(new Error('invalid token'))

    const req = createMockRequest('Bearer invalid-token')
    const res = createMockResponse()
    const next = vi.fn()

    await requireAuth(req, res as unknown as Response, next)

    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('有効なトークンで req.uid をセットして next を呼ぶ', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'user-1' })

    const req = createMockRequest('Bearer valid-token')
    const res = createMockResponse()
    const next = vi.fn()

    await requireAuth(req, res as unknown as Response, next)

    expect(mockVerifyIdToken).toHaveBeenCalledWith('valid-token')
    expect((req as AuthenticatedRequest).uid).toBe('user-1')
    expect(next).toHaveBeenCalled()
  })
})
