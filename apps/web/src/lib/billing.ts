'use client'

import { apiClient } from '@/lib/api-client'

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
