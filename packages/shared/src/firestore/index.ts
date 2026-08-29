'use client'

// 実装は @geckou/firebase-client/firestore に移管した（geckou/kit で管理・npm 配布）。
// 既存の @geckou/shared/firestore からの import を壊さないよう re-export する。
export {
  createDocument,
  getDocument,
  queryDocuments,
  removeDocument,
  setDocument,
  subscribeCollection,
  subscribeDocument,
  updateDocument,
  type FirestoreResult,
  type QueryOptions,
} from '@geckou/firebase-client/firestore'
