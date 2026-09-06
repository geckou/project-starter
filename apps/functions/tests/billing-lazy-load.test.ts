// stripe SDK を「モジュールの読み込みでは評価しない」ことだけを見るテスト。
//
// billing-wiring.test.ts から分けてあるのは、この 1 件だけ signal の取り方が違うため。
// ここでは vi.mock のファクトリが走ったかどうか（= stripe モジュールが評価されたか）を
// 見る。ファクトリはモックレジストリにキャッシュされ、同じファイル内では
// vi.resetModules() でも再実行されないので、この signal はファイルの中で
// 「最初の 1 回」しか意味を持たない。同居させると実行順に依存する
// （逆に billing-wiring 側の getter 方式は、静的 import を関数内でしか使わない形に
//   戻す回帰を検出できない。vite の SSR 変換で import と .default 参照が分かれるため）。
// vitest はファイル単位でモックレジストリを分けるので、分ければ両方が成立する。
import { describe, expect, it, vi } from 'vitest'

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
vi.mock('@geckou/billing', () => ({ createBilling: () => ({}) }))

describe('billing の遅延読み込み', () => {
  // 回帰: モジュールの先頭で import Stripe すると、index.ts → api.ts の連鎖で
  // スケジュール関数・トリガーまで含む全関数のコールドスタートに乗る。
  // esbuild は --external:stripe なので node_modules から実ロードされる
  it('モジュールの読み込みでは stripe を読み込まない', async () => {
    await import('../src/lib/billing')

    expect(loaded.stripe).toBe(false)
  })
})
