'use client'

import { create } from 'zustand'

type AuthUser = {
  uid: string
  email: string | null
  displayName: string | null
}

type AuthState = {
  user: AuthUser | null
  loading: boolean
  setUser: (user: AuthUser | null) => void
  setLoading: (loading: boolean) => void
  reset: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  setUser: (user) => set({ user, loading: false }),
  setLoading: (loading) => set({ loading }),
  reset: () => set({ user: null, loading: false }),
}))
