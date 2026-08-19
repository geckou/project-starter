import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Response } from 'express'

const mockCustomersCreate = vi.fn()
const mockCheckoutCreate = vi.fn()
const mockPortalCreate = vi.fn()

vi.mock('stripe', () => ({
  default: class MockStripe {
    customers = { create: mockCustomersCreate }
    checkout = { sessions: { create: mockCheckoutCreate } }
    billingPortal = { sessions: { create: mockPortalCreate } }
  },
}))

const mockGetStripeCustomerId = vi.fn()
const mockSaveStripeCustomerId = vi.fn().mockResolvedValue(undefined)

vi.mock('../src/lib/subscription', () => ({
  getStripeCustomerId: (...args: unknown[]) => mockGetStripeCustomerId(...args),
  saveStripeCustomerId: (...args: unknown[]) =>
    mockSaveStripeCustomerId(...args),
}))

vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    getUser: vi.fn().mockResolvedValue({ email: 'user@example.com' }),
  }),
}))

import {
  handleCreateCheckoutSession,
  handleCreatePortalSession,
} from '../src/billing'
import { type AuthenticatedRequest } from '../src/lib/auth-middleware'

function createMockRequest(body: unknown = {}): AuthenticatedRequest {
  return { uid: 'user-1', body } as AuthenticatedRequest
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

describe('POST /billing/checkout', () => {
  beforeEach(() => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test')
    vi.stubEnv('STRIPE_PRICE_IDS', 'price_allowed,price_other')
    vi.stubEnv('STRIPE_SUCCESS_URL', 'https://example.com/billing?status=ok')
    vi.stubEnv('STRIPE_CANCEL_URL', 'https://example.com/billing?status=ng')
    vi.clearAllMocks()
    mockGetStripeCustomerId.mockResolvedValue('cus_existing')
    mockCheckoutCreate.mockResolvedValue({
      url: 'https://checkout.stripe.com/x',
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('Stripe 未設定なら 503 を返す', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '')
    const res = createMockResponse()

    await handleCreateCheckoutSession(
      createMockRequest({ priceId: 'price_allowed' }),
      res
    )

    expect(res.statusCode).toBe(503)
  })

  it('リダイレクト先 URL が未設定なら 500 を返す', async () => {
    vi.stubEnv('STRIPE_SUCCESS_URL', '')
    const res = createMockResponse()

    await handleCreateCheckoutSession(
      createMockRequest({ priceId: 'price_allowed' }),
      res
    )

    expect(res.statusCode).toBe(500)
  })

  it('許可リストにない priceId を 400 で拒否する', async () => {
    const res = createMockResponse()

    await handleCreateCheckoutSession(
      createMockRequest({ priceId: 'price_evil' }),
      res
    )

    expect(res.statusCode).toBe(400)
    expect(mockCheckoutCreate).not.toHaveBeenCalled()
  })

  it('priceId が文字列でなければ 400 を返す', async () => {
    const res = createMockResponse()

    await handleCreateCheckoutSession(createMockRequest({ priceId: 123 }), res)

    expect(res.statusCode).toBe(400)
  })

  it('許可された priceId で Checkout セッションを作り URL を返す', async () => {
    const res = createMockResponse()

    await handleCreateCheckoutSession(
      createMockRequest({ priceId: 'price_allowed' }),
      res
    )

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ url: 'https://checkout.stripe.com/x' })
  })

  it('Webhook が誰の購入か特定できるよう uid を metadata に入れる', async () => {
    const res = createMockResponse()

    await handleCreateCheckoutSession(
      createMockRequest({ priceId: 'price_allowed' }),
      res
    )

    expect(mockCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        customer: 'cus_existing',
        client_reference_id: 'user-1',
        metadata: { uid: 'user-1' },
        subscription_data: { metadata: { uid: 'user-1' } },
        // リダイレクト先はクライアント入力ではなく環境変数から取る
        success_url: 'https://example.com/billing?status=ok',
        cancel_url: 'https://example.com/billing?status=ng',
      })
    )
  })

  it('顧客が未作成なら作成して保存する', async () => {
    mockGetStripeCustomerId.mockResolvedValue(undefined)
    mockCustomersCreate.mockResolvedValue({ id: 'cus_new' })
    const res = createMockResponse()

    await handleCreateCheckoutSession(
      createMockRequest({ priceId: 'price_allowed' }),
      res
    )

    expect(mockCustomersCreate).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { uid: 'user-1' } })
    )
    expect(mockSaveStripeCustomerId).toHaveBeenCalledWith('user-1', 'cus_new')
  })

  it('Stripe API がエラーなら 500 を返す', async () => {
    mockCheckoutCreate.mockRejectedValue(new Error('Stripe down'))
    const res = createMockResponse()

    await handleCreateCheckoutSession(
      createMockRequest({ priceId: 'price_allowed' }),
      res
    )

    expect(res.statusCode).toBe(500)
  })
})

describe('POST /billing/portal', () => {
  beforeEach(() => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test')
    vi.stubEnv('STRIPE_PORTAL_RETURN_URL', 'https://example.com/billing')
    vi.clearAllMocks()
    mockGetStripeCustomerId.mockResolvedValue('cus_existing')
    mockPortalCreate.mockResolvedValue({ url: 'https://billing.stripe.com/x' })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('Stripe 未設定なら 503 を返す', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '')
    const res = createMockResponse()

    await handleCreatePortalSession(createMockRequest(), res)

    expect(res.statusCode).toBe(503)
  })

  it('戻り先 URL が未設定なら 500 を返す', async () => {
    vi.stubEnv('STRIPE_PORTAL_RETURN_URL', '')
    const res = createMockResponse()

    await handleCreatePortalSession(createMockRequest(), res)

    expect(res.statusCode).toBe(500)
  })

  it('Stripe で購入したことがないユーザーには 404 を返す', async () => {
    mockGetStripeCustomerId.mockResolvedValue(undefined)
    const res = createMockResponse()

    await handleCreatePortalSession(createMockRequest(), res)

    expect(res.statusCode).toBe(404)
    expect(mockPortalCreate).not.toHaveBeenCalled()
  })

  it('ポータルの URL を返す', async () => {
    const res = createMockResponse()

    await handleCreatePortalSession(createMockRequest(), res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ url: 'https://billing.stripe.com/x' })
  })
})
