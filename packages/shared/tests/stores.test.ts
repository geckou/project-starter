import { describe, expect, it } from 'vitest'
import { useAuthStore } from '../src/stores/auth-store'

describe('useAuthStore', () => {
  it('has correct initial state', () => {
    const state = useAuthStore.getState()
    expect(state.user).toBeNull()
    expect(state.loading).toBe(true)
  })

  it('setUser updates user and sets loading to false', () => {
    const mockUser = {
      uid: 'test-uid',
      email: 'test@example.com',
      displayName: 'Test User',
    }

    useAuthStore.getState().setUser(mockUser)

    const state = useAuthStore.getState()
    expect(state.user).toEqual(mockUser)
    expect(state.loading).toBe(false)
  })

  it('reset clears user and sets loading to false', () => {
    useAuthStore.getState().setUser({
      uid: 'test-uid',
      email: 'test@example.com',
      displayName: 'Test User',
    })

    useAuthStore.getState().reset()

    const state = useAuthStore.getState()
    expect(state.user).toBeNull()
    expect(state.loading).toBe(false)
  })

  it('setLoading updates loading', () => {
    useAuthStore.getState().setLoading(true)
    expect(useAuthStore.getState().loading).toBe(true)

    useAuthStore.getState().setLoading(false)
    expect(useAuthStore.getState().loading).toBe(false)
  })
})
