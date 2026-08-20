// Firestore セキュリティルールのテスト。
// Firestore エミュレーターが必要なため、yarn test には含めず
// `yarn test:rules`（firebase emulators:exec 経由）で実行する
import { readFileSync } from 'fs'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

let testEnv: RulesTestEnvironment

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-rules-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
})

afterAll(async () => {
  await testEnv.cleanup()
})

beforeEach(async () => {
  await testEnv.clearFirestore()
})

describe('users コレクション', () => {
  it('本人は自分のドキュメントを read できる', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users/alice'), { name: 'Alice' })
    })

    const db = testEnv.authenticatedContext('alice').firestore()
    await assertSucceeds(getDoc(doc(db, 'users/alice')))
  })

  it('他人のドキュメントは read できない', async () => {
    const db = testEnv.authenticatedContext('bob').firestore()
    await assertFails(getDoc(doc(db, 'users/alice')))
  })

  it('未認証では read できない', async () => {
    const db = testEnv.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(db, 'users/alice')))
  })

  it('本人は自分のドキュメントを create できる', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    await assertSucceeds(setDoc(doc(db, 'users/alice'), { name: 'Alice' }))
  })

  it('他人のドキュメントは create できない', async () => {
    const db = testEnv.authenticatedContext('bob').firestore()
    await assertFails(setDoc(doc(db, 'users/alice'), { name: 'Hacked' }))
  })

  it('本人は自分のドキュメントを update できる', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users/alice'), { name: 'Alice' })
    })

    const db = testEnv.authenticatedContext('alice').firestore()
    await assertSucceeds(
      updateDoc(doc(db, 'users/alice'), { name: 'Alice Updated' })
    )
  })

  it('本人でも subscription を含めて create はできない', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    await assertFails(
      setDoc(doc(db, 'users/alice'), {
        name: 'Alice',
        subscription: { status: 'active', source: 'stripe' },
      })
    )
  })

  it('本人でも stripeCustomerId を含めて create はできない', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    await assertFails(
      setDoc(doc(db, 'users/alice'), {
        name: 'Alice',
        stripeCustomerId: 'cus_fake',
      })
    )
  })

  it('本人でも subscription を update で書き換えられない', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users/alice'), { name: 'Alice' })
    })

    // 自己申告で有料ユーザーになれてしまわないことを確認する
    const db = testEnv.authenticatedContext('alice').firestore()
    await assertFails(
      updateDoc(doc(db, 'users/alice'), {
        subscription: { status: 'active', source: 'stripe' },
      })
    )
  })

  it('本人でも stripeCustomerId を update で書き換えられない', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users/alice'), { name: 'Alice' })
    })

    const db = testEnv.authenticatedContext('alice').firestore()
    await assertFails(
      updateDoc(doc(db, 'users/alice'), { stripeCustomerId: 'cus_other' })
    )
  })

  it('subscription を持つドキュメントでも他のフィールドは update できる', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users/alice'), {
        name: 'Alice',
        subscription: { status: 'active', source: 'stripe' },
      })
    })

    const db = testEnv.authenticatedContext('alice').firestore()
    await assertSucceeds(
      updateDoc(doc(db, 'users/alice'), { name: 'Alice Updated' })
    )
  })

  it('本人でも delete はできない', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users/alice'), { name: 'Alice' })
    })

    const db = testEnv.authenticatedContext('alice').firestore()
    await assertFails(deleteDoc(doc(db, 'users/alice')))
  })
})

describe('未定義のコレクション', () => {
  it('認証済みでも read できない（デフォルト拒否）', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    await assertFails(getDoc(doc(db, 'secrets/doc-1')))
  })

  it('認証済みでも write できない（デフォルト拒否）', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    await assertFails(setDoc(doc(db, 'secrets/doc-1'), { value: 'x' }))
  })
})

describe('billing_events コレクション', () => {
  it('クライアントからは read できない', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'billing_events/stripe_evt_1'), {
        uid: 'alice',
      })
    })

    const db = testEnv.authenticatedContext('alice').firestore()
    await assertFails(getDoc(doc(db, 'billing_events/stripe_evt_1')))
  })

  it('クライアントからは write できない', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    await assertFails(
      setDoc(doc(db, 'billing_events/stripe_evt_2'), { uid: 'alice' })
    )
  })
})
