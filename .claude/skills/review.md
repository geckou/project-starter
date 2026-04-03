---
name: review
description: このプロジェクト構成を前提としたコードレビュー
---

# review

指定されたファイルやブランチのコードをレビューする。

## レビュー観点

### 1. プロジェクト構成の整合性

- `"use client"` の適切な使用（Firebase クライアント SDK はクライアントのみ）
- `firebase-admin` がクライアントコンポーネントに漏れていないか
- `@geckou/shared` の型・ユーティリティが活用されているか
- 共通化できるコードが `packages/shared` に入っているか

### 2. Firebase

- Firestore のセキュリティルール（`firestore.rules`）が更新されているか
- 環境変数が `.env.example` に記載されているか
- `NEXT_PUBLIC_` プレフィックスの適切な使用（サーバー用の値に付けていないか）
- `firebase-admin` は `server-only` で保護されているか

### 3. Next.js (SSR)

- Server Component と Client Component の使い分け
- データ取得は Server Component で行っているか
- 不要な `"use client"` がないか
- `loading.tsx` / `error.tsx` が用意されているか

### 4. コード品質

- シングルクォートが使われているか
- Tailwind CSS のクラスでスタイリングされているか
- セマンティックな HTML が使われているか
- 型が適切に定義されているか（`any` を避ける、`type` を使い `interface` は使わない）
- 変数宣言が `const` になっているか（不必要な `let` がないか）
- 比較に `===` / `!==` が使われているか
- 命名規則が守られているか（略語の使用、ケース規則）
- 配列が複数形になっているか
- エラーハンドリングが適切か

### 5. セキュリティ

- API キーやシークレットがハードコードされていないか
- ユーザー入力のバリデーション
- Firebase Security Rules が適切か
- CORS の設定が適切か

## 出力フォーマット

レビュー結果は以下の形式で報告する:

- 重要度（高 / 中 / 低）とファイルパスを明記
- 問題の内容と修正案を具体的に示す
- 良い点も挙げる
