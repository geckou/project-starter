// @ts-nocheck -- expo-notifications, expo-device をインストール後にこの行を削除
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { Platform } from 'react-native'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

/**
 * プッシュ通知の権限をリクエストし、Expo Push Token を取得
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.warn('プッシュ通知は実機でのみ動作します')
    return null
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync()

  let finalStatus = existingStatus

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') {
    console.warn('プッシュ通知の権限が拒否されました')
    return null
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId

  if (!projectId) {
    console.error('EAS projectId が設定されていません')
    return null
  }

  const token = await Notifications.getExpoPushTokenAsync({ projectId })

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
    })
  }

  return token.data
}

/**
 * 通知リスナーを登録
 */
export function addNotificationListener(
  onReceived: (notification: Notifications.Notification) => void,
  onResponse: (response: Notifications.NotificationResponse) => void
) {
  const receivedSubscription =
    Notifications.addNotificationReceivedListener(onReceived)

  const responseSubscription =
    Notifications.addNotificationResponseReceivedListener(onResponse)

  return () => {
    receivedSubscription.remove()
    responseSubscription.remove()
  }
}
