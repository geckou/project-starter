import type { Subscription } from '@geckou/shared'

/**
 * 権利状態が変化したときに呼ばれるフック。
 *
 * このファイルは **派生プロジェクトが編集する場所** で、テンプレートでは何もしない。
 * Webhook のトランザクション確定後に呼ばれるため、複数ドキュメントの更新や
 * 削除など、時間のかかる処理を書いてよい。
 *
 * ここで例外を投げても Webhook は 500 にならない（権利状態の反映自体は
 * 既に確定しているため、Stripe / RevenueCat に再送させる意味がない）。
 * 失敗した場合はログに残るので、監視して手動で復旧する。
 */

/**
 * 権利が「無効 → 有効」に変わったときに呼ばれる。
 *
 * 実装例:
 * - ダウングレード時に無効化した機能を再度有効化する
 * - 有料プラン限定のコレクションへの書き込みを解禁する
 */
export async function onSubscriptionUpgraded(
  uid: string,
  subscription: Subscription
): Promise<void> {
  console.log(`Subscription upgraded: ${uid} (${subscription.source})`)
}

/**
 * 権利が「有効 → 無効」に変わったときに呼ばれる。
 *
 * **無料プランの制限にデータを収める後始末をここに書く。**
 * これが無いと、解約後も有料プラン時に作ったデータが残り続けてしまう。
 *
 * 実装例:
 * - 有料プランで作った項目を無効化する（削除ではなく enabled: false が安全）
 * - 無料プランの上限を超えた分を、更新日の新しい順に残して整理する
 * - 有料機能で生成したファイルを Storage から削除する
 */
export async function onSubscriptionDowngraded(
  uid: string,
  subscription: Subscription
): Promise<void> {
  console.log(`Subscription downgraded: ${uid} (${subscription.status})`)
}
