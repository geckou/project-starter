# Geckou Monorepo Template

合同会社Geckou の Next.js + Expo モノレポテンプレート。

## Tech Stack

- **Turborepo** (モノレポ管理)
- **Next.js 15** (Web / App Router)
- **Expo SDK 52** (iOS / Android / Expo Router)
- **TypeScript**
- **Firebase** (Auth / Firestore)
- **Tailwind CSS v4** (Web) + **NativeWind v4** (Mobile)
- **ESLint + Prettier**
- **GitHub Actions CI**

## 構成

```
├── apps/
│   ├── web/          # Next.js アプリ
│   └── mobile/       # Expo アプリ
├── packages/
│   └── shared/       # 共有コード（型定義・ユーティリティ・Firebase設定）
├── turbo.json        # Turborepo 設定
└── package.json      # ワークスペースルート
```

## Getting Started

### 1. テンプレートからリポジトリを作成

GitHub の「Use this template」ボタンから新しいリポジトリを作成。

### 2. セットアップ

```bash
npm install
cp .env.example .env.local
# .env.local に Firebase の設定値を入力
```

### 3. 開発

```bash
# 全アプリ起動
npm run dev

# Web のみ
npm run dev:web

# Mobile のみ
npm run dev:mobile
```

## Scripts

| コマンド | 説明 |
|---|---|
| `npm run dev` | 全アプリの開発サーバー起動 |
| `npm run dev:web` | Web のみ起動 |
| `npm run dev:mobile` | Mobile のみ起動 |
| `npm run build` | 全アプリのビルド |
| `npm run lint` | 全アプリの ESLint 実行 |
| `npm run format` | Prettier でフォーマット |
| `npm run type-check` | 全パッケージの型チェック |

## shared パッケージの使い方

`@geckou/shared` から共通コードをインポート：

```typescript
import { formatDate, initFirebase } from "@geckou/shared";
import type { User, ApiResponse } from "@geckou/shared";
```

新しい共有コードは `packages/shared/src/` に追加し、`index.ts` から export する。
