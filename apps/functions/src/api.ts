import cors from 'cors'
import express from 'express'
import { onRequest } from 'firebase-functions/v2/https'

import { requireAuth, type AuthenticatedRequest } from './lib/auth-middleware'
import { getBilling } from './lib/billing'

/**
 * { status, body } を返す billing の処理を Express ハンドラに変換する。
 * Express 4 は async ハンドラの reject を捕捉しないため、
 * 想定外の throw はここで受けて 500 を返す。
 */
function billingHandler(
  handle: (req: express.Request) => Promise<{ status: number; body: object }>
): express.RequestHandler {
  return async (req, res) => {
    try {
      const result = await handle(req)
      res.status(result.status).json(result.body)
    } catch (error) {
      console.error('Unhandled billing error', error)
      res.status(500).json({ error: 'Internal error' })
    }
  }
}

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
app.post(
  '/webhooks/stripe',
  express.raw({ type: '*/*' }),
  billingHandler((req) =>
    getBilling().handleStripeWebhook({
      rawBody: req.body as Buffer,
      headers: req.headers,
    })
  )
)

app.post(
  '/webhooks/revenuecat',
  express.raw({ type: '*/*' }),
  billingHandler((req) =>
    getBilling().handleRevenueCatWebhook({
      rawBody: req.body as Buffer,
      headers: req.headers,
    })
  )
)

app.use(express.json())

// --- 課金（Web 決済） ---
// アプリ内課金（IAP）は RevenueCat SDK がクライアント側で完結するため、
// ここに来るのは Web 決済（Stripe）のみ
app.post(
  '/billing/checkout',
  requireAuth,
  billingHandler((req) =>
    getBilling().createCheckoutSession({
      uid: (req as AuthenticatedRequest).uid,
      priceId: (req.body as { priceId?: unknown })?.priceId,
    })
  )
)
app.post(
  '/billing/portal',
  requireAuth,
  billingHandler((req) =>
    getBilling().createPortalSession({
      uid: (req as AuthenticatedRequest).uid,
    })
  )
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
