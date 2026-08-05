import { beforeEach, describe, expect, it, vi } from 'vitest'

// firebase SDK をモック
const mockInitializeApp = vi.fn((..._args: unknown[]) => 'new-app')
const mockGetApps = vi.fn<() => unknown[]>(() => [])
const mockGetAuth = vi.fn((..._args: unknown[]) => 'default-auth')
const mockGetFirestore = vi.fn((..._args: unknown[]) => 'mock-db')

vi.mock('firebase/app', () => ({
  initializeApp: (...args: unknown[]) => mockInitializeApp(...args),
  getApps: () => mockGetApps(),
}))

vi.mock('firebase/auth', () => ({
  getAuth: (...args: unknown[]) => mockGetAuth(...args),
}))

vi.mock('firebase/firestore', () => ({
  getFirestore: (...args: unknown[]) => mockGetFirestore(...args),
}))

import { initFirebase } from '../src/firebase'

const config = {
  apiKey: 'api-key',
  authDomain: 'example.firebaseapp.com',
  projectId: 'example',
  storageBucket: 'example.appspot.com',
  messagingSenderId: '123456',
  appId: 'app-id',
}

describe('initFirebase', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetApps.mockReturnValue([])
  })

  it('未初期化なら initializeApp を config 付きで呼ぶ', () => {
    const result = initFirebase(config)

    expect(mockInitializeApp).toHaveBeenCalledWith(config)
    expect(result.app).toBe('new-app')
    expect(result.auth).toBe('default-auth')
    expect(result.db).toBe('mock-db')
  })

  it('初期化済みなら既存の app を再利用する', () => {
    mockGetApps.mockReturnValue(['existing-app'])

    const result = initFirebase(config)

    expect(mockInitializeApp).not.toHaveBeenCalled()
    expect(result.app).toBe('existing-app')
  })

  it('デフォルトでは getAuth で Auth を生成する', () => {
    initFirebase(config)

    expect(mockGetAuth).toHaveBeenCalledWith('new-app')
  })

  it('createAuth ファクトリ指定時はそちらで Auth を生成する', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const customAuth = 'custom-auth' as any
    const createAuth = vi.fn(() => customAuth)

    const result = initFirebase(config, createAuth)

    expect(createAuth).toHaveBeenCalledWith('new-app')
    expect(mockGetAuth).not.toHaveBeenCalled()
    expect(result.auth).toBe('custom-auth')
  })

  it('db は app から getFirestore で生成する', () => {
    initFirebase(config)

    expect(mockGetFirestore).toHaveBeenCalledWith('new-app')
  })
})
