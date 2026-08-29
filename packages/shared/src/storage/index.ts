'use client'

// 実装は @geckou/firebase-client/storage に移管した（geckou/kit で管理・npm 配布）。
// 既存の @geckou/shared/storage からの import を壊さないよう re-export する。
export {
  deleteFile,
  getFileUrl,
  getFirebaseStorage,
  uploadFile,
  type UploadProgress,
  type UploadResult,
} from '@geckou/firebase-client/storage'
