import { describe, expect, it, vi, beforeEach } from 'vitest'

// firebase/firestore をモック
const mockGetDoc = vi.fn()
const mockGetDocs = vi.fn()
const mockAddDoc = vi.fn()
const mockSetDoc = vi.fn()
const mockUpdateDoc = vi.fn()
const mockDeleteDoc = vi.fn()
const mockOnSnapshot = vi.fn()

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => 'mock-collection-ref'),
  doc: vi.fn(() => 'mock-doc-ref'),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  addDoc: (...args: unknown[]) => mockAddDoc(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
  deleteDoc: (...args: unknown[]) => mockDeleteDoc(...args),
  onSnapshot: (...args: unknown[]) => mockOnSnapshot(...args),
  query: vi.fn((_ref, ...constraints) => ({ _ref, constraints })),
  where: vi.fn((field, op, value) => ({ type: 'where', field, op, value })),
  orderBy: vi.fn((field, direction) => ({
    type: 'orderBy',
    field,
    direction,
  })),
  limit: vi.fn((n) => ({ type: 'limit', n })),
  startAfter: vi.fn((cursor) => ({ type: 'startAfter', cursor })),
}))

import {
  getDocument,
  queryDocuments,
  createDocument,
  setDocument,
  updateDocument,
  removeDocument,
  subscribeCollection,
  subscribeDocument,
} from '../src/firestore'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDb = {} as any

describe('Firestore ヘルパー', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getDocument', () => {
    it('存在するドキュメントを取得する', async () => {
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        id: 'doc-1',
        data: () => ({ name: 'テスト' }),
      })

      const result = await getDocument(mockDb, 'users', 'doc-1')

      expect(result.success).toBe(true)

      if (result.success) {
        expect(result.data).toEqual({ id: 'doc-1', name: 'テスト' })
      }
    })

    it('存在しないドキュメントは null を返す', async () => {
      mockGetDoc.mockResolvedValue({
        exists: () => false,
      })

      const result = await getDocument(mockDb, 'users', 'none')

      expect(result.success).toBe(true)

      if (result.success) {
        expect(result.data).toBeNull()
      }
    })

    it('エラー時に success: false を返す', async () => {
      mockGetDoc.mockRejectedValue(new Error('Network error'))

      const result = await getDocument(mockDb, 'users', 'doc-1')

      expect(result.success).toBe(false)

      if (!result.success) {
        expect(result.error).toBe('Network error')
      }
    })
  })

  describe('createDocument', () => {
    it('ドキュメントを作成し ID を返す', async () => {
      mockAddDoc.mockResolvedValue({ id: 'new-doc-id' })

      const result = await createDocument(mockDb, 'posts', { title: 'テスト' })

      expect(result.success).toBe(true)

      if (result.success) {
        expect(result.data).toBe('new-doc-id')
      }
    })
  })

  describe('setDocument', () => {
    it('ドキュメントを書き込む', async () => {
      mockSetDoc.mockResolvedValue(undefined)

      const result = await setDocument(mockDb, 'users', 'u1', { name: 'test' })

      expect(result.success).toBe(true)
    })
  })

  describe('updateDocument', () => {
    it('ドキュメントを部分更新する', async () => {
      mockUpdateDoc.mockResolvedValue(undefined)

      const result = await updateDocument(mockDb, 'users', 'u1', {
        name: 'updated',
      })

      expect(result.success).toBe(true)
    })
  })

  describe('removeDocument', () => {
    it('ドキュメントを削除する', async () => {
      mockDeleteDoc.mockResolvedValue(undefined)

      const result = await removeDocument(mockDb, 'users', 'u1')

      expect(result.success).toBe(true)
    })
  })

  describe('queryDocuments', () => {
    it('クエリ結果を返す', async () => {
      mockGetDocs.mockResolvedValue({
        docs: [
          { id: 'd1', data: () => ({ title: 'A' }) },
          { id: 'd2', data: () => ({ title: 'B' }) },
        ],
      })

      const result = await queryDocuments(mockDb, 'posts')

      expect(result.success).toBe(true)

      if (result.success) {
        expect(result.data.items).toHaveLength(2)
        expect(result.data.items[0]).toEqual({ id: 'd1', title: 'A' })
        expect(result.data.lastDoc).toBeDefined()
      }
    })

    it('空のコレクションでは lastDoc が null', async () => {
      mockGetDocs.mockResolvedValue({ docs: [] })

      const result = await queryDocuments(mockDb, 'posts')

      expect(result.success).toBe(true)

      if (result.success) {
        expect(result.data.items).toHaveLength(0)
        expect(result.data.lastDoc).toBeNull()
      }
    })
  })

  describe('subscribeCollection', () => {
    it('unsubscribe 関数を返す', () => {
      const mockUnsubscribe = vi.fn()
      mockOnSnapshot.mockReturnValue(mockUnsubscribe)

      const unsubscribe = subscribeCollection(mockDb, 'posts', {}, () => {})

      expect(typeof unsubscribe).toBe('function')
    })
  })

  describe('subscribeDocument', () => {
    it('unsubscribe 関数を返す', () => {
      const mockUnsubscribe = vi.fn()
      mockOnSnapshot.mockReturnValue(mockUnsubscribe)

      const unsubscribe = subscribeDocument(mockDb, 'posts', 'doc-1', () => {})

      expect(typeof unsubscribe).toBe('function')
    })
  })
})
