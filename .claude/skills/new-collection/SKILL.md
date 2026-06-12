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

### 3. API エンドポイントの追加

`apps/functions/src/api.ts` に CRUD エンドポイントを追加する。

認証が必要なエンドポイントの基本パターン:

```typescript
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

// GET /posts - 一覧取得
app.get('/posts', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  try {
    const decoded = await getAuth().verifyIdToken(token)
    const db = getFirestore()
    const snapshot = await db
      .collection('posts')
      .where('authorId', '==', decoded.uid)
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
app.post('/posts', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  try {
    const decoded = await getAuth().verifyIdToken(token)
    const db = getFirestore()
    const docRef = await db.collection('posts').add({
      ...req.body,
      authorId: decoded.uid,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    res.json({ success: true, data: { id: docRef.id } })
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
})
```

### 4. テストの追加

`apps/functions/tests/` に API エンドポイントのテストを追加する。
Firebase Admin の `getAuth()` と `getFirestore()` をモックして検証する。

### 5. 確認事項

- [ ] `packages/shared/src/types/index.ts` に型を追加した
- [ ] `firestore.rules` にルールを追加した
- [ ] `apps/functions/src/api.ts` にエンドポイントを追加した
- [ ] テストを追加した
- [ ] `yarn type-check` が通る
- [ ] `yarn test` が通る
