---
name: troubleshoot
description: ビルドエラー・型エラーの診断と修正
---

# troubleshoot

エラーの診断と修正を行う。

## 診断手順

### 1. エラーの種類を特定

以下のコマンドを順番に実行し、どこでエラーが出ているか確認:

```bash
yarn type-check    # 型エラー
yarn lint          # ESLint エラー
yarn test          # テスト失敗
yarn build         # ビルドエラー
```

### 2. よくあるエラーと対処法

#### 型エラー

| エラー                                | 原因                              | 対処                                                       |
| ------------------------------------- | --------------------------------- | ---------------------------------------------------------- |
| `Cannot find module '@geckou/shared'` | shared のパスエイリアス           | tsconfig.json の paths を確認                              |
| `Type 'X' is not assignable to 'Y'`  | 型の不一致                        | 型定義を確認。`as const` の有無を確認                      |
| `Cannot find module '@sentry/*'`      | パッケージ未インストール          | `@ts-nocheck` が付いているか確認。インストール後に削除     |
| vite Plugin 型の不一致               | node_modules の二重インストール   | `vitest.config.ts` を tsconfig の exclude に追加           |

#### ビルドエラー

| エラー                  | 原因                         | 対処                                                                    |
| ----------------------- | ---------------------------- | ----------------------------------------------------------------------- |
| `'use client'` 関連     | Server/Client の境界違反     | クライアント専用 API を Server Component で使っていないか確認           |
| `server-only` エラー    | サーバー専用モジュール違反   | import パスを確認。`firebase-admin` はサーバー専用                      |
| `Module not found`      | パッケージ未インストール     | `yarn install` を実行。import パスを確認                                |

#### テスト失敗

| エラー                         | 原因                      | 対処                                                        |
| ------------------------------ | ------------------------- | ----------------------------------------------------------- |
| `Cannot find module` in test   | テストのモック不足        | `vi.mock()` で外部モジュールをモック                        |
| `i18n キー不一致`              | ja と en のキーがずれている | 両方のファイルに同じキーを追加                              |
| `Firebase App not initialized` | テストで初期化なし        | `vi.mock('firebase-admin/firestore')` 等でモック            |

### 3. 環境の問題

```bash
# Node.js バージョン確認
node -v  # 20.x が期待値

# 依存関係の再インストール
rm -rf node_modules apps/*/node_modules packages/*/node_modules
yarn install

# turbo キャッシュのクリア
npx turbo clean
```

### 4. CI 固有の問題

- `engines` フィールドによるバージョンエラー → `yarn install --ignore-engines`
- GitHub Actions の Node.js 20 deprecation → `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true`
- `yarn.lock` の不整合 → ローカルで `yarn install` して lock ファイルをコミット
