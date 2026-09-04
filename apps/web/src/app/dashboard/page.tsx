import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { adminAuth, adminDb } from '@/lib/firebase-admin'

// 参考実装: 保護ページでのセッション検証 + SSR での Firestore データ取得パターン
// ビルド時の静的生成をスキップし、リクエスト時に SSR で実行する
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  // middleware は Cookie の存在チェックのみ（Edge runtime では firebase-admin が使えない）。
  // セッション Cookie の実検証は保護ページ側で行う
  const sessionCookie = (await cookies()).get('session')?.value
  if (!sessionCookie) redirect('/login?redirect=/dashboard')

  // 失効チェック付きで検証（第2引数 true でログアウト・無効化済みセッションを弾く）
  const decoded = await adminAuth
    .verifySessionCookie(sessionCookie, true)
    .catch(() => null)
  if (!decoded) redirect('/login?redirect=/dashboard')

  // サーバーサイドで Firestore からデータ取得（SSR）。
  // 検証済みの uid にスコープし、本人のデータのみ返す
  const userDoc = await adminDb.collection('users').doc(decoded.uid).get()
  const user = userDoc.data()

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <div className="mt-4 rounded border p-3">
        <p>uid: {decoded.uid}</p>
        {user && <p>displayName: {String(user.displayName ?? '')}</p>}
      </div>
    </main>
  )
}
