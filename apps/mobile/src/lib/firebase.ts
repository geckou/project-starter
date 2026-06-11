import { initFirebase } from '@geckou/shared/firebase'
// getReactNativePersistence は react-native ビルドにのみ存在し、
// firebase/auth の公開型定義には含まれない（firebase-js-sdk の既知問題）。
// 実体は Metro が exports の react-native 条件で解決する
// @ts-ignore: react-native ビルド専用 API のため公開型定義に存在しない
import { initializeAuth, getReactNativePersistence } from 'firebase/auth'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'

const extra = Constants.expoConfig?.extra ?? {}

// React Native では getAuth() だと永続化されず、アプリ再起動でログイン状態が消える。
// AsyncStorage を使った永続化付きで Auth を初期化する
const { app, auth, db } = initFirebase(
  {
    apiKey: extra.firebaseApiKey ?? '',
    authDomain: extra.firebaseAuthDomain ?? '',
    projectId: extra.firebaseProjectId ?? '',
    storageBucket: extra.firebaseStorageBucket ?? '',
    messagingSenderId: extra.firebaseMessagingSenderId ?? '',
    appId: extra.firebaseAppId ?? '',
  },
  (firebaseApp) =>
    initializeAuth(firebaseApp, {
      persistence: getReactNativePersistence(AsyncStorage),
    })
)

export { app, auth, db }
