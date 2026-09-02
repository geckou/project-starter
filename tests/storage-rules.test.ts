// Cloud Storage セキュリティルールのテスト。
// Storage エミュレーターが必要なため、yarn test には含めず
// `yarn test:rules`（firebase emulators:exec 経由）で実行する
import { readFileSync } from 'fs'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import type { FirebaseStorage } from 'firebase/storage'
import {
  deleteObject,
  getBytes,
  ref,
  uploadBytes,
  uploadString,
} from 'firebase/storage'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

let testEnv: RulesTestEnvironment

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-rules-test',
    storage: { rules: readFileSync('storage.rules', 'utf8') },
  })
})

afterAll(async () => {
  await testEnv.cleanup()
})

beforeEach(async () => {
  await testEnv.clearStorage()
})

// ルールを無効化した状態でファイルを置く（read / delete の前提を作るため）
async function seedFile(path: string) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await uploadString(ref(context.storage(), path), 'seeded')
  })
}

// ルールが許す形（画像・10MB 未満）でアップロードする
const IMAGE_METADATA = { contentType: 'image/png' }

function uploadImage(storage: FirebaseStorage, path: string) {
  return uploadString(ref(storage, path), 'data', 'raw', IMAGE_METADATA)
}

describe('users 領域', () => {
  it('本人は自分の領域を read できる', async () => {
    await seedFile('users/alice/avatar.png')

    const storage = testEnv.authenticatedContext('alice').storage()
    await assertSucceeds(getBytes(ref(storage, 'users/alice/avatar.png')))
  })

  it('本人は自分の領域に write できる', async () => {
    const storage = testEnv.authenticatedContext('alice').storage()
    await assertSucceeds(uploadImage(storage, 'users/alice/avatar.png'))
  })

  it('本人はネストしたパスにも write できる', async () => {
    const storage = testEnv.authenticatedContext('alice').storage()
    await assertSucceeds(uploadImage(storage, 'users/alice/photos/2026/a.png'))
  })

  it('他人の領域は read できない', async () => {
    await seedFile('users/alice/avatar.png')

    const storage = testEnv.authenticatedContext('bob').storage()
    await assertFails(getBytes(ref(storage, 'users/alice/avatar.png')))
  })

  it('他人の領域には write できない', async () => {
    const storage = testEnv.authenticatedContext('bob').storage()
    await assertFails(uploadImage(storage, 'users/alice/avatar.png'))
  })

  it('未認証では read できない', async () => {
    await seedFile('users/alice/avatar.png')

    const storage = testEnv.unauthenticatedContext().storage()
    await assertFails(getBytes(ref(storage, 'users/alice/avatar.png')))
  })

  it('未認証では write できない', async () => {
    const storage = testEnv.unauthenticatedContext().storage()
    await assertFails(uploadImage(storage, 'users/alice/avatar.png'))
  })
})

describe('users 領域のアップロード制限', () => {
  it('画像以外は拒否する', async () => {
    const storage = testEnv.authenticatedContext('alice').storage()

    await assertFails(
      uploadString(ref(storage, 'users/alice/memo.txt'), 'data', 'raw', {
        contentType: 'text/plain',
      })
    )
  })

  it('10MB 以上は拒否する', async () => {
    const storage = testEnv.authenticatedContext('alice').storage()
    const tooLarge = new Uint8Array(10 * 1024 * 1024 + 1)

    await assertFails(
      uploadBytes(
        ref(storage, 'users/alice/huge.png'),
        tooLarge,
        IMAGE_METADATA
      )
    )
  })

  it('10MB 未満の画像は通す', async () => {
    const storage = testEnv.authenticatedContext('alice').storage()
    const small = new Uint8Array(1024)

    await assertSucceeds(
      uploadBytes(ref(storage, 'users/alice/small.png'), small, IMAGE_METADATA)
    )
  })

  it('本人は削除できる（削除にはサイズ・種別の条件を課さない）', async () => {
    await seedFile('users/alice/avatar.png')

    const storage = testEnv.authenticatedContext('alice').storage()
    await assertSucceeds(deleteObject(ref(storage, 'users/alice/avatar.png')))
  })

  it('他人は削除できない', async () => {
    await seedFile('users/alice/avatar.png')

    const storage = testEnv.authenticatedContext('bob').storage()
    await assertFails(deleteObject(ref(storage, 'users/alice/avatar.png')))
  })
})

describe('未定義のパス', () => {
  it('認証済みでも read できない（デフォルト拒否）', async () => {
    await seedFile('misc/file.png')

    const storage = testEnv.authenticatedContext('alice').storage()
    await assertFails(getBytes(ref(storage, 'misc/file.png')))
  })

  it('認証済みでも write できない（デフォルト拒否）', async () => {
    const storage = testEnv.authenticatedContext('alice').storage()
    await assertFails(uploadImage(storage, 'misc/file.png'))
  })
})
