import Constants from 'expo-constants'
import { Platform } from 'react-native'
import Purchases from 'react-native-purchases'

const extra = Constants.expoConfig?.extra ?? {}

export async function initializeRevenueCat() {
  const apiKey =
    Platform.OS === 'ios'
      ? extra.revenuecatApiKeyApple
      : extra.revenuecatApiKeyGoogle

  if (!apiKey) return

  Purchases.configure({ apiKey })
}

/** Firebase UID と RevenueCat ユーザーを紐付ける */
export async function loginRevenueCat(uid: string) {
  await Purchases.logIn(uid)
}

export async function logoutRevenueCat() {
  await Purchases.logOut()
}

export async function getCustomerInfo() {
  return Purchases.getCustomerInfo()
}

export async function getOfferings() {
  return Purchases.getOfferings()
}
