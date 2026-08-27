import cors from 'cors'
import express from 'express'
import { onRequest } from 'firebase-functions/v2/https'

import { requireAuth, type AuthenticatedRequest } from './lib/auth-middleware'
import { getBilling } from './lib/billing'

// テストから直接リクエストを投げられるよう app 自体も export する
export const app = express()

// 本番では ALLOWED_ORIGINS（カンマ区切り）で許可オリジンを絞る。
// 未設定・空の場合は全オリジン許可（開発用）
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin !== '')
app.use(cors({ origin: allowedOrigins.length > 0 ? allowedOrigins : true }))

// Webhook の処理は @geckou/billing（geckou/kit）にあり、ここは
// Express の req/res をパッケージの { rawBody, headers } → { status, body } に
// 詰め替えるだけの薄いアダプタ。
// 署名検証には生のボディが必要なため、express.json() より前に
// raw パーサーで登録する（順序を入れ替えると検証が必ず失敗する）
app.post('/webhooks/stripe', express.raw({ type: '*/*' }), async (req, res) => {
  const result = await getBilling().handleStripeWebhook({
    rawBody: req.body as Buffer,
    headers: req.headers,
  })
  res.status(result.status).json(result.body)
})

app.post(
  '/webhooks/revenuecat',
  express.raw({ type: '*/*' }),
  async (req, res) => {
    const result = await getBilling().handleRevenueCatWebhook({
      rawBody: req.body as Buffer,
      headers: req.headers,
    })
    res.status(result.status).json(result.body)
  }
)

app.use(express.json())

// --- 課金（Web 決済） ---
// アプリ内課金（IAP）は RevenueCat SDK がクライアント側で完結するため、
// ここに来るのは Web 決済（Stripe）のみ
app.post('/billing/checkout', requireAuth, async (req, res) => {
  const result = await getBilling().createCheckoutSession({
    uid: (req as AuthenticatedRequest).uid,
    priceId: (req.body as { priceId?: unknown })?.priceId,
  })
  res.status(result.status).json(result.body)
})
app.post('/billing/portal', requireAuth, async (req, res) => {
  const result = await getBilling().createPortalSession({
    uid: (req as AuthenticatedRequest).uid,
  })
  res.status(result.status).json(result.body)
})

app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

// 認証付きエンドポイントの例
app.get('/me', requireAuth, (req, res) => {
  res.json({ uid: (req as AuthenticatedRequest).uid })
})

// hosting (frameworksBackend) とリージョンを揃える
export const api = onRequest({ region: 'asia-northeast1' }, app)
