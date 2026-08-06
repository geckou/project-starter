import cors from 'cors'
import express from 'express'
import { onRequest } from 'firebase-functions/v2/https'

import { requireAuth, type AuthenticatedRequest } from './lib/auth-middleware'
import { handleRevenueCatWebhook } from './revenuecat-webhook'

// テストから直接リクエストを投げられるよう app 自体も export する
export const app = express()

// 本番では ALLOWED_ORIGINS（カンマ区切り）で許可オリジンを絞る。
// 未設定・空の場合は全オリジン許可（開発用）
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin !== '')
app.use(cors({ origin: allowedOrigins.length > 0 ? allowedOrigins : true }))

app.use(express.json())

// 注意: Express 4 は async ハンドラの reject を捕捉しないため、
// 各ハンドラ内で try/catch してエラーレスポンスを返すこと
app.post('/webhooks/revenuecat', handleRevenueCatWebhook)

app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

// 認証付きエンドポイントの例
app.get('/me', requireAuth, (req, res) => {
  res.json({ uid: (req as AuthenticatedRequest).uid })
})

// hosting (frameworksBackend) とリージョンを揃える
export const api = onRequest({ region: 'asia-northeast1' }, app)
