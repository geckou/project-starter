// 課金の配線（apps/functions/src/lib/billing.ts）のテスト。
// 課金ロジック自体は @geckou/billing 側でテスト済みなので、ここで見るのは
// 「いつ何が読み込まれるか」「秘密をどこから取るか」だけ。
import { describe, expect, it, vi } from 'vitest'

// stripe SDK が評価されたかを記録する。vi.mock のファクトリは
// 最初の import まで実行されないので、これがそのまま「読み込まれたか」になる。
// vi.mock はファイル先頭へ巻き上げられるので、記録先も vi.hoisted で作る
const { loaded } = vi.hoisted(() => ({ loaded: { stripe: false } }))

vi.mock('stripe', () => {
  loaded.stripe = true

  return {
    default: class StripeStub {
      constructor(public readonly secretKey: string) {}
    },
  }
})

vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({}) }))
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => ({}) }))

// 配線が何を渡すかは @geckou/billing 側のテストが見る。ここでは呼べれば足りる
vi.mock('@geckou/billing', () => ({ createBilling: () => ({}) }))

describe('billing の配線', () => {
  // 回帰: モジュールの先頭で import Stripe すると、index.ts → api.ts の連鎖で
  // スケジュール関数・トリガーまで含む全関数のコールドスタートに乗る。
  // esbuild は --external:stripe なので node_modules から実ロードされる
  it('モジュールの読み込みでは stripe を読み込まない', async () => {
    await import('../src/lib/billing')

    expect(loaded.stripe).toBe(false)
  })

  it('STRIPE_SECRET_KEY があるときだけ、リクエスト時に stripe を読み込む', async () => {
    const { getBilling } = await import('../src/lib/billing')

    vi.stubEnv('STRIPE_SECRET_KEY', '')
    await getBilling()

    expect(loaded.stripe).toBe(false)

    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_dummy')
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_dummy')
    await getBilling()

    expect(loaded.stripe).toBe(true)

    vi.unstubAllEnvs()
  })

  // 回帰: 秘密を .env で配ると関数の環境変数としてデプロイされ、
  // 閲覧者ロールでも Cloud Console から読める
  it('BILLING_SECRETS が Secret Manager から取る 3 つを宣言する', async () => {
    const { BILLING_SECRETS } = await import('../src/lib/billing')

    expect(BILLING_SECRETS.map((secret) => secret.name)).toEqual([
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'REVENUECAT_WEBHOOK_AUTH',
    ])
  })
})
