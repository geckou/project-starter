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

```typescript
// apps/functions/src/api.ts に追加
app.post('/endpoint-name', async (req, res) => {
  // 認証チェック
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  const decoded = await getAuth().verifyIdToken(token)

  // ロジック
  res.json({ success: true })
})
```

### スケジュール関数（新規ファイル）

```typescript
// apps/functions/src/scheduled.ts
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { getFirestore } from 'firebase-admin/firestore'

export const dailyCleanup = onSchedule('every day 03:00', async () => {
  const db = getFirestore()
  // クリーンアップ処理
})
```

### Firestore トリガー（新規ファイル）

```typescript
// apps/functions/src/triggers.ts
import { onDocumentCreated } from 'firebase-functions/v2/firestore'

export const onUserCreate = onDocumentCreated(
  'users/{userId}',
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
- Functions 固有の環境変数は `apps/functions/.env` に追加し、`.env.example` も更新する
