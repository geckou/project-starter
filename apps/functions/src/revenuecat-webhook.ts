import crypto from 'crypto';
import { type Request, type Response } from 'express';
import { getFirestore } from 'firebase-admin/firestore';

type WebhookEvent = {
  event: {
    type: string;
    app_user_id: string;
    timestamp: number;
  };
};

function verifySignature(
  body: string,
  signature: string,
  secret: string,
): boolean {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('base64');
  return hash === signature;
}

export async function handleRevenueCatWebhook(
  req: Request,
  res: Response,
): Promise<void> {
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
  if (!secret) {
    res.status(500).json({ error: 'Webhook secret not configured' });
    return;
  }

  const signature = req.headers['x-revenuecat-signature'] as string;
  if (!verifySignature(JSON.stringify(req.body), signature, secret)) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  const { type, app_user_id: userId } = (req.body as WebhookEvent).event;
  const db = getFirestore();
  const now = new Date();

  switch (type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
      await db.collection('users').doc(userId).update({
        'subscription.status'    : 'active',
        'subscription.updatedAt' : now,
      });
      break;

    case 'CANCELLATION':
      await db.collection('users').doc(userId).update({
        'subscription.status'      : 'cancelled',
        'subscription.cancelledAt' : now,
      });
      break;

    case 'EXPIRATION':
      await db.collection('users').doc(userId).update({
        'subscription.status'    : 'expired',
        'subscription.expiredAt' : now,
      });
      break;

    default:
      console.log(`Unhandled RevenueCat event: ${type}`);
  }

  res.status(200).json({ received: true });
}
