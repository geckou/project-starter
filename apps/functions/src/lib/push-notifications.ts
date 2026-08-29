import {
  sendPushNotification as sendOne,
  sendPushNotificationBatch as sendBatch,
  type PushNotificationPayload,
} from '@geckou/firebase-server'
import { getMessaging } from 'firebase-admin/messaging'

/**
 * FCM によるプッシュ通知の送信。
 * 実装は @geckou/firebase-server（geckou/kit）にあり、ここは firebase-admin の
 * Messaging を注入するだけ
 */

/**
 * 単一デバイスにプッシュ通知を送信
 */
export function sendPushNotification(
  fcmToken: string,
  payload: PushNotificationPayload
): Promise<string> {
  return sendOne(getMessaging(), fcmToken, payload)
}

/**
 * 複数デバイスにプッシュ通知を一括送信
 */
export function sendPushNotificationBatch(
  fcmTokens: string[],
  payload: PushNotificationPayload
): Promise<{ successCount: number; failureCount: number }> {
  return sendBatch(getMessaging(), fcmTokens, payload)
}
