import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Subscription } from '@geckou/shared'

const mockGetUser = vi.fn()
const mockSetCustomUserClaims = vi.fn().mockResolvedValue(undefined)

vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    getUser: (...args: unknown[]) => mockGetUser(...args),
    setCustomUserClaims: (...args: unknown[]) =>
      mockSetCustomUserClaims(...args),
  }),
}))

import { isClaimsSyncEnabled, syncSubscriptionClaims } from '../src/lib/claims'

function createSubscription(
  overrides: Partial<Subscription> = {}
): Subscription {
  return {
    status: 'active',
    source: 'stripe',
    planId: 'pro',
    updatedAt: new Date('2026-08-19T00:00:00Z'),
    ...overrides,
  }
}

describe('syncSubscriptionClaims', () => {
  beforeEach(() => {
    vi.stubEnv('SYNC_SUBSCRIPTION_CLAIMS', 'true')
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ customClaims: undefined })
    mockSetCustomUserClaims.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('有効な権利を subscriptionActive: true として書き込む', async () => {
    await syncSubscriptionClaims('user-1', createSubscription())

    expect(mockSetCustomUserClaims).toHaveBeenCalledWith('user-1', {
      subscriptionActive: true,
      plan: 'pro',
    })
  })

  it('失効した権利を subscriptionActive: false として書き込む', async () => {
    await syncSubscriptionClaims(
      'user-1',
      createSubscription({ status: 'expired' })
    )

    expect(mockSetCustomUserClaims).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ subscriptionActive: false })
    )
  })

  it('既存のクレームを消さずにマージする', async () => {
    // setCustomUserClaims は全置換なので、role 等を巻き添えにしないこと
    mockGetUser.mockResolvedValue({
      customClaims: { role: 'admin', subscriptionActive: false },
    })

    await syncSubscriptionClaims('user-1', createSubscription())

    expect(mockSetCustomUserClaims).toHaveBeenCalledWith('user-1', {
      role: 'admin',
      subscriptionActive: true,
      plan: 'pro',
    })
  })

  it('planId が無ければ plan は null にする', async () => {
    await syncSubscriptionClaims(
      'user-1',
      createSubscription({ planId: undefined })
    )

    expect(mockSetCustomUserClaims).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ plan: null })
    )
  })

  it('cancelled でも期間内なら subscriptionActive: true', async () => {
    await syncSubscriptionClaims(
      'user-1',
      createSubscription({
        status: 'cancelled',
        currentPeriodEnd: new Date('2099-01-01T00:00:00Z'),
      })
    )

    expect(mockSetCustomUserClaims).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ subscriptionActive: true })
    )
  })
})

describe('SYNC_SUBSCRIPTION_CLAIMS', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ customClaims: undefined })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('未設定なら無効', () => {
    expect(isClaimsSyncEnabled()).toBe(false)
  })

  it("'true' のときだけ有効", () => {
    vi.stubEnv('SYNC_SUBSCRIPTION_CLAIMS', 'true')
    expect(isClaimsSyncEnabled()).toBe(true)

    vi.stubEnv('SYNC_SUBSCRIPTION_CLAIMS', '1')
    expect(isClaimsSyncEnabled()).toBe(false)
  })

  it('無効なら Auth にアクセスしない', async () => {
    await syncSubscriptionClaims('user-1', createSubscription())

    expect(mockGetUser).not.toHaveBeenCalled()
    expect(mockSetCustomUserClaims).not.toHaveBeenCalled()
  })
})
