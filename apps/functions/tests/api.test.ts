import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import express from 'express'
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

// layer:billing:start
// 課金は @geckou/billing 側でテスト済み。ここでは Express の配線だけを見る
const mockCreateCheckoutSession = vi.fn()
const mockCreatePortalSession = vi.fn()
const mockHandleStripeWebhook = vi.fn()
const mockHandleRevenueCatWebhook = vi.fn()

vi.mock('../src/lib/billing', () => ({
  getBilling: () => ({
    createCheckoutSession: mockCreateCheckoutSession,
    createPortalSession: mockCreatePortalSession,
    handleStripeWebhook: mockHandleStripeWebhook,
    handleRevenueCatWebhook: mockHandleRevenueCatWebhook,
  }),
}))
// layer:billing:end

import { app } from '../src/api'

let server: Server
let baseUrl: string

// Functions Framework は自前のハンドラより前に JSON をパースし、生のボディを
// req.rawBody に残す。supertest / 素の Express で叩くだけではこの前段が
// 再現されず、rawBody の取り違えが本番でしか出ない。同じ配線で包んで確かめる
let frameworkServer: Server
let frameworkBaseUrl: string

beforeAll(async () => {
  server = createServer(app)

  const framework = express()
  framework.use(
    express.json({
      verify: (req, _res, buffer) => {
        ;(req as express.Request & { rawBody?: Buffer }).rawBody = buffer
      },
    })
  )
  framework.use(app)
  frameworkServer = createServer(framework)

  await Promise.all(
    [server, frameworkServer].map(
      (target) =>
        new Promise<void>((resolve) => {
          target.listen(0, resolve)
        })
    )
  )

  const { port } = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${port}`
  frameworkBaseUrl = `http://127.0.0.1:${
    (frameworkServer.address() as AddressInfo).port
  }`
})

afterAll(async () => {
  await Promise.all(
    [server, frameworkServer].map(
      (target) =>
        new Promise<void>((resolve) => {
          target.close(() => resolve())
        })
    )
  )
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

    // 回帰: ALLOWED_ORIGINS の検査をモジュール読み込み時に置くと、
    // index.ts が ./api を無条件に import しているため、スケジュール関数や
    // トリガー、デプロイ時の関数ディスカバリまで巻き込んで落ちる。
    // 落ちる範囲は /api の中に閉じる
    it('ALLOWED_ORIGINS 未設定でも import は落ちず、リクエストが 500 になる', async () => {
      vi.stubEnv('ALLOWED_ORIGINS', '')
      vi.stubEnv('FUNCTIONS_EMULATOR', '')

      const response = await fetch(`${baseUrl}/health`)

      expect(response.status).toBe(500)

      vi.unstubAllEnvs()

      expect((await fetch(`${baseUrl}/health`)).status).toBe(200)
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
      // 0.2.0 から checkRevoked（既定 false）が第2引数で渡る
      expect(mockVerifyIdToken).toHaveBeenCalledWith('valid-token', false)
    })
  })

  // layer:billing:start
  describe('POST /billing/checkout', () => {
    it('トークンなしで 401 を返す', async () => {
      const response = await fetch(`${baseUrl}/billing/checkout`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ priceId: 'price_allowed' }),
      })

      expect(response.status).toBe(401)
      expect(mockCreateCheckoutSession).not.toHaveBeenCalled()
    })

    it('有効なトークンで uid と priceId を渡す', async () => {
      mockVerifyIdToken.mockResolvedValueOnce({ uid: 'user-1' })
      mockCreateCheckoutSession.mockResolvedValueOnce({
        status: 200,
        body: { url: 'https://checkout.stripe.com/x' },
      })

      const response = await fetch(`${baseUrl}/billing/checkout`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({ priceId: 'price_allowed' }),
      })

      expect(response.status).toBe(200)
      expect(mockCreateCheckoutSession).toHaveBeenCalledWith({
        uid: 'user-1',
        priceId: 'price_allowed',
      })
    })
  })

  describe('POST /billing/portal', () => {
    it('トークンなしで 401 を返す', async () => {
      const response = await fetch(`${baseUrl}/billing/portal`, {
        method: 'POST',
      })

      expect(response.status).toBe(401)
      expect(mockCreatePortalSession).not.toHaveBeenCalled()
    })

    it('有効なトークンで uid を渡す', async () => {
      mockVerifyIdToken.mockResolvedValueOnce({ uid: 'user-1' })
      mockCreatePortalSession.mockResolvedValueOnce({
        status: 200,
        body: { url: 'https://billing.stripe.com/x' },
      })

      const response = await fetch(`${baseUrl}/billing/portal`, {
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
      })

      expect(response.status).toBe(200)
      expect(mockCreatePortalSession).toHaveBeenCalledWith({ uid: 'user-1' })
    })
  })

  // 署名検証にはパース前の生ボディが要る。express.raw() を express.json() より
  // 後ろに置くと rawBody がパース済みオブジェクトになり、検証が必ず失敗する
  // （architecture.md「入れ替えると必ず失敗する」）。その退行をここで止める
  describe('Webhook の rawBody', () => {
    it('POST /webhooks/stripe に Buffer が渡る', async () => {
      mockHandleStripeWebhook.mockResolvedValueOnce({
        status: 200,
        body: { received: true },
      })

      const payload = JSON.stringify({ id: 'evt_test' })
      const response = await fetch(`${baseUrl}/webhooks/stripe`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': 'sig_test',
        },
        body: payload,
      })

      expect(response.status).toBe(200)

      const argument = mockHandleStripeWebhook.mock.calls[0][0]
      expect(Buffer.isBuffer(argument.rawBody)).toBe(true)
      expect(argument.rawBody.toString('utf-8')).toBe(payload)
      expect(argument.headers['stripe-signature']).toBe('sig_test')
    })

    // 回帰: Functions Framework の前段パースを再現していなかったため、
    // req.body（パース済みオブジェクト）を渡す配線のまま緑になっていた。
    // 本番では Stripe が全イベント 400 Invalid signature になる
    it('Functions Framework が先にパースしても、生のボディが渡る', async () => {
      mockHandleStripeWebhook.mockResolvedValueOnce({
        status: 200,
        body: { received: true },
      })

      const payload = JSON.stringify({ id: 'evt_test' })
      const response = await fetch(`${frameworkBaseUrl}/webhooks/stripe`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': 'sig_test',
        },
        body: payload,
      })

      expect(response.status).toBe(200)

      const argument = mockHandleStripeWebhook.mock.calls[0][0]
      expect(Buffer.isBuffer(argument.rawBody)).toBe(true)
      expect(argument.rawBody.toString('utf-8')).toBe(payload)
    })

    it('POST /webhooks/revenuecat に Buffer が渡る', async () => {
      mockHandleRevenueCatWebhook.mockResolvedValueOnce({
        status: 200,
        body: { received: true },
      })

      const payload = JSON.stringify({ event: { type: 'RENEWAL' } })
      const response = await fetch(`${baseUrl}/webhooks/revenuecat`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer rc-secret',
        },
        body: payload,
      })

      expect(response.status).toBe(200)

      const argument = mockHandleRevenueCatWebhook.mock.calls[0][0]
      expect(Buffer.isBuffer(argument.rawBody)).toBe(true)
      expect(argument.rawBody.toString('utf-8')).toBe(payload)
    })

    it('RevenueCat も Framework の前段パース下で生のボディが渡る', async () => {
      mockHandleRevenueCatWebhook.mockResolvedValueOnce({
        status: 200,
        body: { received: true },
      })

      const payload = JSON.stringify({ event: { type: 'RENEWAL' } })
      const response = await fetch(`${frameworkBaseUrl}/webhooks/revenuecat`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer rc-secret',
        },
        body: payload,
      })

      expect(response.status).toBe(200)

      const argument = mockHandleRevenueCatWebhook.mock.calls[0][0]
      expect(Buffer.isBuffer(argument.rawBody)).toBe(true)
      expect(argument.rawBody.toString('utf-8')).toBe(payload)
    })
  })
  // layer:billing:end
})
