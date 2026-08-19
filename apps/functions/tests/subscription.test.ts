import { beforeEach, describe, expect, it, vi } from 'vitest'

// Firestore をインメモリの簡易ストアで置き換える。
// トランザクションは「渡された関数をそのまま実行する」形で再現する
type DocumentRef = { path: string }

const store = new Map<string, Record<string, unknown>>()

const transaction = {
  get: async (ref: DocumentRef) => {
    const data = store.get(ref.path)

    return {
      exists: data !== undefined,
      get: (field: string) => data?.[field],
    }
  },
  set: (
    ref: DocumentRef,
    data: Record<string, unknown>,
    options?: { merge?: boolean }
  ) => {
    const previous = options?.merge ? (store.get(ref.path) ?? {}) : {}
    store.set(ref.path, { ...previous, ...data })
  },
}

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: (name: string) => ({
      doc: (id: string) => ({ path: `${name}/${id}` }),
    }),
    runTransaction: (fn: (t: typeof transaction) => Promise<unknown>) =>
      fn(transaction),
  }),
}))

const mockSyncSubscriptionClaims = vi.fn().mockResolvedValue(undefined)
const mockOnUpgraded = vi.fn().mockResolvedValue(undefined)
const mockOnDowngraded = vi.fn().mockResolvedValue(undefined)

vi.mock('../src/lib/claims', () => ({
  syncSubscriptionClaims: (...args: unknown[]) =>
    mockSyncSubscriptionClaims(...args),
}))

vi.mock('../src/lib/entitlement-hooks', () => ({
  onSubscriptionUpgraded: (...args: unknown[]) => mockOnUpgraded(...args),
  onSubscriptionDowngraded: (...args: unknown[]) => mockOnDowngraded(...args),
}))

import { applySubscriptionEvent } from '../src/lib/subscription'

/** Firestore の Timestamp を模したオブジェクト（読み出し時はこの形で返る） */
function timestamp(date: Date) {
  return { toDate: () => date }
}

function createEvent(overrides: Record<string, unknown> = {}) {
  return {
    eventId: 'evt_1',
    source: 'stripe' as const,
    uid: 'user-1',
    occurredAt: new Date('2026-08-01T00:00:00Z'),
    subscription: {
      status: 'active' as const,
      source: 'stripe' as const,
      planId: 'price_abc',
      currentPeriodEnd: new Date('2026-09-01T00:00:00Z'),
      cancelAtPeriodEnd: false,
    },
    ...overrides,
  }
}

function readSubscription(uid: string) {
  return store.get(`users/${uid}`)?.subscription as Record<string, unknown>
}

describe('applySubscriptionEvent', () => {
  beforeEach(() => {
    store.clear()
    vi.clearAllMocks()
    mockSyncSubscriptionClaims.mockResolvedValue(undefined)
    mockOnUpgraded.mockResolvedValue(undefined)
    mockOnDowngraded.mockResolvedValue(undefined)
  })

  it('新規イベントを users/{uid}.subscription に反映する', async () => {
    const result = await applySubscriptionEvent(createEvent())

    expect(result.status).toBe('applied')

    const subscription = readSubscription('user-1')
    expect(subscription.status).toBe('active')
    expect(subscription.source).toBe('stripe')
    expect(subscription.planId).toBe('price_abc')
    expect(subscription.lastEventId).toBe('evt_1')
  })

  it('処理済みイベントを記録する', async () => {
    await applySubscriptionEvent(createEvent())

    expect(store.get('billing_events/stripe_evt_1')).toMatchObject({
      source: 'stripe',
      uid: 'user-1',
      applied: true,
    })
  })

  it('同じイベントを再送されても二重に適用しない', async () => {
    await applySubscriptionEvent(createEvent())
    const result = await applySubscriptionEvent(
      createEvent({
        subscription: {
          status: 'expired' as const,
          source: 'stripe' as const,
        },
      })
    )

    expect(result.status).toBe('duplicate')
    expect(readSubscription('user-1').status).toBe('active')
  })

  it('経路が違えば同じ eventId でも別イベントとして扱う', async () => {
    await applySubscriptionEvent(createEvent())
    const result = await applySubscriptionEvent(
      createEvent({
        source: 'revenuecat' as const,
        occurredAt: new Date('2026-08-02T00:00:00Z'),
        subscription: {
          status: 'active' as const,
          source: 'revenuecat' as const,
        },
      })
    )

    expect(result.status).toBe('applied')
    expect(store.has('billing_events/revenuecat_evt_1')).toBe(true)
  })

  it('反映済みより古いイベントで上書きしない', async () => {
    store.set('users/user-1', {
      subscription: {
        status: 'active',
        lastEventAt: timestamp(new Date('2026-08-10T00:00:00Z')),
      },
    })

    const result = await applySubscriptionEvent(
      createEvent({
        eventId: 'evt_old',
        occurredAt: new Date('2026-08-01T00:00:00Z'),
        subscription: { status: 'expired' as const, source: 'stripe' as const },
      })
    )

    expect(result.status).toBe('stale')
    expect(readSubscription('user-1').status).toBe('active')
  })

  it('古いイベントでもイベント自体は applied: false で記録する', async () => {
    store.set('users/user-1', {
      subscription: {
        status: 'active',
        lastEventAt: timestamp(new Date('2026-08-10T00:00:00Z')),
      },
    })

    await applySubscriptionEvent(
      createEvent({
        eventId: 'evt_old',
        occurredAt: new Date('2026-08-01T00:00:00Z'),
      })
    )

    expect(store.get('billing_events/stripe_evt_old')).toMatchObject({
      applied: false,
    })
  })

  it('新しいイベントは反映する', async () => {
    store.set('users/user-1', {
      subscription: {
        status: 'active',
        lastEventAt: timestamp(new Date('2026-08-01T00:00:00Z')),
      },
    })

    const result = await applySubscriptionEvent(
      createEvent({
        eventId: 'evt_new',
        occurredAt: new Date('2026-08-20T00:00:00Z'),
        subscription: { status: 'expired' as const, source: 'stripe' as const },
      })
    )

    expect(result.status).toBe('applied')
    expect(readSubscription('user-1').status).toBe('expired')
  })

  it('ユーザードキュメントが未作成でも反映できる', async () => {
    const result = await applySubscriptionEvent(
      createEvent({ uid: 'brand-new-user' })
    )

    expect(result.status).toBe('applied')
    expect(store.has('users/brand-new-user')).toBe(true)
  })
})

describe('権利変化の副作用', () => {
  beforeEach(() => {
    store.clear()
    vi.clearAllMocks()
    mockSyncSubscriptionClaims.mockResolvedValue(undefined)
    mockOnUpgraded.mockResolvedValue(undefined)
    mockOnDowngraded.mockResolvedValue(undefined)
  })

  it('反映時にカスタムクレームを同期する', async () => {
    await applySubscriptionEvent(createEvent())

    expect(mockSyncSubscriptionClaims).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ status: 'active', planId: 'price_abc' })
    )
  })

  it('無効 → 有効でアップグレードフックを呼ぶ', async () => {
    await applySubscriptionEvent(createEvent())

    expect(mockOnUpgraded).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ status: 'active' })
    )
    expect(mockOnDowngraded).not.toHaveBeenCalled()
  })

  it('有効 → 無効でダウングレードフックを呼ぶ', async () => {
    store.set('users/user-1', { subscription: { status: 'active' } })

    await applySubscriptionEvent(
      createEvent({
        eventId: 'evt_expire',
        subscription: { status: 'expired' as const, source: 'stripe' as const },
      })
    )

    expect(mockOnDowngraded).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ status: 'expired' })
    )
    expect(mockOnUpgraded).not.toHaveBeenCalled()
  })

  it('有効のまま更新された場合はどちらのフックも呼ばない', async () => {
    store.set('users/user-1', { subscription: { status: 'active' } })

    await applySubscriptionEvent(createEvent({ eventId: 'evt_renew' }))

    expect(mockOnUpgraded).not.toHaveBeenCalled()
    expect(mockOnDowngraded).not.toHaveBeenCalled()
  })

  it('cancelled でも期間内なら有効のままなのでフックを呼ばない', async () => {
    store.set('users/user-1', { subscription: { status: 'active' } })

    await applySubscriptionEvent(
      createEvent({
        eventId: 'evt_cancel',
        subscription: {
          status: 'cancelled' as const,
          source: 'stripe' as const,
          currentPeriodEnd: new Date('2099-01-01T00:00:00Z'),
        },
      })
    )

    expect(mockOnDowngraded).not.toHaveBeenCalled()
  })

  it('duplicate / stale ではフックもクレーム同期も走らない', async () => {
    await applySubscriptionEvent(createEvent())
    vi.clearAllMocks()

    await applySubscriptionEvent(createEvent())

    expect(mockSyncSubscriptionClaims).not.toHaveBeenCalled()
    expect(mockOnUpgraded).not.toHaveBeenCalled()
    expect(mockOnDowngraded).not.toHaveBeenCalled()
  })

  it('クレーム同期が失敗しても反映は成功扱いにする', async () => {
    mockSyncSubscriptionClaims.mockRejectedValue(new Error('auth down'))

    const result = await applySubscriptionEvent(createEvent())

    expect(result.status).toBe('applied')
    expect(readSubscription('user-1').status).toBe('active')
  })

  it('フックが例外を投げても反映は成功扱いにする', async () => {
    mockOnUpgraded.mockRejectedValue(new Error('cleanup failed'))

    const result = await applySubscriptionEvent(createEvent())

    expect(result.status).toBe('applied')
  })
})
