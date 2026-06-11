---
name: new-locale
description: i18n 翻訳キーの追加
---

# new-locale

翻訳キーを追加する。

## 手順

### 1. ja.ts と en.ts に同時追加

翻訳ファイルは `packages/shared/src/i18n/locales/` にある。
**必ず両方のファイルに同じキー構造で追加すること。**

- 日本語: `packages/shared/src/i18n/locales/ja.ts`
- 英語: `packages/shared/src/i18n/locales/en.ts`

### 2. セクションの追加ルール

既存セクション（`common`, `auth`, `navigation`）に追加する場合はそのセクション内に。
新しい機能用のセクションが必要な場合はセクションごと追加する。

```typescript
// ja.ts に追加
posts: {
  title: '投稿',
  create: '新規投稿',
  edit: '投稿を編集',
  delete: '投稿を削除',
  empty: '投稿がありません',
},
```

```typescript
// en.ts にも同じキー構造で追加
posts: {
  title: 'Posts',
  create: 'New Post',
  edit: 'Edit Post',
  delete: 'Delete Post',
  empty: 'No posts found',
},
```

### 3. 使い方

```typescript
import { getTranslation, ja } from '@geckou/shared/i18n'

const text = getTranslation(ja, 'posts.title') // → '投稿'
```

### 4. テストが通ることを確認

`packages/shared/tests/i18n.test.ts` にキー一致テストがあるので、
ja と en のキーが揃っていないとテストが落ちる。

```bash
yarn test --filter=@geckou/shared
```
