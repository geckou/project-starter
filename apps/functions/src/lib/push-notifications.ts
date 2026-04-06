import { getMessaging } from 'firebase-admin/messaging'

type PushNotificationPayload = {
  title: string
  body: string
  data?: Record<string, string>
}

/**
 * 単一デバイスにプッシュ通知を送信
 */
export async function sendPushNotification(
  fcmToken: string,
  payload: PushNotificationPayload
): Promise<string> {
  const message = {
    token: fcmToken,
    notification: {
      title: payload.title,
      body: payload.body,
    },
    data: payload.data,
  }

  return getMessaging().send(message)
}

/**
 * 複数デバイスにプッシュ通知を一括送信
 */
export async function sendPushNotificationBatch(
  fcmTokens: string[],
  payload: PushNotificationPayload
): Promise<{ successCount: number; failureCount: number }> {
  if (fcmTokens.length === 0) {
    return { successCount: 0, failureCount: 0 }
  }

  const message = {
    notification: {
      title: payload.title,
      body: payload.body,
    },
    data: payload.data,
  }

  const response = await getMessaging().sendEachForMulticast({
    tokens: fcmTokens,
    ...message,
  })

  return {
    successCount: response.successCount,
    failureCount: response.failureCount,
  }
}
