'use client'

import { initializeApp, getApps } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

// 環境変数の取得方法は web / mobile で異なるので、
// config を外部から受け取る形にする
export function initFirebase(config: {
  apiKey: string
  authDomain: string
  projectId: string
  storageBucket: string
  messagingSenderId: string
  appId: string
}) {
  const app = getApps().length === 0 ? initializeApp(config) : getApps()[0]

  return {
    app,
    auth: getAuth(app),
    db: getFirestore(app),
  }
}
