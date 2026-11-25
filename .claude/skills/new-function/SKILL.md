---
name: new-function
description: Firebase Cloud Function を追加する
---

# new-function

`apps/functions/src/` に新しい Cloud Function を追加する。

## 手順

1. ユーザーに関数の種類を確認する:
   - **HTTP**: REST API エンドポイント（Express ルートとして `api.ts` に追加）
   - **スケジュール**: 定期実行（cron 形式）
   - **Firestore トリガー**: ドキュメントの作成・更新・削除に反応
2. 該当するファイルに関数を追加する
3. 関数を**環境別**か**全環境共通**かに分類し、`index.ts` と `apps/functions/function-environments.json` の
   両方に書く（→ `.claude/docs/git-workflow.md`「Functions は環境別と全環境共通に分けて配る」）
   - **環境別**（HTTP のように、クライアントが環境ごとの URL を選ぶもの）: `index.ts` の `perEnvironment` に
     足し、production の名前でも export する。宣言の `perEnvironment` に名前を足す。
     develop / staging では `develop-<名前>` / `staging-<名前>` として配られる
   - **全環境共通**（スケジュール・Firestore / Storage / Auth のトリガー）: `index.ts` から production の名前で
     export し、宣言の `shared` に名前を足す。production のデプロイでだけ配られる。
     **トリガーを環境別にしない**（データは全環境で 1 つなので、3 環境ぶんが同じ書き込みで発火する）
   - 片方にだけ書くと `apps/functions/tests/function-environments.test.ts` が落ちる

## テンプレート

### HTTP エンドポイント（api.ts に追加）

認証は `lib/auth-middleware.ts` の `requireAuth` ミドルウェアを使う
（手書きのトークン検証は書かない）。`api.ts` には import 済み。

```typescript
// apps/functions/src/api.ts に追加
import { requireAuth, type AuthenticatedRequest } from './lib/auth-middleware'

// 注意: Express 4 は async ハンドラの reject を捕捉しないため、
// 各ハンドラ内で try/catch してエラーレスポンスを返すこと
app.post('/endpoint-name', requireAuth, async (req, res) => {
  const uid = (req as AuthenticatedRequest).uid

  try {
    // ロジック
    // 成否は HTTP ステータスで表す。apiClient はボディをそのまま
    // ApiResponse.data に入れるため、{ success, data } で包まない
    res.json({ id: 'created-id' })
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
})
```

### スケジュール関数（新規ファイル）

```typescript
// apps/functions/src/scheduled.ts
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { getFirestore } from 'firebase-admin/firestore'

// api.ts と同じく region を asia-northeast1 に揃える
export const dailyCleanup = onSchedule(
  { schedule: 'every day 03:00', timeZone: 'Asia/Tokyo', region: 'asia-northeast1' },
  async () => {
    const db = getFirestore()
    // クリーンアップ処理
  }
)
```

### Firestore トリガー（新規ファイル）

```typescript
// apps/functions/src/triggers.ts
import { onDocumentCreated } from 'firebase-functions/v2/firestore'

// api.ts と同じく region を asia-northeast1 に揃える
export const onUserCreate = onDocumentCreated(
  { document: 'users/{userId}', region: 'asia-northeast1' },
  async (event) => {
    const snapshot = event.data
    if (!snapshot) return
    const data = snapshot.data()
    // 新規ユーザー作成時の処理
  }
)
```

## ルール

- 新しいファイルを作ったら必ず `index.ts` から export し、`function-environments.json` に分類を書く
- `initializeApp()` は `index.ts` で1回だけ呼ぶ（各ファイルでは呼ばない）
- 共有の型は `@geckou/shared/types` からインポートする
- シングルクォートを使う
- ファイル名はケバブケース（`send-notification.ts`）
- 変数・関数はキャメルケース。定数はコンスタントケース
- 変数は `const` を使う。比較は `===` / `!==` を使う
- 略語は避ける（`req` / `res` はフレームワーク慣例のため例外）
- 配列は複数形にする（`users`, `tokens`）
- Functions 固有の環境変数は**ルートの `.env.<環境名>`** に追加する。
  `apps/functions/.env` は `yarn env:<環境名>` が毎回生成し直すので直接編集しない。
  新しいキーは `scripts/use-env.sh` の `FUNCTIONS_ENV_KEYS` と
  `apps/functions/.env.example`、ルートの `.env.example` の Functions セクションにも追記する
- **秘密（API キー・署名シークレット）は `.env` ではなく Secret Manager に置く。**
  `defineSecret('NAME')` で宣言し、`onRequest({ secrets: [NAME] })` に渡した関数だけが
  `.value()` で読める。値の登録は `firebase functions:secrets:set NAME`
  （参考実装: `apps/functions/src/lib/billing.ts`）
