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

describe('applySubscriptionEvent', () => {
  beforeEach(() => {
    store.clear()
  })

  it('新規イベントを users/{uid}.subscription に反映する', async () => {
    const result = await applySubscriptionEvent(createEvent())

    expect(result).toBe('applied')

    const subscription = store.get('users/user-1')?.subscription as Record<
      string,
      unknown
    >
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

    expect(result).toBe('duplicate')

    // 状態は最初のイベントのまま
    const subscription = store.get('users/user-1')?.subscription as Record<
      string,
      unknown
    >
    expect(subscription.status).toBe('active')
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

    expect(result).toBe('applied')
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

    expect(result).toBe('stale')

    const subscription = store.get('users/user-1')?.subscription as Record<
      string,
      unknown
    >
    expect(subscription.status).toBe('active')
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

    expect(result).toBe('applied')

    const subscription = store.get('users/user-1')?.subscription as Record<
      string,
      unknown
    >
    expect(subscription.status).toBe('expired')
  })

  it('ユーザードキュメントが未作成でも反映できる', async () => {
    const result = await applySubscriptionEvent(
      createEvent({ uid: 'brand-new-user' })
    )

    expect(result).toBe('applied')
    expect(store.has('users/brand-new-user')).toBe(true)
  })
})
