import type { Subscription, SubscriptionSource } from '@geckou/shared'
import { getFirestore } from 'firebase-admin/firestore'

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

export type ApplyResult = 'applied' | 'duplicate' | 'stale'

/** 処理済みイベントを記録するコレクション（冪等性のため） */
const BILLING_EVENTS_COLLECTION = 'billing_events'

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
 */
export async function applySubscriptionEvent(
  event: SubscriptionEvent
): Promise<ApplyResult> {
  const db = getFirestore()
  const eventRef = db
    .collection(BILLING_EVENTS_COLLECTION)
    .doc(`${event.source}_${event.eventId}`)
  const userRef = db.collection('users').doc(event.uid)

  return db.runTransaction(async (transaction) => {
    // Firestore のトランザクションは全ての read を write より先に行う必要がある
    const [eventSnapshot, userSnapshot] = await Promise.all([
      transaction.get(eventRef),
      transaction.get(userRef),
    ])

    if (eventSnapshot.exists) return 'duplicate'

    const current = userSnapshot.get('subscription') as
      { lastEventAt?: unknown } | undefined
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

    if (isStale) return 'stale'

    // update ではなく set + merge を使う（ドキュメント未作成時に throw するため）
    transaction.set(
      userRef,
      {
        subscription: {
          ...event.subscription,
          updatedAt: new Date(),
          lastEventId: event.eventId,
          lastEventAt: event.occurredAt,
        },
      },
      { merge: true }
    )

    return 'applied'
  })
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
