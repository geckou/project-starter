import cors from 'cors'
import express from 'express'
import { onRequest } from 'firebase-functions/v2/https'

import { requireAuth, type AuthenticatedRequest } from './lib/auth-middleware'
// layer:billing:start
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

/**
 * 署名検証に使う「パース前の生のボディ」を取り出す。
 *
 * onRequest の土台である Functions Framework は、自前のハンドラより前に JSON を
 * パースする。後段に置いた express.raw() は req._body 済みでスキップされるため、
 * req.body はオブジェクトになる。生のボディは req.rawBody にしか無い
 * （Express 単体で動かすローカルのテストでは rawBody が無く、req.body が Buffer）。
 */
function extractRawBody(req: express.Request): Buffer | string {
  const { rawBody } = req as express.Request & { rawBody?: Buffer | string }

  return rawBody ?? (req.body as Buffer)
}
// layer:billing:end

/**
 * CORS の許可オリジンを決める。
 *
 * ALLOWED_ORIGINS（カンマ区切り）が空のときの「全オリジン許可」は開発用の
 * フォールバックで、本番で黙って効くと任意オリジンからの認証付きリクエストを
 * 通してしまう。エミュレーターの外では未設定を落とす。
 */
export function resolveCorsOrigin(): string[] | true {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== '')

  if (allowedOrigins.length > 0) return allowedOrigins

  if (process.env.FUNCTIONS_EMULATOR !== 'true') {
    throw new Error('ALLOWED_ORIGINS is required outside the emulator')
  }

  return true
}

// テストから直接リクエストを投げられるよう app 自体も export する
export const app = express()

// resolveCorsOrigin はリクエスト時に呼ぶ。モジュールの読み込み時に throw すると、
// index.ts が ./api を無条件に import しているためスケジュール関数・トリガーや
// デプロイ時の関数ディスカバリまで巻き込む。落とす範囲を /api に閉じる
app.use(
  cors({
    origin: (_requestOrigin, callback) => {
      try {
        callback(null, resolveCorsOrigin())
      } catch (error) {
        callback(error as Error)
      }
    },
  })
)

// layer:billing:start
// Webhook の処理は @geckou/billing（geckou/kit）にあり、ここは
// Express の req/res をパッケージの { rawBody, headers } → { status, body } に
// 詰め替えるだけの薄いアダプタ。
// 署名検証には生のボディが必要。Functions では Framework が先に JSON を
// パースしてしまうので req.rawBody を使う（→ extractRawBody）。
// express.raw() は Express 単体で動かすとき用の保険で、express.json() より
// 前に登録する（順序を入れ替えるとローカルでは検証が必ず失敗する）
app.post(
  '/webhooks/stripe',
  express.raw({ type: '*/*' }),
  billingHandler((req) =>
    getBilling().handleStripeWebhook({
      rawBody: extractRawBody(req),
      headers: req.headers,
    })
  )
)

app.post(
  '/webhooks/revenuecat',
  express.raw({ type: '*/*' }),
  billingHandler((req) =>
    getBilling().handleRevenueCatWebhook({
      rawBody: extractRawBody(req),
      headers: req.headers,
    })
  )
)

// layer:billing:end

app.use(express.json())

// layer:billing:start
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

// layer:billing:end

app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

// 認証付きエンドポイントの例
app.get('/me', requireAuth, (req, res) => {
  res.json({ uid: (req as AuthenticatedRequest).uid })
})

// hosting (frameworksBackend) とリージョンを揃える
export const api = onRequest({ region: 'asia-northeast1' }, app)
