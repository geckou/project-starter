// 課金の配線（apps/functions/src/lib/billing.ts）のテスト。
// 課金ロジック自体は @geckou/billing 側でテスト済みなので、ここで見るのは
// 「いつ何が読み込まれるか」「秘密をどこから取るか」だけ。
import { beforeEach, describe, expect, it, vi } from 'vitest'

// stripe が「リクエスト時に」読み込まれたかを記録する。
// vi.mock のファクトリは**モックレジストリにキャッシュされ、vi.resetModules() でも
// 再実行されない**ため、「ファクトリが走ったか」を signal にすると最初のケースでしか
// 機能しない（実行順に依存する）。代わりに default エクスポートを getter にして、
// billing.ts が `(await import('stripe')).default` に触った時点を記録する。
// この形は「モジュールの読み込みでは評価しない」ことの検証には弱いので、
// そちらは billing-lazy-load.test.ts に分けてある。
// vi.mock はファイル先頭へ巻き上げられるので、記録先も vi.hoisted で作る
const { loaded } = vi.hoisted(() => ({ loaded: { stripe: false } }))

// createBilling へ渡した設定を覗くための記録先。
// vi.mock のファクトリから書くので vi.hoisted で作る
const { passed } = vi.hoisted(() => ({
  passed: { config: undefined as Record<string, unknown> | undefined },
}))

vi.mock('stripe', () => {
  class StripeStub {
    constructor(public readonly secretKey: string) {}
  }

  return {
    get default() {
      loaded.stripe = true

      return StripeStub
    },
  }
})

vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({}) }))
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => ({}) }))

// 課金ロジックは @geckou/billing 側のテストが見る。ここは渡した設定だけ記録する
vi.mock('@geckou/billing', () => ({
  createBilling: (config: Record<string, unknown>) => {
    passed.config = config

    return {}
  },
}))

/** getBilling を env 付きで呼び、createBilling へ渡った stripe 設定を返す */
async function stripeConfigWith(env: Record<string, string>) {
  const { getBilling } = await import('../src/lib/billing')

  // 呼び出しごとに消す。キャッシュが返った場合に前回の設定が残っていると、
  // 「作り直されなかった」ことが stale な値として現れて読みにくい
  passed.config = undefined

  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_dummy')
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_dummy')
  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value)
  }

  try {
    await getBilling()
  } finally {
    vi.unstubAllEnvs()
  }

  // 上で undefined を代入しているため、TS はここまで narrow したままになる
  // （実際に書くのは vi.mock のファクトリなので推論では追えない）
  const config = passed.config as Record<string, unknown> | undefined

  return config?.stripe as Record<string, unknown> | undefined
}

describe('billing の配線', () => {
  // 各ケースを独立させる。loaded.stripe は一方向にしか変わらないうえ、
  // getBilling のキャッシュはモジュールスコープに持たれるため、
  // リセットしないと「先に走ったケース次第で結果が変わる」テストになる
  // （--sequence.shuffle で落ちていた）
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
    loaded.stripe = false
    passed.config = undefined
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

  // 回帰: @geckou/billing 0.7.0 で livemode ガードが入ったが配線が追従しておらず、
  // テストキーで動かす環境の Webhook が既定で全部無視されていた
  it('STRIPE_ALLOW_TEST_MODE=true でテストモードの Webhook を適用する', async () => {
    const stripe = await stripeConfigWith({ STRIPE_ALLOW_TEST_MODE: 'true' })

    expect(stripe?.allowTestMode).toBe(true)
  })

  it('未設定 / true 以外なら適用しない（本番を守る既定）', async () => {
    expect(
      (await stripeConfigWith({ STRIPE_ALLOW_TEST_MODE: '' }))?.allowTestMode
    ).toBe(false)
    expect(
      (await stripeConfigWith({ STRIPE_ALLOW_TEST_MODE: 'TRUE' }))
        ?.allowTestMode
    ).toBe(false)
  })

  // 回帰: env を BILLING_ENV_KEYS に足し忘れると、環境を切り替えても
  // キャッシュした Billing が返り続ける
  it('STRIPE_ALLOW_TEST_MODE の変化でキャッシュを作り直す', async () => {
    expect(
      (await stripeConfigWith({ STRIPE_ALLOW_TEST_MODE: 'true' }))
        ?.allowTestMode
    ).toBe(true)
    expect(
      (await stripeConfigWith({ STRIPE_ALLOW_TEST_MODE: '' }))?.allowTestMode
    ).toBe(false)
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
