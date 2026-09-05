// layer:billing:start
import type { Subscription } from '@geckou/billing/entitlement'
// layer:billing:end

/**
 * Firestore の日時。**書き込むときは `Date`、読み出すと `Timestamp`**（`toDate()` を持つ）
 * になるため、両方を受ける形で持つ。値として使うときは `toDate()`（`@geckou/shared` が
 * export するユーティリティ）を通すこと。
 *
 * billing 層が使う権利判定パッケージの同名の型と同じ形。billing 層を持たない構成でも
 * 使えるよう、ここでも定義している
 */
export type DateLike = Date | { toDate: () => Date }

/** ユーザー */
export type User = {
  id: string
  displayName: string
  email: string
  // layer:billing:start
  subscription?: Subscription
  /** Stripe の顧客 ID。Web 決済を使う場合のみ設定される（サーバーのみ書き込み可） */
  stripeCustomerId?: string
  // layer:billing:end
  /** Firestore から読み出すと Timestamp。値として使うときは toDate() を通す */
  createdAt: DateLike
}

// layer:billing:start
// Subscription 関連の型は @geckou/billing が正（実装と同じパッケージで管理する）。
// ここからも re-export して、既存の `@geckou/shared` からの import を壊さない
export type {
  Subscription,
  SubscriptionSource,
  SubscriptionStatus,
} from '@geckou/billing/entitlement'
// layer:billing:end

/** API レスポンスの共通型 */
export type ApiResponse<T> = {
  success: boolean
  data?: T
  error?: string
}
