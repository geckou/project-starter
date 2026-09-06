import { createApiClient } from '@geckou/shared/api-client'
import Constants from 'expo-constants'

import { auth } from '@/lib/firebase'

// 未設定時は Functions エミュレーターを指す（プロジェクト ID は app.config.ts の extra から取得）。
// Android エミュレーターからは localhost ではなく 10.0.2.2 を指定すること
const EMULATOR_PROJECT_ID =
  Constants.expoConfig?.extra?.firebaseProjectId || 'your-project-develop'

// 本番ビルドで未設定のままエミュレーターへフォールバックすると、配布したアプリが
// localhost:5001 を叩いて全ての API が失敗する。起動時に落として気付かせる
// （Functions 側の ALLOWED_ORIGINS と同じ方針。→ .claude/docs/architecture.md）
if (!__DEV__ && !process.env.EXPO_PUBLIC_API_BASE_URL) {
  throw new Error(
    'EXPO_PUBLIC_API_BASE_URL is required in production builds (.env.production を確認してください)'
  )
}

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  `http://localhost:5001/${EMULATOR_PROJECT_ID}/asia-northeast1/api`

export type { ApiOptions } from '@geckou/shared/api-client'

/**
 * Cloud Functions API を呼び出す共通ヘルパー。
 * 応答の解釈は @geckou/shared/api-client にあり、ここは注入だけを行う
 */
export const apiClient = createApiClient({
  baseUrl: API_BASE_URL,
  getIdToken: async () => {
    if (!auth) return null

    // currentUser を同期的に読むだけだと、永続化されたセッションの復元が
    // 終わる前に呼んだ呼び出しが Authorization なしで飛び、API が 401 を返す。
    // 復元の完了を待ってから読む
    await auth.authStateReady()

    const user = auth.currentUser

    return user ? await user.getIdToken() : null
  },
})
