import type { ApiResponse } from '../types'

export type ApiOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  body?: unknown
  authenticated?: boolean
}

export type ApiClientConfig = {
  /** API のベース URL。末尾にスラッシュを付けない */
  baseUrl: string
  /**
   * 認証トークンの取得。未ログインなら null を返す。
   * 呼ぶのは `authenticated: true`（既定）のときだけ。
   *
   * Firebase Auth を使う場合、永続化されたセッションの復元を待ってから
   * `currentUser` を読むこと（同期的に読むと、復元が終わる前の呼び出しが
   * Authorization なしで飛び、API が 401 を返す）
   */
  getIdToken?: () => Promise<string | null>
}

export type ApiClient = <T>(
  path: string,
  options?: ApiOptions
) => Promise<ApiResponse<T>>

/**
 * Cloud Functions API を呼び出す共通ヘルパーを作る。
 *
 * 認証トークンの取得元とベース URL だけが web / mobile で異なるため、
 * その 2 つを注入で受け取り、応答の解釈はここに 1 か所だけ持つ
 * （→ apps/web/src/lib/api-client.ts, apps/mobile/src/lib/api-client.ts）。
 */
export function createApiClient({
  baseUrl,
  getIdToken,
}: ApiClientConfig): ApiClient {
  return async function apiClient<T>(
    path: string,
    options: ApiOptions = {}
  ): Promise<ApiResponse<T>> {
    const { method = 'GET', body, authenticated = true } = options

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (authenticated && getIdToken) {
      const token = await getIdToken()

      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
    }

    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      })

      // Express の未定義ルートは HTML を返す。response.json() を先に呼ぶと
      // そこで throw し、HTTP ステータスの情報が消える
      const text = await response.text()
      const data = parseJson(text)

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
}

/** JSON として読めなければ undefined（HTML のエラーページ・空ボディ） */
function parseJson(text: string): unknown {
  if (text === '') return undefined

  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
