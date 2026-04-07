'use client'

import { initFirebase } from '@geckou/shared'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
}

// 環境変数が未設定の場合（テンプレート初期状態）は初期化をスキップ
const isConfigured = firebaseConfig.apiKey !== ''

const firebase = isConfigured
  ? initFirebase(firebaseConfig)
  : { app: null, auth: null, db: null }

const { app, auth, db } = firebase

export { app, auth, db }
