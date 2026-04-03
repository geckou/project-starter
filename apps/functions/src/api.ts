import cors from 'cors'
import express from 'express'
import { onRequest } from 'firebase-functions/v2/https'

import { handleRevenueCatWebhook } from './revenuecat-webhook'

const app = express()

app.use(cors({ origin: true }))

// Webhook は raw body で署名検証するため、json パースの前に定義
app.post(
  '/webhooks/revenuecat',
  express.raw({ type: 'application/json' }),
  handleRevenueCatWebhook
)

// その他のエンドポイントは JSON パース
app.use(express.json())

app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

// 例: 認証付きエンドポイント
// app.post('/users', async (req, res) => {
//   const token = req.headers.authorization?.replace('Bearer ', '');
//   if (!token) return res.status(401).json({ error: 'Unauthorized' });
//   const decoded = await getAuth().verifyIdToken(token);
//   res.json({ uid: decoded.uid });
// });

export const api = onRequest(app)
