import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Request, type Response } from 'express'

// firebase-admin/firestore をモック
const mockSet = vi.fn().mockResolvedValue(undefined)
const mockDoc = vi.fn().mockReturnValue({ set: mockSet })
const mockCollection = vi.fn().mockReturnValue({ doc: mockDoc })

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: mockCollection,
  }),
}))

import { handleRevenueCatWebhook } from '../src/revenuecat-webhook'

function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    body: {},
    headers: {},
    ...overrides,
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

function createEventBody(type: string, userId: string) {
  return {
    event: { type, app_user_id: userId, timestamp: 123 },
  }
}

describe('RevenueCat Webhook', () => {
  // RevenueCat Dashboard で設定する Authorization ヘッダー値
  const AUTH_HEADER = 'Bearer test-webhook-auth'

  beforeEach(() => {
    vi.stubEnv('REVENUECAT_WEBHOOK_AUTH', AUTH_HEADER)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('REVENUECAT_WEBHOOK_AUTH 未設定で 500 を返す', async () => {
    vi.stubEnv('REVENUECAT_WEBHOOK_AUTH', '')
    delete process.env.REVENUECAT_WEBHOOK_AUTH

    const req = createMockRequest()
    const res = createMockResponse()

    await handleRevenueCatWebhook(req, res as unknown as Response)

    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: 'Webhook auth not configured' })
  })

  it('Authorization ヘッダーなしで 401 を返す', async () => {
    const req = createMockRequest({
      body: createEventBody('INITIAL_PURCHASE', 'user-1'),
    })
    const res = createMockResponse()

    await handleRevenueCatWebhook(req, res as unknown as Response)

    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ error: 'Unauthorized' })
  })

  it('不正な Authorization ヘッダーで 401 を返す', async () => {
    const req = createMockRequest({
      body: createEventBody('INITIAL_PURCHASE', 'user-1'),
      headers: { authorization: 'Bearer wrong-value' } as Record<
        string,
        string
      >,
    })
    const res = createMockResponse()

    await handleRevenueCatWebhook(req, res as unknown as Response)

    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ error: 'Unauthorized' })
  })

  it('INITIAL_PURCHASE で subscription を active に更新する', async () => {
    const req = createMockRequest({
      body: createEventBody('INITIAL_PURCHASE', 'user-1'),
      headers: { authorization: AUTH_HEADER } as Record<string, string>,
    })
    const res = createMockResponse()

    await handleRevenueCatWebhook(req, res as unknown as Response)

    expect(res.statusCode).toBe(200)
    expect(mockCollection).toHaveBeenCalledWith('users')
    expect(mockDoc).toHaveBeenCalledWith('user-1')
    expect(mockSet).toHaveBeenCalledWith(
      {
        subscription: { status: 'active', updatedAt: expect.any(Date) },
      },
      { merge: true }
    )
  })

  it('RENEWAL で subscription を active に更新する', async () => {
    const req = createMockRequest({
      body: createEventBody('RENEWAL', 'user-2'),
      headers: { authorization: AUTH_HEADER } as Record<string, string>,
    })
    const res = createMockResponse()

    await handleRevenueCatWebhook(req, res as unknown as Response)

    expect(res.statusCode).toBe(200)
    expect(mockSet).toHaveBeenCalledWith(
      {
        subscription: { status: 'active', updatedAt: expect.any(Date) },
      },
      { merge: true }
    )
  })

  it('CANCELLATION で subscription を cancelled に更新する', async () => {
    const req = createMockRequest({
      body: createEventBody('CANCELLATION', 'user-3'),
      headers: { authorization: AUTH_HEADER } as Record<string, string>,
    })
    const res = createMockResponse()

    await handleRevenueCatWebhook(req, res as unknown as Response)

    expect(res.statusCode).toBe(200)
    expect(mockSet).toHaveBeenCalledWith(
      {
        subscription: { status: 'cancelled', cancelledAt: expect.any(Date) },
      },
      { merge: true }
    )
  })

  it('EXPIRATION で subscription を expired に更新する', async () => {
    const req = createMockRequest({
      body: createEventBody('EXPIRATION', 'user-4'),
      headers: { authorization: AUTH_HEADER } as Record<string, string>,
    })
    const res = createMockResponse()

    await handleRevenueCatWebhook(req, res as unknown as Response)

    expect(res.statusCode).toBe(200)
    expect(mockSet).toHaveBeenCalledWith(
      {
        subscription: { status: 'expired', expiredAt: expect.any(Date) },
      },
      { merge: true }
    )
  })

  it('未知のイベントタイプでも 200 を返す（Firestore 更新なし）', async () => {
    const req = createMockRequest({
      body: createEventBody('UNKNOWN_EVENT', 'user-5'),
      headers: { authorization: AUTH_HEADER } as Record<string, string>,
    })
    const res = createMockResponse()

    await handleRevenueCatWebhook(req, res as unknown as Response)

    expect(res.statusCode).toBe(200)
    expect(mockSet).not.toHaveBeenCalled()
  })

  it('Firestore エラー時に 500 を返す', async () => {
    mockSet.mockRejectedValueOnce(new Error('firestore down'))

    const req = createMockRequest({
      body: createEventBody('INITIAL_PURCHASE', 'user-6'),
      headers: { authorization: AUTH_HEADER } as Record<string, string>,
    })
    const res = createMockResponse()

    await handleRevenueCatWebhook(req, res as unknown as Response)

    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: 'Internal error' })
  })

  it('文字列 body も正しく処理する', async () => {
    const req = createMockRequest({
      body: JSON.stringify(createEventBody('INITIAL_PURCHASE', 'user-7')),
      headers: { authorization: AUTH_HEADER } as Record<string, string>,
    })
    const res = createMockResponse()

    await handleRevenueCatWebhook(req, res as unknown as Response)

    expect(res.statusCode).toBe(200)
    expect(mockDoc).toHaveBeenCalledWith('user-7')
  })
})
