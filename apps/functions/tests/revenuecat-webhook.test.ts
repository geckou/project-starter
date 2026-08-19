import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Request, type Response } from 'express'

const mockApplySubscriptionEvent = vi.fn().mockResolvedValue('applied')

vi.mock('../src/lib/subscription', () => ({
  applySubscriptionEvent: (...args: unknown[]) =>
    mockApplySubscriptionEvent(...args),
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

function createEventBody(
  type: string,
  userId: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    event: {
      id: 'rc_evt_1',
      type,
      app_user_id: userId,
      event_timestamp_ms: 1_754_000_000_000,
      entitlement_ids: ['pro'],
      ...overrides,
    },
  }
}

describe('RevenueCat Webhook', () => {
  // RevenueCat Dashboard で設定する Authorization ヘッダー値
  const AUTH_HEADER = 'Bearer test-webhook-auth'

  beforeEach(() => {
    vi.stubEnv('REVENUECAT_WEBHOOK_AUTH', AUTH_HEADER)
    vi.clearAllMocks()
    mockApplySubscriptionEvent.mockResolvedValue('applied')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('REVENUECAT_WEBHOOK_AUTH 未設定で 500 を返す', async () => {
    vi.stubEnv('REVENUECAT_WEBHOOK_AUTH', '')
    const res = createMockResponse()

    await handleRevenueCatWebhook(createMockRequest(), res)

    expect(res.statusCode).toBe(500)
  })

  it('Authorization ヘッダーなしで 401 を返す', async () => {
    const res = createMockResponse()

    await handleRevenueCatWebhook(createMockRequest(), res)

    expect(res.statusCode).toBe(401)
    expect(mockApplySubscriptionEvent).not.toHaveBeenCalled()
  })

  it('不正な Authorization ヘッダーで 401 を返す', async () => {
    const res = createMockResponse()

    await handleRevenueCatWebhook(
      createMockRequest({
        headers: { authorization: 'Bearer wrong-value-xx' },
      }),
      res
    )

    expect(res.statusCode).toBe(401)
  })

  it('INITIAL_PURCHASE を active として反映する', async () => {
    const res = createMockResponse()

    await handleRevenueCatWebhook(
      createMockRequest({
        headers: { authorization: AUTH_HEADER },
        body: createEventBody('INITIAL_PURCHASE', 'user-1', {
          expiration_at_ms: 1_756_000_000_000,
        }),
      }),
      res
    )

    expect(res.statusCode).toBe(200)
    expect(mockApplySubscriptionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'rc_evt_1',
        source: 'revenuecat',
        uid: 'user-1',
        subscription: expect.objectContaining({
          status: 'active',
          source: 'revenuecat',
          planId: 'pro',
          currentPeriodEnd: new Date(1_756_000_000_000),
        }),
      })
    )
  })

  it('RENEWAL を active として反映する', async () => {
    const res = createMockResponse()

    await handleRevenueCatWebhook(
      createMockRequest({
        headers: { authorization: AUTH_HEADER },
        body: createEventBody('RENEWAL', 'user-1'),
      }),
      res
    )

    expect(mockApplySubscriptionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        subscription: expect.objectContaining({ status: 'active' }),
      })
    )
  })

  it('CANCELLATION は cancelled（期間終了までは有効）として反映する', async () => {
    const res = createMockResponse()

    await handleRevenueCatWebhook(
      createMockRequest({
        headers: { authorization: AUTH_HEADER },
        body: createEventBody('CANCELLATION', 'user-1'),
      }),
      res
    )

    expect(mockApplySubscriptionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        subscription: expect.objectContaining({
          status: 'cancelled',
          cancelAtPeriodEnd: true,
        }),
      })
    )
  })

  it('BILLING_ISSUE を in_grace_period として反映する', async () => {
    const res = createMockResponse()

    await handleRevenueCatWebhook(
      createMockRequest({
        headers: { authorization: AUTH_HEADER },
        body: createEventBody('BILLING_ISSUE', 'user-1'),
      }),
      res
    )

    expect(mockApplySubscriptionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        subscription: expect.objectContaining({ status: 'in_grace_period' }),
      })
    )
  })

  it('EXPIRATION を expired として反映する', async () => {
    const res = createMockResponse()

    await handleRevenueCatWebhook(
      createMockRequest({
        headers: { authorization: AUTH_HEADER },
        body: createEventBody('EXPIRATION', 'user-1'),
      }),
      res
    )

    expect(mockApplySubscriptionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        subscription: expect.objectContaining({ status: 'expired' }),
      })
    )
  })

  it('UNCANCELLATION を active として反映する', async () => {
    const res = createMockResponse()

    await handleRevenueCatWebhook(
      createMockRequest({
        headers: { authorization: AUTH_HEADER },
        body: createEventBody('UNCANCELLATION', 'user-1'),
      }),
      res
    )

    expect(mockApplySubscriptionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        subscription: expect.objectContaining({ status: 'active' }),
      })
    )
  })

  it('未知のイベントタイプでも 200 を返す（Firestore 更新なし）', async () => {
    const res = createMockResponse()

    await handleRevenueCatWebhook(
      createMockRequest({
        headers: { authorization: AUTH_HEADER },
        body: createEventBody('TRANSFER', 'user-1'),
      }),
      res
    )

    expect(res.statusCode).toBe(200)
    expect(mockApplySubscriptionEvent).not.toHaveBeenCalled()
  })

  it('event.id がない場合は種別・ユーザー・時刻から冪等性キーを作る', async () => {
    const body = createEventBody('RENEWAL', 'user-1')
    delete (body.event as Record<string, unknown>).id

    const res = createMockResponse()

    await handleRevenueCatWebhook(
      createMockRequest({ headers: { authorization: AUTH_HEADER }, body }),
      res
    )

    expect(mockApplySubscriptionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'RENEWAL_user-1_1754000000000',
      })
    )
  })

  it('Firestore エラー時に 500 を返す', async () => {
    mockApplySubscriptionEvent.mockRejectedValue(new Error('Firestore down'))
    const res = createMockResponse()

    await handleRevenueCatWebhook(
      createMockRequest({
        headers: { authorization: AUTH_HEADER },
        body: createEventBody('RENEWAL', 'user-1'),
      }),
      res
    )

    expect(res.statusCode).toBe(500)
  })

  it('不正な JSON の body で 400 を返す', async () => {
    const res = createMockResponse()

    await handleRevenueCatWebhook(
      createMockRequest({
        headers: { authorization: AUTH_HEADER },
        body: Buffer.from('{ broken'),
      }),
      res
    )

    expect(res.statusCode).toBe(400)
  })

  it('event の形が想定外の payload で 400 を返す', async () => {
    const res = createMockResponse()

    await handleRevenueCatWebhook(
      createMockRequest({
        headers: { authorization: AUTH_HEADER },
        body: { event: { type: 'RENEWAL' } },
      }),
      res
    )

    expect(res.statusCode).toBe(400)
  })

  it('文字列 body も正しく処理する', async () => {
    const res = createMockResponse()

    await handleRevenueCatWebhook(
      createMockRequest({
        headers: { authorization: AUTH_HEADER },
        body: JSON.stringify(createEventBody('RENEWAL', 'user-1')),
      }),
      res
    )

    expect(res.statusCode).toBe(200)
    expect(mockApplySubscriptionEvent).toHaveBeenCalled()
  })
})
