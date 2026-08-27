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
import { getBytes, ref, uploadString } from 'firebase/storage'
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

// ルールを無効化した状態でファイルを置く（read の前提を作るため）
async function seedFile(path: string) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await uploadString(ref(context.storage(), path), 'seeded')
  })
}

describe('users 領域', () => {
  it('本人は自分の領域を read できる', async () => {
    await seedFile('users/alice/avatar.png')

    const storage = testEnv.authenticatedContext('alice').storage()
    await assertSucceeds(getBytes(ref(storage, 'users/alice/avatar.png')))
  })

  it('本人は自分の領域に write できる', async () => {
    const storage = testEnv.authenticatedContext('alice').storage()
    await assertSucceeds(
      uploadString(ref(storage, 'users/alice/avatar.png'), 'data')
    )
  })

  it('本人はネストしたパスにも write できる', async () => {
    const storage = testEnv.authenticatedContext('alice').storage()
    await assertSucceeds(
      uploadString(ref(storage, 'users/alice/photos/2026/a.png'), 'data')
    )
  })

  it('他人の領域は read できない', async () => {
    await seedFile('users/alice/avatar.png')

    const storage = testEnv.authenticatedContext('bob').storage()
    await assertFails(getBytes(ref(storage, 'users/alice/avatar.png')))
  })

  it('他人の領域には write できない', async () => {
    const storage = testEnv.authenticatedContext('bob').storage()
    await assertFails(
      uploadString(ref(storage, 'users/alice/avatar.png'), 'hacked')
    )
  })

  it('未認証では read できない', async () => {
    await seedFile('users/alice/avatar.png')

    const storage = testEnv.unauthenticatedContext().storage()
    await assertFails(getBytes(ref(storage, 'users/alice/avatar.png')))
  })

  it('未認証では write できない', async () => {
    const storage = testEnv.unauthenticatedContext().storage()
    await assertFails(
      uploadString(ref(storage, 'users/alice/avatar.png'), 'data')
    )
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
    await assertFails(uploadString(ref(storage, 'misc/file.png'), 'data'))
  })
})
