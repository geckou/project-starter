// layer:billing:start
import type { Subscription } from '@geckou/billing/entitlement'
// layer:billing:end

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
  createdAt: Date
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
