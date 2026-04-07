import 'server-only'

import {
  cert,
  getApps,
  initializeApp,
  type ServiceAccount,
} from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

function getAdminApp() {
  if (getApps().length > 0) {
    return getApps()[0]
  }

  // JSON string of service account key (Vercel 等の環境変数ベースのデプロイ向け)
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  if (serviceAccountJson) {
    const serviceAccount: ServiceAccount = JSON.parse(serviceAccountJson)
    return initializeApp({ credential: cert(serviceAccount) })
  }

  // Application Default Credentials (Cloud Run, Cloud Functions, ローカルの gcloud auth)
  return initializeApp()
}

// 環境変数が未設定の場合（テンプレート初期状態）はビルドを通すためスキップ
const isConfigured =
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
  process.env.GOOGLE_APPLICATION_CREDENTIALS

const adminApp = isConfigured ? getAdminApp() : null

export const adminAuth = adminApp ? getAuth(adminApp) : (null as never)
export const adminDb = adminApp ? getFirestore(adminApp) : (null as never)
