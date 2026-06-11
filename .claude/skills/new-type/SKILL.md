---
name: new-type
description: packages/shared に共有の型定義を追加する
---

# new-type

`packages/shared/src/types/` に型定義を追加する。

## 手順

1. ユーザーに型の名前と用途を確認する
2. `packages/shared/src/types/index.ts` に型を追加する
   - ファイルが大きくなったら分割する（例: `types/user.ts`, `types/chat.ts`）
   - 分割した場合は `types/index.ts` から re-export する
3. `packages/shared/src/index.ts` から既に `export * from './types'` しているので、追加の export は不要

## テンプレート

### 基本的な型

```typescript
export type EntityName = {
  id: string
  createdAt: Date
  updatedAt: Date
}
```

### Firestore ドキュメント型

```typescript
import { Timestamp } from 'firebase/firestore'

// Firestore に保存される形式
export type EntityNameDoc = {
  id: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

// アプリ内で使う形式（Date に変換済み）
export type EntityName = {
  id: string
  createdAt: Date
  updatedAt: Date
}
```

### API レスポンス型

```typescript
// 既存の ApiResponse<T> を活用する
import type { ApiResponse } from './index'

// 例: ユーザー一覧の API レスポンス
type UsersResponse = ApiResponse<User[]>
```

## ルール

- 型名はパスカルケース（例: `ChatRoom`, `UserProfile`）
- Firestore のドキュメント型を作る場合は `XxxDoc`（Firestore 形式）と `Xxx`（アプリ形式）を分ける
- `interface` ではなく `type` を使う（プロジェクトの規約）
- シングルクォートを使う
- 既存の `ApiResponse<T>` を積極的に活用する
