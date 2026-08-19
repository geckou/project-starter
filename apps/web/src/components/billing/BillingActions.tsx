'use client'

import { useState } from 'react'

import { openCustomerPortal, startCheckout } from '@/lib/billing'

type Props = {
  /** 既に有効な権利を持っているか。持っていればポータル、無ければ購入を出す */
  isActive: boolean
}

export function BillingActions({ isActive }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // 許可リスト（Functions の STRIPE_PRICE_IDS）に含まれる price を指定する
  const priceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_ID ?? ''

  async function handleClick() {
    setLoading(true)
    setError(null)

    const message = isActive
      ? await openCustomerPortal()
      : await startCheckout(priceId)

    // 成功時は Stripe へ遷移するため、ここに戻ってくるのはエラー時のみ
    if (message) {
      setError(message)
      setLoading(false)
    }
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading || (!isActive && priceId === '')}
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {isActive ? 'プランを管理する' : 'プランに登録する'}
      </button>

      {!isActive && priceId === '' && (
        <p className="mt-2 text-sm text-gray-500">
          NEXT_PUBLIC_STRIPE_PRICE_ID が未設定です
        </p>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  )
}
