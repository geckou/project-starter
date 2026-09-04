// 参考実装: 実プロジェクトでは要件に合わせて書き換える
'use client'

import { signInWithEmailAndPassword } from 'firebase/auth'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

import { auth } from '@/lib/firebase'
import { sanitizeRedirect } from '@/lib/sanitize-redirect'

function LoginInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = sanitizeRedirect(searchParams.get('redirect'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')

    // Firebase の環境変数が未設定なら auth は null。getAuth() を呼ぶと
    // 「既定アプリが無い」で throw し、認証情報の誤りと同じ文言になってしまう
    if (!auth) {
      setError(
        'Firebase の設定が読み込めません。環境変数（NEXT_PUBLIC_FIREBASE_*）を確認してください'
      )
      return
    }

    try {
      const credential = await signInWithEmailAndPassword(auth, email, password)

      // サーバーにセッション cookie を発行させる
      // （middleware.ts の保護ルート判定はこの cookie を見る）
      const idToken = await credential.user.getIdToken()
      const response = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      })

      if (!response.ok) {
        // cookie なしでサインイン済みの中途半端な状態を残さない
        // （middleware は cookie を見るため、残すとリダイレクトループの原因になる）
        await auth.signOut()
        setError('セッションの作成に失敗しました')
        return
      }

      router.push(redirectTo)
    } catch {
      setError('メールアドレスまたはパスワードが正しくありません')
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold">ログイン</h1>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <input
          type="email"
          placeholder="メールアドレス"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded border px-3 py-2"
          required
        />
        <input
          type="password"
          placeholder="パスワード"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded border px-3 py-2"
          required
        />
        <button
          type="submit"
          className="w-full rounded bg-primary-600 py-2 text-white hover:bg-primary-700"
        >
          ログイン
        </button>
      </form>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          読み込み中...
        </div>
      }
    >
      <LoginInner />
    </Suspense>
  )
}
