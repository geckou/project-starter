'use client'

import { initFirebase } from '@geckou/shared/firebase'
import { connectAuthEmulator } from 'firebase/auth'
import { connectFirestoreEmulator } from 'firebase/firestore'

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

if (
  typeof window !== 'undefined' &&
  process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true' &&
  auth &&
  db
) {
  const w = window as { __firebaseEmulatorConnected?: boolean }
  if (!w.__firebaseEmulatorConnected) {
    connectAuthEmulator(auth, 'http://localhost:9099', {
      disableWarnings: true,
    })
    connectFirestoreEmulator(db, 'localhost', 8080)
    w.__firebaseEmulatorConnected = true
  }
}

export { app, auth, db }
