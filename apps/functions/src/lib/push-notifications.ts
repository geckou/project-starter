import {
  sendPushNotification as sendOne,
  sendPushNotificationBatch as sendBatch,
  type BatchPushResult,
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
// 戻り値を絞ると invalidTokens（保存先から消すべきトークン）が呼び出し側へ
// 届かないため、BatchPushResult をそのまま返す
export function sendPushNotificationBatch(
  fcmTokens: string[],
  payload: PushNotificationPayload
): Promise<BatchPushResult> {
  return sendBatch(getMessaging(), fcmTokens, payload)
}
