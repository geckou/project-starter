---
name: new-collection
description: Firestore コレクションの追加（型定義 + API + ルール + テスト）
---

# new-collection

新しい Firestore コレクションを追加する際のチェックリスト。

## 手順

### 1. 型定義の追加

`packages/shared/src/types/index.ts` にドキュメントの型を追加する。

```typescript
export type Post = {
  id: string
  title: string
  content: string
  authorId: string
  createdAt: Date
  updatedAt: Date
}
```

- `id` フィールドは必須（ドキュメント ID）
- 日付フィールドは `Date` 型（Firestore Timestamp からの変換はクライアント側で行う）
- `packages/shared/src/index.ts` から自動エクスポートされる

### 2. Firestore セキュリティルールの追加

`firestore.rules` にコレクションのルールを追加する。
追記位置は `match /databases/{database}/documents { ... }` の内側、
デフォルト拒否の `match /{document=**}` ブロックの後。

```
match /posts/{postId} {
  // 認証済みユーザーは読み取り可能
  allow read: if request.auth != null;
  // 作成者のみ書き込み可能
  allow create: if request.auth != null
    && request.resource.data.authorId == request.auth.uid;
  allow update, delete: if request.auth != null
    && resource.data.authorId == request.auth.uid;
}
```

よくあるパターン:

- **自分のデータのみ**: `resource.data.userId == request.auth.uid`
- **認証済みなら読み取り可**: `request.auth != null`
- **誰でも読める（公開）**: `allow read: if true`
- **管理者のみ**: `request.auth.token.admin == true`

注意: 1つの Firebase プロジェクトに複数環境を相乗りさせる運用では、
環境ごとに明示的な match を追加する（`match /dev_posts/{postId}`, `match /stg_posts/{postId}`）。
ワイルドカード `/{prefix}posts` はセグメント内マッチ不可のため使えない
（`firestore.rules` 内のコメント参照）。

### 3. API エンドポイントの追加

`apps/functions/src/api.ts` に CRUD エンドポイントを追加する。

認証は `lib/auth-middleware.ts` の `requireAuth` ミドルウェアを使う（手書きのトークン検証は書かない）:

```typescript
import { getFirestore } from 'firebase-admin/firestore'

import { requireAuth, type AuthenticatedRequest } from './lib/auth-middleware'

// GET /posts - 一覧取得
app.get('/posts', requireAuth, async (req, res) => {
  const uid = (req as AuthenticatedRequest).uid

  try {
    const db = getFirestore()
    const snapshot = await db
      .collection('posts')
      .where('authorId', '==', uid)
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get()

    const posts = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
    res.json({ success: true, data: posts })
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

// POST /posts - 新規作成
app.post('/posts', requireAuth, async (req, res) => {
  const uid = (req as AuthenticatedRequest).uid

  try {
    const db = getFirestore()
    const docRef = await db.collection('posts').add({
      ...req.body,
      authorId: uid,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    res.json({ success: true, data: { id: docRef.id } })
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
})
```

### 4. 複合インデックスの追加

複合クエリ（`where` + `orderBy` の組み合わせ等）には `firestore.indexes.json` への
複合インデックス追加が必要。上記の一覧取得クエリの場合:

```json
{
  "collectionGroup": "posts",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "authorId", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
}
```

### 5. テストの追加

`apps/functions/tests/` に API エンドポイントのテストを追加する。
Firebase Admin の `getAuth()` と `getFirestore()` をモックして検証する。

### 6. 確認事項

- [ ] `packages/shared/src/types/index.ts` に型を追加した
- [ ] `firestore.rules` にルールを追加した
- [ ] `apps/functions/src/api.ts` にエンドポイントを追加した
- [ ] 複合クエリがある場合、`firestore.indexes.json` に複合インデックスを追加した
- [ ] テストを追加した
- [ ] `yarn type-check` が通る
- [ ] `yarn test` が通る
