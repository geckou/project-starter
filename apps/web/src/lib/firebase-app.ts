'use client'

import { getApps, initializeApp, type FirebaseApp } from 'firebase/app'

// Firebase の各 SDK はモジュールを分けて持つ。1 つのファイルで Auth と Firestore を
// まとめて初期化すると、Auth しか要らないページ（/billing 等）の初期 JS にも
// Firestore SDK が丸ごと乗る。ここは app の初期化とエミュレーター接続の
// 共通部分だけを持ち、SDK ごとの初期化は firebase-<SDK>.ts が受け持つ。
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

// 初期化済みの app があればそれを使う（Fast Refresh や複数モジュールからの
// 読み込みで initializeApp を二度呼ぶと duplicate-app で throw する）
export const app: FirebaseApp | null = isConfigured
  ? (getApps()[0] ?? initializeApp(firebaseConfig))
  : null

/**
 * エミュレーターへの接続を SDK ごとに 1 回だけ行う。
 * connect*Emulator は同じインスタンスに二度呼ぶと throw するため、
 * 接続済みかどうかを window に持つ。
 */
export function connectEmulatorOnce(sdk: string, connect: () => void) {
  if (!app) return
  if (typeof window === 'undefined') return
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR !== 'true') return

  const global = window as { __firebaseEmulators?: Record<string, boolean> }
  const connected = (global.__firebaseEmulators ??= {})

  if (connected[sdk]) return

  connected[sdk] = true
  connect()
}
