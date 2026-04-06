import crypto from 'crypto'
import { type Request, type Response } from 'express'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// firebase-admin/firestore をモック
const mockUpdate = vi.fn().mockResolvedValue(undefined)
const mockDoc = vi.fn().mockReturnValue({ update: mockUpdate })
const mockCollection = vi.fn().mockReturnValue({ doc: mockDoc })

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: mockCollection,
  }),
}))

import { handleRevenueCatWebhook } from '../src/revenuecat-webhook'

// テスト用ヘルパー
function createSignature(body: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('base64')
}

function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    body: '',
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

describe('RevenueCat Webhook', () => {
  const WEBHOOK_SECRET = 'test-secret-key'

  beforeEach(() => {
    vi.stubEnv('REVENUECAT_WEBHOOK_SECRET', WEBHOOK_SECRET)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('シークレット未設定で 500 を返す', async () => {
    vi.stubEnv('REVENUECAT_WEBHOOK_SECRET', '')
    delete process.env.REVENUECAT_WEBHOOK_SECRET

    const req = createMockRequest()
    const res = createMockResponse()

    await handleRevenueCatWebhook(req, res as unknown as Response)

    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: 'Webhook secret not configured' })
  })

  it('不正な署名で 401 を返す', async () => {
    const body = JSON.stringify({
      event: {
        type: 'INITIAL_PURCHASE',
        app_user_id: 'user-1',
        timestamp: 123,
      },
    })

    const req = createMockRequest({
      body: body,
      headers: { 'x-revenuecat-signature': 'invalid-signature' } as Record<
        string,
        string
      >,
    })
    const res = createMockResponse()

    await handleRevenueCatWebhook(req, res as unknown as Response)

    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ error: 'Invalid signature' })
  })

  it('INITIAL_PURCHASE で subscription を active に更新する', async () => {
    const body = JSON.stringify({
      event: {
        type: 'INITIAL_PURCHASE',
        app_user_id: 'user-1',
        timestamp: 123,
      },
    })
    const signature = createSignature(body, WEBHOOK_SECRET)

    const req = createMockRequest({
      body: body,
      headers: { 'x-revenuecat-signature': signature } as Record<
        string,
        string
      >,
    })
    const res = createMockResponse()

    await handleRevenueCatWebhook(req, res as unknown as Response)

    expect(res.statusCode).toBe(200)
    expect(mockCollection).toHaveBeenCalledWith('users')
    expect(mockDoc).toHaveBeenCalledWith('user-1')
    expect(mockUpdate).toHaveBeenCalledWith({
      'subscription.status': 'active',
      'subscription.updatedAt': expect.any(Date),
    })
  })

  it('RENEWAL で subscription を active に更新する', async () => {
    const body = JSON.stringify({
      event: { type: 'RENEWAL', app_user_id: 'user-2', timestamp: 456 },
    })
    const signature = createSignature(body, WEBHOOK_SECRET)

    const req = createMockRequest({
      body: body,
      headers: { 'x-revenuecat-signature': signature } as Record<
        string,
        string
      >,
    })
    const res = createMockResponse()

    await handleRevenueCatWebhook(req, res as unknown as Response)

    expect(res.statusCode).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith({
      'subscription.status': 'active',
      'subscription.updatedAt': expect.any(Date),
    })
  })

  it('CANCELLATION で subscription を cancelled に更新する', async () => {
    const body = JSON.stringify({
      event: { type: 'CANCELLATION', app_user_id: 'user-3', timestamp: 789 },
    })
    const signature = createSignature(body, WEBHOOK_SECRET)

    const req = createMockRequest({
      body: body,
      headers: { 'x-revenuecat-signature': signature } as Record<
        string,
        string
      >,
    })
    const res = createMockResponse()

    await handleRevenueCatWebhook(req, res as unknown as Response)

    expect(res.statusCode).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith({
      'subscription.status': 'cancelled',
      'subscription.cancelledAt': expect.any(Date),
    })
  })

  it('EXPIRATION で subscription を expired に更新する', async () => {
    const body = JSON.stringify({
      event: { type: 'EXPIRATION', app_user_id: 'user-4', timestamp: 999 },
    })
    const signature = createSignature(body, WEBHOOK_SECRET)

    const req = createMockRequest({
      body: body,
      headers: { 'x-revenuecat-signature': signature } as Record<
        string,
        string
      >,
    })
    const res = createMockResponse()

    await handleRevenueCatWebhook(req, res as unknown as Response)

    expect(res.statusCode).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith({
      'subscription.status': 'expired',
      'subscription.expiredAt': expect.any(Date),
    })
  })

  it('未知のイベントタイプでも 200 を返す（Firestore 更新なし）', async () => {
    const body = JSON.stringify({
      event: { type: 'UNKNOWN_EVENT', app_user_id: 'user-5', timestamp: 111 },
    })
    const signature = createSignature(body, WEBHOOK_SECRET)

    const req = createMockRequest({
      body: body,
      headers: { 'x-revenuecat-signature': signature } as Record<
        string,
        string
      >,
    })
    const res = createMockResponse()

    await handleRevenueCatWebhook(req, res as unknown as Response)

    expect(res.statusCode).toBe(200)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('Buffer 形式の body を正しく処理する', async () => {
    const bodyString = JSON.stringify({
      event: {
        type: 'INITIAL_PURCHASE',
        app_user_id: 'user-6',
        timestamp: 222,
      },
    })
    const signature = createSignature(bodyString, WEBHOOK_SECRET)

    const req = createMockRequest({
      body: Buffer.from(bodyString),
      headers: { 'x-revenuecat-signature': signature } as Record<
        string,
        string
      >,
    })
    const res = createMockResponse()

    await handleRevenueCatWebhook(req, res as unknown as Response)

    expect(res.statusCode).toBe(200)
    expect(mockDoc).toHaveBeenCalledWith('user-6')
  })
})
