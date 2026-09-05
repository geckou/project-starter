import type { ApiResponse } from '@geckou/shared'

import { auth } from '@/lib/firebase'

// 未設定時は Functions エミュレーターを指す（プロジェクト ID は Firebase 設定から取得）
const EMULATOR_PROJECT_ID =
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'your-project-develop'

// 本番ビルドで未設定のままエミュレーターへフォールバックすると、全ての API が
// localhost:5001 を叩いて「Failed to fetch」になる。起動時に落として気付かせる
// （Functions 側の ALLOWED_ORIGINS と同じ方針。→ .claude/docs/architecture.md）
if (
  process.env.NODE_ENV === 'production' &&
  !process.env.NEXT_PUBLIC_API_BASE_URL
) {
  throw new Error(
    'NEXT_PUBLIC_API_BASE_URL is required in production builds (.env.production を確認してください)'
  )
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  `http://localhost:5001/${EMULATOR_PROJECT_ID}/asia-northeast1/api`

type ApiOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  body?: unknown
  authenticated?: boolean
}

/**
 * Cloud Functions API を呼び出す共通ヘルパー
 */
export async function apiClient<T>(
  path: string,
  options: ApiOptions = {}
): Promise<ApiResponse<T>> {
  const { method = 'GET', body, authenticated = true } = options

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (authenticated && auth) {
    // currentUser を同期的に読むだけだと、永続化されたセッションの復元が
    // 終わる前に呼んだ呼び出しが Authorization なしで飛び、API が 401 を返す。
    // 復元の完了を待ってから読む
    await auth.authStateReady()

    const user = auth.currentUser

    if (user) {
      const token = await user.getIdToken()
      headers['Authorization'] = `Bearer ${token}`
    }
  }

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })

    // Express の未定義ルートは HTML を返す。response.json() を先に呼ぶと
    // そこで throw し、HTTP ステータスの情報が消える
    const text = await response.text()
    let data: unknown = undefined

    try {
      data = text === '' ? undefined : JSON.parse(text)
    } catch {
      data = undefined
    }

    if (!response.ok) {
      const message =
        data !== null && typeof data === 'object' && 'error' in data
          ? String((data as { error: unknown }).error)
          : `HTTP ${response.status}`

      return { success: false, error: message }
    }

    return { success: true, data: data as T }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
