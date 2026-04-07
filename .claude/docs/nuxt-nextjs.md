# Nuxt.js → Next.js 対応表

このプロジェクトは Next.js（App Router）を使っている。Nuxt.js に慣れている開発者向けに対応関係をまとめる。

## 基本概念の対応

| 概念 | Nuxt.js | Next.js (App Router) | 備考 |
|---|---|---|---|
| ページ | `pages/index.vue` | `app/page.tsx` | Next はディレクトリ = URL、`page.tsx` が必須 |
| レイアウト | `layouts/default.vue` | `app/layout.tsx` | Next はネスト可能（各ディレクトリに置ける） |
| ミドルウェア | `middleware/auth.ts` | `middleware.ts`（ルート直下1ファイル） | Next は Edge Runtime で動作 |
| サーバーAPI | `server/api/` | 使わない | このプロジェクトでは Cloud Functions に集約 |
| データ取得 | `useFetch` / `useAsyncData` | Server Component で直接 `await` | Next はコンポーネント自体が async 関数になれる |
| クライアント限定 | `<ClientOnly>` / `.client.vue` | `'use client'` ディレクティブ | ファイル先頭に `'use client'` を書く |
| ローディング | `<NuxtLoadingIndicator>` | `loading.tsx`（ファイル規約） | 同階層に置くだけで Suspense が効く |
| エラーハンドリング | `error.vue` | `error.tsx`（ファイル規約） | `'use client'` 必須 |
| 自動 import | デフォルト ON | なし | Next は全て明示的に import する |
| 状態管理 | Pinia | Zustand | このプロジェクトでは `packages/shared/src/stores/` |
| メタデータ | `useHead()` / `useSeoMeta()` | `export const metadata` / `generateMetadata()` | Server Component で静的に export する |
| 動的ルート | `pages/users/[id].vue` | `app/users/[id]/page.tsx` | ディレクトリ名に `[param]` を使う |
| catch-all ルート | `pages/[...slug].vue` | `app/[...slug]/page.tsx` | 同じ記法 |
| 環境変数（公開） | `NUXT_PUBLIC_*` | `NEXT_PUBLIC_*` | ブラウザに露出する変数のプレフィックス |

## 特に注意が必要な違い

**Server Component（Nuxt にない概念）**

Next.js の App Router では、コンポーネントはデフォルトで Server Component（サーバーでのみ実行）。
Nuxt の `<script setup>` のように `onMounted` やブラウザ API を使うには `'use client'` が必要。

```typescript
// Server Component（デフォルト）— Nuxt の useFetch に相当
// DB に直接アクセスできる。useState / useEffect は使えない
export default async function Page() {
  const data = await adminDb.collection('users').get()
  return <div>{data.docs.length} users</div>
}
```

```typescript
// Client Component — Nuxt の通常の <script setup> に近い
'use client'
import { useState, useEffect } from 'react'

export default function Counter() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(count + 1)}>{count}</button>
}
```

**ファイルベースのルーティング構造**

Nuxt は `pages/` 直下にファイルを置くが、Next.js はディレクトリ構造がそのまま URL になる:

```
# Nuxt
pages/
├── index.vue           → /
├── about.vue           → /about
└── users/
    └── [id].vue        → /users/:id

# Next.js（App Router）
app/
├── page.tsx            → /
├── layout.tsx          → 全ページ共通レイアウト
├── about/
│   └── page.tsx        → /about
└── users/
    └── [id]/
        ├── page.tsx    → /users/:id
        ├── loading.tsx → ローディング UI
        └── error.tsx   → エラー UI
```
