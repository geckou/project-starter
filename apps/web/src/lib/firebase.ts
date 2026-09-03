'use client'

import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth'

import { app, connectEmulatorOnce } from '@/lib/firebase-app'

// Auth だけを初期化する。Firestore / Storage は使う側が
// @/lib/firebase-firestore / @/lib/firebase-storage を import する
// （まとめて初期化すると、Auth しか使わないページにも他の SDK が乗る）
export const auth: Auth | null = app ? getAuth(app) : null

if (auth) {
  connectEmulatorOnce('auth', () =>
    connectAuthEmulator(auth, 'http://localhost:9099', {
      disableWarnings: true,
    })
  )
}

export { app }
