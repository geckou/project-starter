import type { Subscription } from '@geckou/shared'
import { isSubscriptionActive } from '@geckou/shared'
import { getAuth } from 'firebase-admin/auth'

/**
 * カスタムクレームへの同期が有効かどうか。
 *
 * セキュリティルールから権利状態を参照する場合だけ有効にする。
 * 画面側の表示制御しかしないプロダクトでは Firestore の
 * users/{uid}.subscription を読めば足りるので、有効化する必要はない。
 */
export function isClaimsSyncEnabled(): boolean {
  return process.env.SYNC_SUBSCRIPTION_CLAIMS === 'true'
}

/**
 * 権利状態を Firebase Auth のカスタムクレームに同期する。
 *
 * **正は Firestore の users/{uid}.subscription。**クレームはあくまで
 * セキュリティルールから Firestore の get() なしで参照するためのコピー。
 *
 * ルール側ではこう書ける:
 *   allow write: if request.auth.token.subscriptionActive == true;
 *
 * 注意: クレームは ID トークンが更新されるまで最大1時間反映されない。
 * 購入直後に反映させたい場合はクライアント側で getIdToken(true) を呼ぶこと
 * （web は refreshEntitlement() を用意している）。
 */
export async function syncSubscriptionClaims(
  uid: string,
  subscription: Subscription
): Promise<void> {
  if (!isClaimsSyncEnabled()) return

  const auth = getAuth()

  // setCustomUserClaims は既存クレームを丸ごと置き換えるため、
  // 他のクレーム（role 等）を消さないよう既存値にマージする
  const existingClaims = (await auth.getUser(uid)).customClaims ?? {}

  await auth.setCustomUserClaims(uid, {
    ...existingClaims,
    subscriptionActive: isSubscriptionActive(subscription),
    plan: subscription.planId ?? null,
  })
}
