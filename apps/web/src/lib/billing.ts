'use client'

import { apiClient } from '@/lib/api-client'
import { auth } from '@/lib/firebase'

/**
 * Stripe Checkout を開始する。
 * 成功すると Stripe のホスト画面へ遷移するため、この関数は戻ってこない。
 *
 * priceId は Cloud Functions 側の STRIPE_PRICE_IDS 許可リストで検証される。
 */
export async function startCheckout(priceId: string): Promise<string | null> {
  const response = await apiClient<{ url: string }>('/billing/checkout', {
    method: 'POST',
    body: { priceId },
  })

  if (!response.success || !response.data?.url) {
    return response.error ?? 'Checkout セッションの作成に失敗しました'
  }

  window.location.href = response.data.url

  return null
}

/**
 * Stripe カスタマーポータル（解約・プラン変更・支払い方法の更新）を開く。
 * Stripe で購入したことがないユーザーには顧客が存在しないためエラーを返す。
 */
export async function openCustomerPortal(): Promise<string | null> {
  const response = await apiClient<{ url: string }>('/billing/portal', {
    method: 'POST',
  })

  if (!response.success || !response.data?.url) {
    return response.error ?? 'カスタマーポータルを開けませんでした'
  }

  window.location.href = response.data.url

  return null
}

/**
 * 権利状態のカスタムクレームを即時反映させる。
 *
 * カスタムクレームは ID トークンが更新されるまで最大1時間古いままなので、
 * 購入完了後の画面（STRIPE_SUCCESS_URL の戻り先）で一度呼ぶこと。
 * Functions 側で SYNC_SUBSCRIPTION_CLAIMS=true にしていない場合は不要。
 * Firestore の users/{uid}.subscription は Webhook 反映後すぐ正しくなるため、
 * 画面表示だけならこの呼び出しは不要で、セキュリティルールで
 * request.auth.token.subscriptionActive を使う場合に必要になる。
 */
export async function refreshEntitlement(): Promise<void> {
  await auth?.currentUser?.getIdToken(true)
}
