import cors from 'cors'
import express from 'express'
import { onRequest } from 'firebase-functions/v2/https'

import {
  handleCreateCheckoutSession,
  handleCreatePortalSession,
} from './billing'
import { requireAuth, type AuthenticatedRequest } from './lib/auth-middleware'
import { handleRevenueCatWebhook } from './revenuecat-webhook'
import { handleStripeWebhook } from './stripe-webhook'

// テストから直接リクエストを投げられるよう app 自体も export する
export const app = express()

// 本番では ALLOWED_ORIGINS（カンマ区切り）で許可オリジンを絞る。
// 未設定・空の場合は全オリジン許可（開発用）
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin !== '')
app.use(cors({ origin: allowedOrigins.length > 0 ? allowedOrigins : true }))

// Stripe の署名検証には生のボディが必要なため、express.json() より前に
// このルートだけ raw パーサーで登録する（順序を入れ替えると検証が必ず失敗する）
app.post('/webhooks/stripe', express.raw({ type: '*/*' }), handleStripeWebhook)

app.use(express.json())

// 注意: Express 4 は async ハンドラの reject を捕捉しないため、
// 各ハンドラ内で try/catch してエラーレスポンスを返すこと
app.post('/webhooks/revenuecat', handleRevenueCatWebhook)

// --- 課金（Web 決済） ---
// アプリ内課金（IAP）は RevenueCat SDK がクライアント側で完結するため、
// ここに来るのは Web 決済（Stripe）のみ
app.post('/billing/checkout', requireAuth, (req, res) =>
  handleCreateCheckoutSession(req as AuthenticatedRequest, res)
)
app.post('/billing/portal', requireAuth, (req, res) =>
  handleCreatePortalSession(req as AuthenticatedRequest, res)
)

app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

// 認証付きエンドポイントの例
app.get('/me', requireAuth, (req, res) => {
  res.json({ uid: (req as AuthenticatedRequest).uid })
})

// hosting (frameworksBackend) とリージョンを揃える
export const api = onRequest({ region: 'asia-northeast1' }, app)
