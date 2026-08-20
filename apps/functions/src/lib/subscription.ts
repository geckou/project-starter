import type { Subscription, SubscriptionSource } from '@geckou/shared'
import { isSubscriptionActive } from '@geckou/shared'
import { getFirestore } from 'firebase-admin/firestore'

import { syncSubscriptionClaims } from './claims'
import {
  onSubscriptionDowngraded,
  onSubscriptionUpgraded,
} from './entitlement-hooks'

/** Webhook から渡される、経路非依存に正規化済みのイベント */
export type SubscriptionEvent = {
  /** プロバイダ側のイベント ID（冪等性キー） */
  eventId: string
  source: SubscriptionSource
  /** Firebase Auth の uid */
  uid: string
  /** プロバイダ側でイベントが発生した日時（順序制御に使う） */
  occurredAt: Date
  /** 反映する権利状態（updatedAt / lastEvent* はこの関数が付与する） */
  subscription: Omit<Subscription, 'updatedAt' | 'lastEventId' | 'lastEventAt'>
}

export type ApplyStatus = 'applied' | 'duplicate' | 'stale'

export type ApplyResult = {
  status: ApplyStatus
  /** 適用前に権利が有効だったか */
  wasActive: boolean
  /** 適用後に権利が有効か（適用しなかった場合は wasActive と同じ） */
  isActive: boolean
}

/** 処理済みイベントを記録するコレクション（冪等性のため） */
const BILLING_EVENTS_COLLECTION = 'billing_events'

/**
 * 値が undefined のキーを取り除く。
 * Firestore は undefined を値として受け付けず書き込みが throw するため、
 * 任意項目（planId / currentPeriodEnd 等）が無いイベントでも安全に書けるようにする
 */
function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined)
  ) as T
}

/**
 * Firestore から読み出した日時を Date に正規化する。
 * 通常は Timestamp が返るが、Date のまま渡ってくる経路もあるため両方を受ける。
 */
function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value

  if (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate()
  }

  return null
}

/**
 * サブスクリプションイベントを users/{uid}.subscription に反映する。
 *
 * Webhook は再送されるため、以下をトランザクションで保証する:
 * - 同じ eventId を二重に適用しない（duplicate）
 * - 既に反映済みのイベントより古いイベントで上書きしない（stale）
 *
 * 反映が確定した後に、カスタムクレームの同期と権利変化フックを実行する。
 * これらはトランザクションの外で行う（時間がかかる処理を含みうるため）。
 */
export async function applySubscriptionEvent(
  event: SubscriptionEvent
): Promise<ApplyResult> {
  const db = getFirestore()
  const eventRef = db
    .collection(BILLING_EVENTS_COLLECTION)
    .doc(`${event.source}_${event.eventId}`)
  const userRef = db.collection('users').doc(event.uid)

  const next: Subscription = omitUndefined({
    ...event.subscription,
    updatedAt: new Date(),
    lastEventId: event.eventId,
    lastEventAt: event.occurredAt,
  })

  const result = await db.runTransaction<ApplyResult>(async (transaction) => {
    // Firestore のトランザクションは全ての read を write より先に行う必要がある
    const [eventSnapshot, userSnapshot] = await Promise.all([
      transaction.get(eventRef),
      transaction.get(userRef),
    ])

    const current = userSnapshot.get('subscription') as Subscription | undefined
    const wasActive = isSubscriptionActive(current)

    if (eventSnapshot.exists) {
      return { status: 'duplicate', wasActive, isActive: wasActive }
    }

    const lastEventAt = toDate(current?.lastEventAt)
    const isStale =
      lastEventAt !== null && lastEventAt.getTime() > event.occurredAt.getTime()

    // stale でもイベント自体は記録して、再送のたびに読み直さないようにする
    transaction.set(eventRef, {
      source: event.source,
      eventId: event.eventId,
      uid: event.uid,
      occurredAt: event.occurredAt,
      applied: !isStale,
      processedAt: new Date(),
    })

    if (isStale) {
      return { status: 'stale', wasActive, isActive: wasActive }
    }

    // update ではなく set + mergeFields を使う（ドキュメント未作成時に throw するため）。
    // merge: true だと subscription マップが深いマージになり、今回のイベントに
    // 無いキー（例: 解約時の currentPeriodEnd）に前の値が残ってしまうため、
    // subscription フィールドはまるごと置き換える
    transaction.set(
      userRef,
      { subscription: next },
      { mergeFields: ['subscription'] }
    )

    return {
      status: 'applied',
      wasActive,
      isActive: isSubscriptionActive(next),
    }
  })

  if (result.status === 'applied') {
    await runPostApplyEffects(event.uid, next, result)
  }

  return result
}

/**
 * 反映確定後の副作用。
 *
 * ここでの失敗は Webhook を 500 にしない。権利状態（正）は既に Firestore に
 * 書き込み済みで、再送させても同じイベント ID は duplicate になるため。
 */
async function runPostApplyEffects(
  uid: string,
  subscription: Subscription,
  result: ApplyResult
): Promise<void> {
  try {
    await syncSubscriptionClaims(uid, subscription)
  } catch (error) {
    console.error(`Failed to sync custom claims for ${uid}`, error)
  }

  try {
    if (!result.wasActive && result.isActive) {
      await onSubscriptionUpgraded(uid, subscription)
    } else if (result.wasActive && !result.isActive) {
      await onSubscriptionDowngraded(uid, subscription)
    }
  } catch (error) {
    console.error(`Entitlement hook failed for ${uid}`, error)
  }
}

/** Stripe の顧客 ID をユーザーに保存する（サーバーのみ書き込み可） */
export async function saveStripeCustomerId(
  uid: string,
  stripeCustomerId: string
): Promise<void> {
  await getFirestore()
    .collection('users')
    .doc(uid)
    .set({ stripeCustomerId }, { merge: true })
}

/** ユーザーに保存済みの Stripe 顧客 ID を取得する */
export async function getStripeCustomerId(
  uid: string
): Promise<string | undefined> {
  const snapshot = await getFirestore().collection('users').doc(uid).get()

  return snapshot.get('stripeCustomerId') as string | undefined
}
