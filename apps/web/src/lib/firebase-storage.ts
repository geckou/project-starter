'use client'

import {
  connectStorageEmulator,
  getStorage,
  type FirebaseStorage,
} from 'firebase/storage'

import { app, connectEmulatorOnce } from '@/lib/firebase-app'

// クライアントからファイルをアップロード・取得するページだけが import する。
// 繋がないとローカルでのアップロードが本番（または develop）のバケットへ行く。
// ポートは firebase.json の emulators.storage と揃える
export const storage: FirebaseStorage | null = app ? getStorage(app) : null

if (storage) {
  connectEmulatorOnce('storage', () =>
    connectStorageEmulator(storage, 'localhost', 9199)
  )
}
