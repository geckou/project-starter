// 参考実装: SSR での Firestore データ取得パターン
import { adminDb } from '@/lib/firebase-admin'

export default async function DashboardPage() {
  // サーバーサイドで Firestore からデータ取得（SSR）
  const snapshot = await adminDb.collection('users').limit(10).get()
  const users = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }))

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <ul className="mt-4 space-y-2">
        {users.map((user) => (
          <li key={user.id} className="rounded border p-3">
            {user.id}
          </li>
        ))}
      </ul>
    </main>
  )
}
