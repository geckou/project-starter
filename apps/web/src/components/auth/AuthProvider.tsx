'use client'

import { onAuthStateChanged } from 'firebase/auth'
import { useEffect } from 'react'
import { useAuthStore } from '@geckou/shared/stores'
import { auth } from '@/lib/firebase'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const setUser = useAuthStore((state) => state.setUser)
  const setLoading = useAuthStore((state) => state.setLoading)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
        })
      } else {
        setUser(null)
      }
    })

    return () => unsubscribe()
  }, [setUser, setLoading])

  return <>{children}</>
}
