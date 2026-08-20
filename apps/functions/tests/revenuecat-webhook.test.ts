import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Request, type Response } from 'express'

// applySubscriptionEvent の戻り値は ApplyResult（実装と同じ形にしておく）
const mockApplySubscriptionEvent = vi
  .fn()
  .mockResolvedValue({ status: 'applied', wasActive: false, isActive: true })

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
    mockApplySubscriptionEvent.mockResolvedValue({
      status: 'applied',
      wasActive: false,
      isActive: true,
    })
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

  it('event.id があればそれを冪等性キーに使う', async () => {
    const res = createMockResponse()

    await handleRevenueCatWebhook(
      createMockRequest({
        headers: { authorization: AUTH_HEADER },
        body: createEventBody('RENEWAL', 'user-1'),
      }),
      res
    )

    expect(mockApplySubscriptionEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'rc_evt_1' })
    )
  })

  it('event.id が無い場合、同じペイロードなら同じ冪等性キーになる', async () => {
    const send = async () => {
      const body = createEventBody('RENEWAL', 'user-1')
      delete (body.event as Record<string, unknown>).id

      await handleRevenueCatWebhook(
        createMockRequest({ headers: { authorization: AUTH_HEADER }, body }),
        createMockResponse()
      )
    }

    await send()
    await send()

    const [first, second] = mockApplySubscriptionEvent.mock.calls
    expect(first[0].eventId).toBe(second[0].eventId)
  })

  it('event.id も時刻も無い別イベント同士が同じキーに衝突しない', async () => {
    // 種別 + uid + 0 のような固定値をキーにすると衝突し、
    // 2件目以降が duplicate として捨てられてしまう
    const send = async (type: string) => {
      const body = createEventBody(type, 'user-1')
      delete (body.event as Record<string, unknown>).id
      delete (body.event as Record<string, unknown>).event_timestamp_ms

      await handleRevenueCatWebhook(
        createMockRequest({ headers: { authorization: AUTH_HEADER }, body }),
        createMockResponse()
      )
    }

    await send('RENEWAL')
    await send('CANCELLATION')

    const [first, second] = mockApplySubscriptionEvent.mock.calls
    expect(first[0].eventId).not.toBe(second[0].eventId)
  })

  it('event_timestamp_ms が数値でなければ Invalid Date にせず受信時刻を使う', async () => {
    const res = createMockResponse()

    await handleRevenueCatWebhook(
      createMockRequest({
        headers: { authorization: AUTH_HEADER },
        body: createEventBody('RENEWAL', 'user-1', {
          event_timestamp_ms: 'not-a-number',
        }),
      }),
      res
    )

    const { occurredAt } = mockApplySubscriptionEvent.mock.calls[0][0]
    expect(occurredAt).toBeInstanceOf(Date)
    expect(Number.isNaN(occurredAt.getTime())).toBe(false)
  })

  it('expiration_at_ms が数値でなければ currentPeriodEnd を設定しない', async () => {
    const res = createMockResponse()

    await handleRevenueCatWebhook(
      createMockRequest({
        headers: { authorization: AUTH_HEADER },
        body: createEventBody('CANCELLATION', 'user-1', {
          expiration_at_ms: null,
        }),
      }),
      res
    )

    expect(mockApplySubscriptionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        subscription: expect.objectContaining({ currentPeriodEnd: undefined }),
      })
    )
  })

  it('entitlement_ids が配列でなければ planId を設定しない', async () => {
    const res = createMockResponse()

    await handleRevenueCatWebhook(
      createMockRequest({
        headers: { authorization: AUTH_HEADER },
        body: createEventBody('RENEWAL', 'user-1', {
          entitlement_ids: 'pro',
        }),
      }),
      res
    )

    expect(mockApplySubscriptionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        subscription: expect.objectContaining({ planId: undefined }),
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
