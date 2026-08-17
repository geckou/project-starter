import { beforeEach, describe, expect, it, vi } from 'vitest'

// firebase/storage をモック
const mockGetStorage = vi.fn((..._args: unknown[]) => 'mock-storage')
const mockRef = vi.fn((..._args: unknown[]) => 'mock-storage-ref')
const mockGetDownloadURL = vi.fn()
const mockDeleteObject = vi.fn()
const mockUploadTaskOn = vi.fn()
const mockUploadBytesResumable = vi.fn((..._args: unknown[]) => ({
  on: mockUploadTaskOn,
  snapshot: { ref: 'mock-upload-ref' },
}))

vi.mock('firebase/storage', () => ({
  getStorage: (...args: unknown[]) => mockGetStorage(...args),
  ref: (...args: unknown[]) => mockRef(...args),
  uploadBytesResumable: (...args: unknown[]) =>
    mockUploadBytesResumable(...args),
  getDownloadURL: (...args: unknown[]) => mockGetDownloadURL(...args),
  deleteObject: (...args: unknown[]) => mockDeleteObject(...args),
}))

import {
  getFirebaseStorage,
  uploadFile,
  deleteFile,
  getFileUrl,
  type UploadProgress,
} from '../src/storage'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockApp = {} as any

type UploadCallbacks = [
  string,
  (snapshot: { bytesTransferred: number; totalBytes: number }) => void,
  (error: Error) => void,
  () => Promise<void>,
]

describe('Storage ヘルパー', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getFirebaseStorage', () => {
    it('app から Storage インスタンスを返す', () => {
      const storage = getFirebaseStorage(mockApp)

      expect(mockGetStorage).toHaveBeenCalledWith(mockApp)
      expect(storage).toBe('mock-storage')
    })
  })

  describe('uploadFile', () => {
    it('アップロード完了後に downloadUrl と path を返す', async () => {
      mockGetDownloadURL.mockResolvedValue('https://example.com/file.png')
      mockUploadTaskOn.mockImplementation((...args: UploadCallbacks) => {
        const [, , , onComplete] = args
        onComplete()
      })

      const result = await uploadFile(
        mockApp,
        'images/file.png',
        new Uint8Array([1, 2, 3])
      )

      expect(mockRef).toHaveBeenCalledWith('mock-storage', 'images/file.png')
      expect(mockGetDownloadURL).toHaveBeenCalledWith('mock-upload-ref')
      expect(result).toEqual({
        downloadUrl: 'https://example.com/file.png',
        path: 'images/file.png',
      })
    })

    it('進捗コールバックに進捗率を渡す', async () => {
      mockGetDownloadURL.mockResolvedValue('https://example.com/file.png')
      mockUploadTaskOn.mockImplementation((...args: UploadCallbacks) => {
        const [, onSnapshot, , onComplete] = args
        onSnapshot({ bytesTransferred: 50, totalBytes: 200 })
        onComplete()
      })

      const progressEvents: UploadProgress[] = []

      await uploadFile(mockApp, 'images/file.png', new Uint8Array(), (p) =>
        progressEvents.push(p)
      )

      expect(progressEvents).toEqual([
        { bytesTransferred: 50, totalBytes: 200, progress: 25 },
      ])
    })

    it('アップロード失敗時に reject する', async () => {
      mockUploadTaskOn.mockImplementation((...args: UploadCallbacks) => {
        const [, , onError] = args
        onError(new Error('upload failed'))
      })

      await expect(
        uploadFile(mockApp, 'images/file.png', new Uint8Array())
      ).rejects.toThrow('upload failed')
    })
  })

  describe('deleteFile', () => {
    it('パスの参照に対して deleteObject を呼ぶ', async () => {
      mockDeleteObject.mockResolvedValue(undefined)

      await deleteFile(mockApp, 'images/old.png')

      expect(mockRef).toHaveBeenCalledWith('mock-storage', 'images/old.png')
      expect(mockDeleteObject).toHaveBeenCalledWith('mock-storage-ref')
    })

    it('削除失敗時にエラーを投げる', async () => {
      mockDeleteObject.mockRejectedValue(new Error('not found'))

      await expect(deleteFile(mockApp, 'images/none.png')).rejects.toThrow(
        'not found'
      )
    })
  })

  describe('getFileUrl', () => {
    it('ダウンロード URL を返す', async () => {
      mockGetDownloadURL.mockResolvedValue('https://example.com/file.png')

      const url = await getFileUrl(mockApp, 'images/file.png')

      expect(mockRef).toHaveBeenCalledWith('mock-storage', 'images/file.png')
      expect(url).toBe('https://example.com/file.png')
    })
  })
})
