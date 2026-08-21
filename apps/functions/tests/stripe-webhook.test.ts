import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Request, type Response } from 'express'

const mockConstructEvent = vi.fn()

vi.mock('stripe', () => ({
  default: class MockStripe {
    webhooks = { constructEvent: mockConstructEvent }
  },
}))

// applySubscriptionEvent の戻り値は ApplyResult（実装と同じ形にしておく）
const mockApplySubscriptionEvent = vi
  .fn()
  .mockResolvedValue({ status: 'applied', wasActive: false, isActive: true })
const mockSaveStripeCustomerId = vi.fn().mockResolvedValue(undefined)

vi.mock('../src/lib/subscription', () => ({
  applySubscriptionEvent: (...args: unknown[]) =>
    mockApplySubscriptionEvent(...args),
  saveStripeCustomerId: (...args: unknown[]) =>
    mockSaveStripeCustomerId(...args),
}))

import { handleStripeWebhook } from '../src/stripe-webhook'

function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    body: Buffer.from('{}'),
    headers: { 'stripe-signature': 'sig_test' },
    ...overrides,
  } as Request
}

function createMockResponse(): Response & {
  statusCode: number
  body: unknown
} {
  const res = {
    statusCode: 200,
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

/** Stripe の Subscription オブジェクトを模した最小構造 */
function createSubscriptionEvent(
  type: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    id: 'evt_test',
    type,
    created: 1_754_000_000,
    data: {
      object: {
        id: 'sub_test',
        status: 'active',
        cancel_at_period_end: false,
        metadata: { uid: 'user-1' },
        items: {
          data: [
            {
              current_period_end: 1_756_000_000,
              price: { id: 'price_abc' },
            },
          ],
        },
        ...overrides,
      },
    },
  }
}

describe('Stripe Webhook', () => {
  beforeEach(() => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test')
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test')
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

  it('STRIPE_SECRET_KEY 未設定で 500 を返す', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '')
    const res = createMockResponse()

    await handleStripeWebhook(createMockRequest(), res)

    expect(res.statusCode).toBe(500)
  })

  it('STRIPE_WEBHOOK_SECRET 未設定で 500 を返す', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '')
    const res = createMockResponse()

    await handleStripeWebhook(createMockRequest(), res)

    expect(res.statusCode).toBe(500)
  })

  it('stripe-signature ヘッダーなしで 400 を返す', async () => {
    const res = createMockResponse()

    await handleStripeWebhook(createMockRequest({ headers: {} }), res)

    expect(res.statusCode).toBe(400)
    expect(mockConstructEvent).not.toHaveBeenCalled()
  })

  it('署名検証に失敗すると 400 を返す', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error('Invalid signature')
    })
    const res = createMockResponse()

    await handleStripeWebhook(createMockRequest(), res)

    expect(res.statusCode).toBe(400)
    expect(mockApplySubscriptionEvent).not.toHaveBeenCalled()
  })

  it('customer.subscription.created を active として反映する', async () => {
    mockConstructEvent.mockReturnValue(
      createSubscriptionEvent('customer.subscription.created')
    )
    const res = createMockResponse()

    await handleStripeWebhook(createMockRequest(), res)

    expect(res.statusCode).toBe(200)
    expect(mockApplySubscriptionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'evt_test',
        source: 'stripe',
        uid: 'user-1',
        subscription: expect.objectContaining({
          status: 'active',
          planId: 'price_abc',
          currentPeriodEnd: new Date(1_756_000_000 * 1000),
        }),
      })
    )
  })

  it('past_due を in_grace_period に変換する', async () => {
    mockConstructEvent.mockReturnValue(
      createSubscriptionEvent('customer.subscription.updated', {
        status: 'past_due',
      })
    )
    const res = createMockResponse()

    await handleStripeWebhook(createMockRequest(), res)

    expect(mockApplySubscriptionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        subscription: expect.objectContaining({ status: 'in_grace_period' }),
      })
    )
  })

  it('unpaid を expired に変換する（リトライ枯渇後は猶予期間としない）', async () => {
    mockConstructEvent.mockReturnValue(
      createSubscriptionEvent('customer.subscription.updated', {
        status: 'unpaid',
      })
    )
    const res = createMockResponse()

    await handleStripeWebhook(createMockRequest(), res)

    expect(mockApplySubscriptionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        subscription: expect.objectContaining({ status: 'expired' }),
      })
    )
  })

  it('canceled を cancelled に変換する（綴りの違いを吸収する）', async () => {
    mockConstructEvent.mockReturnValue(
      createSubscriptionEvent('customer.subscription.updated', {
        status: 'canceled',
        cancel_at_period_end: true,
      })
    )
    const res = createMockResponse()

    await handleStripeWebhook(createMockRequest(), res)

    expect(mockApplySubscriptionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        subscription: expect.objectContaining({
          status: 'cancelled',
          cancelAtPeriodEnd: true,
        }),
      })
    )
  })

  it('customer.subscription.deleted は status に関わらず expired にする', async () => {
    mockConstructEvent.mockReturnValue(
      createSubscriptionEvent('customer.subscription.deleted', {
        status: 'active',
      })
    )
    const res = createMockResponse()

    await handleStripeWebhook(createMockRequest(), res)

    expect(mockApplySubscriptionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        subscription: expect.objectContaining({ status: 'expired' }),
      })
    )
  })

  it('current_period_end が Subscription 直下にある旧形式も読める', async () => {
    mockConstructEvent.mockReturnValue(
      createSubscriptionEvent('customer.subscription.updated', {
        current_period_end: 1_757_000_000,
        items: { data: [{ price: { id: 'price_abc' } }] },
      })
    )
    const res = createMockResponse()

    await handleStripeWebhook(createMockRequest(), res)

    expect(mockApplySubscriptionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        subscription: expect.objectContaining({
          currentPeriodEnd: new Date(1_757_000_000 * 1000),
        }),
      })
    )
  })

  it('uid metadata がない場合は反映せず 200 を返す（再送を止める）', async () => {
    mockConstructEvent.mockReturnValue(
      createSubscriptionEvent('customer.subscription.updated', {
        metadata: {},
      })
    )
    const res = createMockResponse()

    await handleStripeWebhook(createMockRequest(), res)

    expect(res.statusCode).toBe(200)
    expect(mockApplySubscriptionEvent).not.toHaveBeenCalled()
  })

  it('checkout.session.completed で顧客 ID を保存する', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_checkout',
      type: 'checkout.session.completed',
      created: 1_754_000_000,
      data: {
        object: {
          id: 'cs_test',
          client_reference_id: 'user-1',
          customer: 'cus_test',
        },
      },
    })
    const res = createMockResponse()

    await handleStripeWebhook(createMockRequest(), res)

    expect(res.statusCode).toBe(200)
    expect(mockSaveStripeCustomerId).toHaveBeenCalledWith('user-1', 'cus_test')
  })

  it('未知のイベントでも 200 を返す', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_other',
      type: 'invoice.created',
      created: 1_754_000_000,
      data: { object: {} },
    })
    const res = createMockResponse()

    await handleStripeWebhook(createMockRequest(), res)

    expect(res.statusCode).toBe(200)
    expect(mockApplySubscriptionEvent).not.toHaveBeenCalled()
  })

  it('Firestore エラー時に 500 を返す', async () => {
    mockConstructEvent.mockReturnValue(
      createSubscriptionEvent('customer.subscription.updated')
    )
    mockApplySubscriptionEvent.mockRejectedValue(new Error('Firestore down'))
    const res = createMockResponse()

    await handleStripeWebhook(createMockRequest(), res)

    expect(res.statusCode).toBe(500)
  })
})
