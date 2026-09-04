'use client'

import {
  connectFirestoreEmulator,
  getFirestore,
  type Firestore,
} from 'firebase/firestore'

import { app, connectEmulatorOnce } from '@/lib/firebase-app'

// クライアントから Firestore を読む（リアルタイム購読等）ページだけが import する。
// ポートは firebase.json の emulators.firestore と揃える
export const db: Firestore | null = app ? getFirestore(app) : null

if (db) {
  connectEmulatorOnce('firestore', () =>
    connectFirestoreEmulator(db, 'localhost', 8080)
  )
}
