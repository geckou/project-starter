---
name: new-page
description: Next.js App Router の新規ページを作成する
---

# new-page

Next.js App Router のページを `apps/web/src/app/` 配下に作成する。

## 手順

1. ユーザーにページのパス（例: `dashboard`, `settings/profile`）を確認する
2. 以下のファイルを作成する:
   - `page.tsx` — メインのページコンポーネント
   - `loading.tsx` — ローディング UI（Suspense 用）
   - `error.tsx` — エラーバウンダリ（"use client" 必須）
   - 必要に応じて `layout.tsx`（ユーザーに確認）
3. コンポーネントは Server Component をデフォルトとする
4. Firebase Admin を使う場合は `@/lib/firebase-admin` からインポート
5. クライアント操作が必要な場合のみ `"use client"` を付ける

## テンプレート

### page.tsx（Server Component）

```tsx
export default async function PageName() {
  return (
    <main>
      <h1>Page Title</h1>
    </main>
  )
}
```

### page.tsx（Client Component）

```tsx
'use client'

export default function PageName() {
  return (
    <main>
      <h1>Page Title</h1>
    </main>
  )
}
```

### loading.tsx

```tsx
export default function Loading() {
  return <div>Loading...</div>
}
```

### error.tsx

実際の `apps/web/src/app/error.tsx` と同じ構成にする（日本語文言 + `useEffect` でのエラーログ）:

```tsx
'use client'

import { useEffect } from 'react'

// Sentry インストール後に有効化:
// import { Sentry } from '@/lib/sentry'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
    // Sentry インストール後に有効化:
    // Sentry.captureException(error)
  }, [error])

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h2 className="text-xl font-bold">エラーが発生しました</h2>
      <p className="text-gray-500">{error.message}</p>
      <button
        onClick={() => reset()}
        className="bg-primary-600 hover:bg-primary-700 rounded px-4 py-2 text-white"
      >
        再試行
      </button>
    </main>
  )
}
```

## ルール

- シングルクォートを使う
- Tailwind CSS のクラスでスタイリングする
- セマンティックな HTML を意識する（`div` の乱用を避ける）
- `@geckou/shared` の型やユーティリティを積極的に使う
- ファイル名は Next.js の規約に従う（page.tsx, layout.tsx, loading.tsx, error.tsx, not-found.tsx）
- 変数は `const` を使う。比較は `===` / `!==` を使う
- 略語は避ける（`btn` → `button`, `msg` → `message`）
- 配列は複数形にする（`users`, `items`）
- 定数は `lib/constants/` にコンスタントケースで定義する（`MAX_RETRY_COUNT`）
