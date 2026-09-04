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
3. `index.ts` からエクスポートする

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
  } catch (error) {
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

- 新しいファイルを作ったら必ず `index.ts` から export する
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
