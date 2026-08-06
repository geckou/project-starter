import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { createServer, type Server } from 'node:http'
import { type AddressInfo } from 'node:net'

// firebase-admin/auth をモック（requireAuth が使用）
const mockVerifyIdToken = vi.fn()

vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: mockVerifyIdToken,
  }),
}))

// onRequest はデプロイ用のラッパーなので素通しにする
vi.mock('firebase-functions/v2/https', () => ({
  onRequest: (_options: unknown, handler: unknown) => handler,
}))

import { app } from '../src/api'

let server: Server
let baseUrl: string

beforeAll(async () => {
  server = createServer(app)

  await new Promise<void>((resolve) => {
    server.listen(0, resolve)
  })

  const { port } = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve())
  })
})

describe('api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET /health', () => {
    it('200 と status: ok を返す', async () => {
      const response = await fetch(`${baseUrl}/health`)

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ status: 'ok' })
    })
  })

  describe('GET /me', () => {
    it('トークンなしで 401 を返す', async () => {
      const response = await fetch(`${baseUrl}/me`)

      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: 'Unauthorized' })
    })

    it('無効なトークンで 401 を返す', async () => {
      mockVerifyIdToken.mockRejectedValueOnce(new Error('invalid token'))

      const response = await fetch(`${baseUrl}/me`, {
        headers: { authorization: 'Bearer invalid-token' },
      })

      expect(response.status).toBe(401)
    })

    it('有効なトークンで uid を返す', async () => {
      mockVerifyIdToken.mockResolvedValueOnce({ uid: 'user-1' })

      const response = await fetch(`${baseUrl}/me`, {
        headers: { authorization: 'Bearer valid-token' },
      })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ uid: 'user-1' })
      expect(mockVerifyIdToken).toHaveBeenCalledWith('valid-token')
    })
  })
})
