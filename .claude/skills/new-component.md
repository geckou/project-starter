---
name: new-component
description: React コンポーネントを作成する
---

# new-component

`apps/web/src/components/` 配下に React コンポーネントを作成する。

## 手順

1. ユーザーにコンポーネント名と用途を確認する
2. `apps/web/src/components/` にファイルを作成する
   - ネストが必要な場合はディレクトリを作る（例: `components/ui/Button.tsx`）
3. Server Component か Client Component かをユーザーに確認する
   - イベントハンドラ・useState・useEffect がある → Client Component
   - データ取得のみ → Server Component

## テンプレート

### Server Component

```tsx
type Props = {
  // props
}

export function ComponentName({}: Props) {
  return <div></div>
}
```

### Client Component

```tsx
'use client'

type Props = {
  // props
}

export function ComponentName({}: Props) {
  return <div></div>
}
```

## ルール

- named export を使う（default export は page.tsx のみ）
- シングルクォートを使う
- Tailwind CSS のクラスでスタイリングする
- セマンティックな HTML を意識する（`div` の乱用を避ける）
- Props の型は同ファイル内に `type` で定義する（`interface` は使わない）
- 大きくなったら `@geckou/shared/types` に型を移動する
- ファイル名・コンポーネント名はパスカルケース（例: `UserProfile.tsx`）
- アイコンコンポーネントは `components/icons/` に配置する
- 同じ要素を繰り返し使う場合は積極的にコンポーネント化する
- 略語は避ける（`btn` → `button`, `msg` → `message`）
- 変数は `const` を使う。配列は複数形にする（`users`, `items`）
