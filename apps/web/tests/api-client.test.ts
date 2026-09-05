import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// firebase の初期化は環境変数に依存するので、auth だけを差し替える。
// vi.mock は巻き上げられるため、参照する値も vi.hoisted で先に作る
const auth = vi.hoisted(() => ({
  currentUser: null as { getIdToken: () => Promise<string> } | null,
  authStateReady: vi.fn(async () => {}),
}))

vi.mock('@/lib/firebase', () => ({ auth }))

import { apiClient } from '@/lib/api-client'

const fetchMock = vi.fn()

beforeEach(() => {
  auth.currentUser = null
  auth.authStateReady = vi.fn(async () => {})
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ value: 1 }) })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function authorizationOf(call: number) {
  const headers = fetchMock.mock.calls[call][1].headers as Record<
    string,
    string
  >

  return headers['Authorization']
}

describe('apiClient', () => {
  it('セッションの復元が終わってから currentUser を読む', async () => {
    // 復元が終わるまで currentUser は null（永続化されたセッションの復元中）
    auth.authStateReady = vi.fn(async () => {
      auth.currentUser = { getIdToken: async () => 'restored-token' }
    })

    await apiClient('/me')

    expect(auth.authStateReady).toHaveBeenCalled()
    expect(authorizationOf(0)).toBe('Bearer restored-token')
  })

  it('未ログインなら Authorization を付けない', async () => {
    await apiClient('/me')

    expect(authorizationOf(0)).toBeUndefined()
  })

  it('authenticated: false なら復元を待たない', async () => {
    await apiClient('/health', { authenticated: false })

    expect(auth.authStateReady).not.toHaveBeenCalled()
    expect(authorizationOf(0)).toBeUndefined()
  })
})

// 回帰: 未設定のまま本番ビルドへ出ると、全ての API が Functions エミュレーター
// （localhost:5001）を叩いて「Failed to fetch」になっていた
describe('API_BASE_URL の必須チェック', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('本番ビルドで未設定なら import 時に落とす', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', '')
    vi.resetModules()

    await expect(import('@/lib/api-client')).rejects.toThrow(
      'NEXT_PUBLIC_API_BASE_URL'
    )
  })

  it('本番ビルドでも設定済みなら読み込める', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'https://api.example.com')
    vi.resetModules()

    await expect(import('@/lib/api-client')).resolves.toBeDefined()
  })

  it('開発ビルドではエミュレーターへフォールバックする', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', '')
    vi.resetModules()

    const { apiClient: devClient } = await import('@/lib/api-client')
    await devClient('/health', { authenticated: false })

    expect(fetchMock.mock.calls[0][0]).toContain('http://localhost:5001/')
  })
})
