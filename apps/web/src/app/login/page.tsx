// 参考実装: 実プロジェクトでは要件に合わせて書き換える
'use client'

import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

// open redirect 防止: サイト内パス（/ 始まり、// は除外）のみ許可
function sanitizeRedirect(redirect: string | null): string {
  if (!redirect) return '/'
  if (!redirect.startsWith('/') || redirect.startsWith('//')) return '/'
  return redirect
}

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

    try {
      const auth = getAuth()
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
          className="bg-primary-600 hover:bg-primary-700 w-full rounded py-2 text-white"
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
