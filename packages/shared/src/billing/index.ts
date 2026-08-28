// 権利判定の実装は @geckou/billing に移管した（geckou/kit で管理・npm 配布）。
// クライアント（web / mobile）からも使うため、Node 専用コードを含まない
// ./entitlement サブパスを re-export する。
// Webhook 処理・Checkout 等のサーバー側 API は apps/functions が
// @geckou/billing 本体を直接 import する。
export {
  hasPlan,
  isSubscriptionActive,
  type Subscription,
  type SubscriptionSource,
  type SubscriptionStatus,
} from '@geckou/billing/entitlement'
