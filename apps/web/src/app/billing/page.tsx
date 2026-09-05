import { isSubscriptionActive, type Subscription } from '@geckou/shared'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { BillingActions } from '@/components/billing/BillingActions'
import { adminAuth, adminDb } from '@/lib/firebase-admin'

// 参考実装: Web 決済（Stripe）の購入・管理導線。
// 権利状態は users/{uid}.subscription を単一の正とし、
// Stripe / IAP（RevenueCat）のどちらで購入されても同じ形で読む
export const dynamic = 'force-dynamic'

export default async function BillingPage() {
  const sessionCookie = (await cookies()).get('session')?.value
  if (!sessionCookie) redirect('/login?redirect=/billing')

  const decoded = await adminAuth
    .verifySessionCookie(sessionCookie, true)
    .catch(() => null)
  if (!decoded) redirect('/login?redirect=/billing')

  const userDoc = await adminDb.collection('users').doc(decoded.uid).get()
  const subscription = userDoc.get('subscription') as Subscription | undefined
  const active = isSubscriptionActive(subscription)

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">プラン</h1>

      <div className="mt-4 rounded border p-3">
        <p>状態: {active ? '有効' : '未契約 / 失効'}</p>
        {subscription && (
          <>
            <p>ステータス: {subscription.status}</p>
            <p>購入経路: {subscription.source}</p>
          </>
        )}
      </div>

      <BillingActions isActive={active} source={subscription?.source} />

      {subscription?.source === 'revenuecat' && (
        <p className="mt-4 text-sm text-gray-500">
          アプリ内課金で契約中のプランは、App Store / Google Play
          の設定から変更・解約できます。
        </p>
      )}
    </main>
  )
}
