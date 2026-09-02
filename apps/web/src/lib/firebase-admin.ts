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

// 初期化を試み、失敗したときだけ「未設定」として扱う。
//
// 環境変数の有無で判定してはいけない。Cloud Functions / Cloud Run の ADC は
// メタデータサーバー経由で認証するため GOOGLE_APPLICATION_CREDENTIALS が付かず、
// 「本番は ADC を使う」という .env.example どおりの設定で保護ページが 500 になる。
// テンプレート初期状態（認証情報がまったく無い）でもビルドは通す必要があるため、
// throw は握って Proxy へフォールバックする
function initAdminApp() {
  try {
    return getAdminApp()
  } catch (error) {
    console.warn('firebase-admin の初期化に失敗しました', error)
    return null
  }
}

const adminApp = initAdminApp()

// 未設定のままアクセスした場合に原因が分かるエラーを投げる
// （null のままだと「Cannot read properties of null」になり原因が追えない）
function createNotConfiguredProxy<T extends object>(): T {
  return new Proxy({} as T, {
    get() {
      throw new Error(
        'firebase-admin を初期化できませんでした。Cloud Run / Cloud Functions では ADC が自動で使われます。それ以外の環境では FIREBASE_SERVICE_ACCOUNT_KEY または GOOGLE_APPLICATION_CREDENTIALS を設定してください'
      )
    },
  })
}

export const adminAuth = adminApp
  ? getAuth(adminApp)
  : createNotConfiguredProxy<ReturnType<typeof getAuth>>()
export const adminDb = adminApp
  ? getFirestore(adminApp)
  : createNotConfiguredProxy<ReturnType<typeof getFirestore>>()
