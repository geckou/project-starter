import cors from 'cors';
import express from 'express';
import { onRequest } from 'firebase-functions/v2/https';

import { handleRevenueCatWebhook } from './revenuecat-webhook';

const app = express();

app.use(cors({ origin: true }));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// RevenueCat Webhook
// RevenueCat Dashboard > Integrations > Webhooks にこの URL を設定:
// https://<region>-<project-id>.cloudfunctions.net/api/webhooks/revenuecat
app.post('/webhooks/revenuecat', handleRevenueCatWebhook);

// 例: 認証付きエンドポイント
// app.post('/users', async (req, res) => {
//   const token = req.headers.authorization?.replace('Bearer ', '');
//   if (!token) return res.status(401).json({ error: 'Unauthorized' });
//   const decoded = await getAuth().verifyIdToken(token);
//   res.json({ uid: decoded.uid });
// });

export const api = onRequest(app);
