import { auth } from '@/lib/firebase'
import Constants from 'expo-constants'

// 未設定時は Functions エミュレーターを指す（プロジェクト ID は app.config.ts の extra から取得）。
// Android エミュレーターからは localhost ではなく 10.0.2.2 を指定すること
const EMULATOR_PROJECT_ID =
  Constants.expoConfig?.extra?.firebaseProjectId || 'your-project-develop'
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  `http://localhost:5001/${EMULATOR_PROJECT_ID}/asia-northeast1/api`

type ApiOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  body?: unknown
  authenticated?: boolean
}

type ApiResponse<T> = {
  success: boolean
  data?: T
  error?: string
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

  if (authenticated) {
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

    const data = await response.json()

    if (!response.ok) {
      return { success: false, error: data.error || `HTTP ${response.status}` }
    }

    return { success: true, data }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
