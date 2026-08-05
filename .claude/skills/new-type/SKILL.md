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

`packages/shared/src/index.ts` のルートバレルは環境非依存（型・純ユーティリティ・定数）のみを
export する方針のため、`firebase/firestore` の `Timestamp` は import せず、
互換の構造型で表現する。

```typescript
// Firestore Timestamp と構造互換の型（firebase への依存を持たない）
export type TimestampLike = {
  seconds: number
  nanoseconds: number
}

// Firestore に保存される形式
export type EntityNameDoc = {
  id: string
  createdAt: TimestampLike
  updatedAt: TimestampLike
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

- `types/` には環境依存パッケージ（`firebase`, `zustand` 等）を import しない
  （ルートバレル `packages/shared/src/index.ts` は環境非依存のみを export する方針。
  functions が `@geckou/shared` を import しても firebase client SDK の型解決が不要になる）
- 型名はパスカルケース（例: `ChatRoom`, `UserProfile`）
- Firestore のドキュメント型を作る場合は `XxxDoc`（Firestore 形式）と `Xxx`（アプリ形式）を分ける
- `interface` ではなく `type` を使う（プロジェクトの規約）
- シングルクォートを使う
- 既存の `ApiResponse<T>` を積極的に活用する
