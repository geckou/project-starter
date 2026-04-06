# CLAUDE.md

このプロジェクトの Claude Code 向け設定。

## プロジェクト概要

Turborepo モノレポ。Next.js 15 (Web) + Expo 52 (Mobile) + Firebase Cloud Functions。
共有コードは `packages/shared` に集約。

## プロジェクトドキュメント（Notion）

プロダクトの「何を作るか」「どう作るか」は Notion で管理する。
実装時はまずこれらを読み、全体像を把握してから作業を始めること。

| ドキュメント | URL | 内容 |
|---|---|---|
| 企画書 | `<Notion URL>` | プロダクト概要・ターゲット・用語集・機能一覧 |
| 仕様書 | `<Notion URL>` | 画面一覧・データモデル・API・セキュリティ |
| ロードマップ | `<Notion URL>` | 機能ごとのステータス・優先度・担当 |
| Figma | `<Figma URL>` | デザインカンプ |

※ Notion MCP で直接読み取れる。URL を最新に保つこと。

## プロジェクト進行ルール

### バージョン内のフェーズ順

1つのバージョン（v1.0 等）の中で、機能を以下の順に実装する。
前のフェーズが完了してから次に進む。

```
1_基盤          認証、DB スキーマ、セキュリティルール、共有型定義
    ↓
2_バックエンド   API エンドポイント、Cloud Functions、Webhook
    ↓
3_フロントエンド  ページ、コンポーネント、フォーム、状態管理
    ↓
4_結合          画面とAPIの結合、E2Eテスト、バグ修正
```

### 機能の実装順序

同じフェーズ内では以下の順で選ぶ:

1. **前提機能が全て「完了」** のものを優先（依存が解消されているもの）
2. 優先度が **「必須」→「重要」→「任意」** の順
3. 同じ優先度なら、他の機能から依存されている数が多いものを先に

## 「次何をすればいい？」と聞かれたら

1. **ロードマップ**を確認し、現在のバージョンで「未着手」の機能を探す
2. **フェーズ順**（基盤→BE→FE→結合）で最も早いものを選ぶ
3. **前提機能**が全て「完了」であることを確認する
4. 該当機能の**仕様書**セクションを読む（画面・データモデル・API）
5. **Figma** リンクがあればデザインを確認する
6. 作業内容・影響範囲・使うスキルを提案する
7. ユーザーが承認したら実装を開始する

## 機能実装フロー

新しい機能を実装するときの手順:

```
1. ロードマップで対象機能を「実装中」に更新
2. 企画書の用語集でドメイン用語を確認（→ 変数名・コレクション名に使う）
3. 仕様書のデータモデルを確認 → /new-collection でスキーマ・型・API・テストを生成
4. 仕様書の API を確認 → /new-function でエンドポイントを生成
5. 仕様書の画面一覧 + Figma を確認 → /new-page でページを生成
6. 必要に応じて /new-component, /new-form, /new-store を使う
7. テストを実行（yarn test）
8. ロードマップを「完了」に更新
```

## テスト方針

| 対象 | テスト内容 | 必須度 |
|---|---|---|
| API エンドポイント | 正常系 + 認証エラーの最低2ケース | 必須 |
| Firestore ルール | 許可 / 拒否の各パターン | 必須 |
| 共有ユーティリティ | 入力バリエーション | 必須 |
| Zustand Store | 状態変更の基本動作 | 推奨 |
| UI コンポーネント | テスト不要（Figma + 目視確認） | - |

テストは `vitest` を使う。ファイルは `tests/` ディレクトリに `<対象>.test.ts` で作成する。

## コーディング規約

### 基本

- インデントはスペース2つ。タブは使わない
- 改行は LF
- 文字コードは UTF-8
- シングルクォートを使う（Prettier で強制）
- 末尾のセミコロンは省略する（Prettier で強制）
- `key-spacing: align: 'colon'` のスタイルに従う

### 空白行

- 複数行にわたるコードブロック（関数、条件分岐、オブジェクト等）の間は空白行を挟んで見やすくする
- 1行で完結するコード（変数宣言、import 等）は連続で書いてよい

```typescript
// Good
const name = 'hello'
const count = 10

if (count > 5) {
  doSomething()
}

const result = await fetchData()

if (result.error) {
  handleError(result.error)
}
```

### 命名規則

| 対象                         | ケース             | 例                        |
| ---------------------------- | ------------------ | ------------------------- |
| ファイル名（通常）           | ケバブケース       | `user-profile.ts`         |
| ファイル名（コンポーネント） | パスカルケース     | `UserProfile.tsx`         |
| 変数・関数                   | キャメルケース     | `userName`, `fetchData`   |
| 定数                         | コンスタントケース | `MAX_RETRY_COUNT`         |
| 型名                         | パスカルケース     | `ChatRoom`, `ApiResponse` |
| CSS クラス名                 | スネークケース     | `user_icon`               |

略語は避け、誰が見ても意味が明確な命名にする:

```
// Good
button, message, notification

// Bad
btn, msg, noti
```

### JavaScript / TypeScript

- 変数宣言は原則 `const`。やむを得ない場合のみ `let`
- 比較演算子は `===` / `!==` を使う（`==` / `!=` は使わない）
- 配列の変数名は複数形にする（`users`, `messages`）
- `type` を使う（`interface` は使わない）

### HTML / JSX

- セマンティックなマークアップを意識する（`div` の乱用を避ける）
- Tailwind CSS のクラスでスタイリングする

### React / Next.js

- Server Component をデフォルトとし、必要な場合のみ `'use client'` を付ける
- 同じ要素を繰り返し使う場合はコンポーネントに切り分ける
- アイコンは `components/icons/` にコンポーネントとして作成する
- 定数は `lib/constants/` にコンスタントケースで作成する

### ESLint

`.eslintrc.cjs` のルールに従う。

## Git ブランチ運用

### デフォルトブランチ

`production`（`main` ではない）。全てのブランチは `production` から切る。

### ブランチ命名規則

| 種類 | パターン | 例 | 切る元 | デプロイ先 |
|---|---|---|---|---|
| 機能開発 | `feat/<名前>` | `feat/user-profile` | `production` | develop |
| リリース | `release/<バージョン>` | `release/1.0.0` | `production` | staging |
| 緊急修正 | `hotfix/<バージョン>` | `hotfix/1.0.1` | `production` | staging |
| リファクタ | `refactor/<名前>` | `refactor/api-client` | `production` | develop |
| バグ修正 | `fix/<名前>` | `fix/login-error` | `production` | develop |
| ドキュメント | `docs/<名前>` | `docs/api-spec` | `production` | - |
| テスト | `test/<名前>` | `test/webhook` | `production` | develop |

### ブランチ名のルール

- **ケバブケースで書く**（`feat/user-profile`、`feat/UserProfile` は NG）
- **短く、何をするか分かる名前にする**（`feat/update` は NG）
- **チケット番号があれば先頭に付ける**（`feat/123-user-profile`）

### コミットメッセージ規約

```
<type>: <description>
```

| type | 用途 |
|---|---|
| `feat` | 新機能 |
| `fix` | バグ修正 |
| `refactor` | リファクタリング（機能変更なし） |
| `style` | コードスタイル修正（動作変更なし） |
| `docs` | ドキュメントのみ |
| `test` | テスト追加・修正 |
| `chore` | ビルド・設定変更 |

```bash
# Good
feat: ユーザープロフィール画面を追加
fix: ログイン時のリダイレクトループを修正
refactor: API クライアントの型定義を整理

# Bad
update
修正
fix bug
```

### マージルール

- `production` への直接 push は禁止（PR 必須）
- `release/*` → `production` は PR + レビュー必須
- `hotfix/*` → `production` は PR 必須（緊急時はセルフマージ可）
- `feat/*` → `release/*` へのマージは自由
- `feat/*` 同士のマージは禁止（依存関係を作らない）

### リリースフロー

```bash
# 1. 機能開発
git checkout production
git checkout -b feat/user-profile
# ... 開発・push → develop で動作確認 ...

# 2. リリース準備（出したい機能だけ選ぶ）
git checkout production
git checkout -b release/1.0.0
git merge feat/user-profile
git merge feat/posts
git push origin release/1.0.0  # → staging で QA

# 3. リリース
gh pr create --base production
# QA OK → merge → production に自動デプロイ
git tag v1.0.0

# 4. バックマージ（release の修正を取り込む）
git checkout production && git pull
# 次の feat/* は最新の production から切る

# 5. 緊急修正
git checkout -b hotfix/1.0.1 production
# ... 修正 → staging で確認 → production に merge ...
```

## アーキテクチャパターン

### API 方針

バックエンド API は **Firebase Cloud Functions**（`apps/functions/src/api.ts`）に集約する。
Next.js の API Routes（`app/api/`）は使わない。

理由: Mobile アプリからも同じ API を呼ぶため。
Next.js の API Routes は Web からしかアクセスできないが、
Cloud Functions なら Web・Mobile・外部サービス（Webhook 等）全てから共通で使える。

### Firebase の使い分け

| 場面                             | ファイル                             | SDK              | 説明                                                             |
| -------------------------------- | ------------------------------------ | ---------------- | ---------------------------------------------------------------- |
| クライアント（ログイン UI 等）   | `apps/web/src/lib/firebase.ts`       | `firebase`       | `'use client'` 必須                                              |
| サーバー（SSR / Server Actions） | `apps/web/src/lib/firebase-admin.ts` | `firebase-admin` | `server-only` で保護。クライアントから import するとビルドエラー |
| Functions                        | `apps/functions/src/`                | `firebase-admin` | `initializeApp()` は `index.ts` で1回のみ                        |

### 認証フロー

```
1. /login ページ（Client Component）で Firebase Auth のログイン
2. middleware.ts でセッション Cookie をチェックしルート保護
3. Server Component では firebase-admin でトークン検証
4. クライアントでは onAuthStateChanged で認証状態を監視
```

参考実装:

- ログインページ: `apps/web/src/app/login/page.tsx`
- ミドルウェア: `apps/web/src/middleware.ts`

### データ取得パターン

Server Component で Firestore からデータを取得する（SSR）:

```typescript
// apps/web/src/app/dashboard/page.tsx
import { adminDb } from '@/lib/firebase-admin';

export default async function DashboardPage() {
  const snapshot = await adminDb.collection('users').limit(10).get();
  const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  return <ul>{users.map(user => <li key={user.id}>{user.id}</li>)}</ul>;
}
```

クライアントでリアルタイム更新が必要な場合のみ `'use client'` + Firebase クライアント SDK を使う。

参考実装: `apps/web/src/app/dashboard/`（page + loading + error セット）

### ページの基本構成

新しいページは以下の3ファイルセットで作る:

```
app/<path>/
├── page.tsx      # メインコンテンツ（Server Component 推奨）
├── loading.tsx   # Suspense 用のローディング UI
└── error.tsx     # エラーバウンダリ（'use client' 必須）
```

### 環境変数の配置

| 種類               | ファイル               | 例                                     |
| ------------------ | ---------------------- | -------------------------------------- |
| Web クライアント用 | `.env.local`（ルート） | `NEXT_PUBLIC_FIREBASE_*`               |
| Mobile 用          | `.env.local`（ルート） | `FIREBASE_*`（app.json の extra 経由） |
| サーバー専用       | `.env.local`（ルート） | `FIREBASE_SERVICE_ACCOUNT_KEY`         |
| Functions 専用     | `apps/functions/.env`  | `REVENUECAT_WEBHOOK_SECRET`            |

`NEXT_PUBLIC_` プレフィックスはブラウザに露出する。サーバー用の値には絶対に付けない。

### マルチ環境（develop / staging / production）

Firebase プロジェクトを3つ作成し、環境ごとに使い分ける。
**環境とブランチは 1対1 ではない。**ブランチの種類に応じてデプロイ先が決まる。

#### 環境

| 環境         | Firebase プロジェクト     | 用途                   |
| ------------ | ------------------------- | ---------------------- |
| `develop`    | `your-project-develop`    | 開発中の動作確認       |
| `staging`    | `your-project-staging`    | リリース前 QA          |
| `production` | `your-project-production` | 本番                   |

#### ブランチ運用

| ブランチ      | デプロイ先   | 切る元         | 用途                     |
| ------------- | ------------ | -------------- | ------------------------ |
| `feat/*`      | develop      | `production`   | 機能開発                 |
| `release/*`   | staging      | `production`   | リリース候補の QA        |
| `hotfix/*`    | staging      | `production`   | 緊急修正                 |
| `production`  | production   | -              | 本番（デフォルトブランチ）|

**全てのブランチは `production` から切る。** `develop` / `staging` はブランチではなく環境名。

#### 開発〜リリースの流れ

```
production（常にクリーン）
 │
 ├── feat/auth ──→ push → develop に自動デプロイ → 動作確認
 ├── feat/posts ──→ push → develop に自動デプロイ → 動作確認
 │
 ├── release/1.0.0 ←── feat/auth + feat/posts を merge
 │       │
 │       └──→ push → staging に自動デプロイ → QA テスト
 │       └──→ QA OK → production に PR → merge → 本番デプロイ + tag
 │
 └── hotfix/1.0.1 ──→ staging で確認 → production に merge
```

#### 環境の切り替え（ローカル開発）

```bash
yarn env:develop      # .env.develop → .env.local にコピー + firebase use develop
yarn env:staging      # .env.staging → .env.local にコピー + firebase use staging
yarn env:production   # .env.production → .env.local にコピー + firebase use production
```

#### 手動デプロイ

```bash
yarn deploy:develop
yarn deploy:staging
yarn deploy:production
```

CI/CD: `.github/workflows/deploy.yml` でブランチ push 時に自動デプロイ。

### 状態管理（Zustand）

グローバル状態は Zustand で管理する。store は `packages/shared/src/stores/` に置き、Web・Mobile で共有する。

```typescript
// 使い方（どのクライアントコンポーネントからでも）
import { useAuthStore } from '@geckou/shared/stores'

const { user, loading } = useAuthStore()
```

| store         | ファイル                                    | 用途             |
| ------------- | ------------------------------------------- | ---------------- |
| `useAuthStore` | `packages/shared/src/stores/auth-store.ts` | 認証状態の管理   |

新しい store を追加する場合は `packages/shared/src/stores/` に作成し、`index.ts` から export する。

### Firebase Storage

ファイルアップロード・ダウンロードのヘルパーは `packages/shared/src/storage/` に集約。

```typescript
import { uploadFile, deleteFile, getFileUrl } from '@geckou/shared/storage'
```

### プッシュ通知（FCM）

| 場面       | ファイル                                       | 用途                          |
| ---------- | ---------------------------------------------- | ----------------------------- |
| Mobile受信 | `apps/mobile/src/lib/push-notifications.ts`    | 権限リクエスト・トークン取得  |
| Server送信 | `apps/functions/src/lib/push-notifications.ts` | FCM 経由で通知送信            |

### エラー監視（Sentry）

| 場所      | ファイル                             | パッケージ             |
| --------- | ------------------------------------ | ---------------------- |
| Web       | `apps/web/src/lib/sentry.ts`        | `@sentry/nextjs`       |
| Mobile    | `apps/mobile/src/lib/sentry.ts`     | `@sentry/react-native` |
| Functions | `apps/functions/src/lib/sentry.ts`  | `@sentry/node`         |

※ Sentry パッケージインストール後に各ファイルの `@ts-nocheck` を削除すること。

### i18n（多言語対応）

翻訳ファイルは `packages/shared/src/i18n/` に集約。Web・Mobile で共有する。

```typescript
import { getTranslation, ja, en } from '@geckou/shared/i18n'

getTranslation(ja, 'common.loading') // → '読み込み中...'
```

新しい翻訳キーを追加する場合は `ja.ts` と `en.ts` の両方に追加すること。

### 課金（RevenueCat）

| プラットフォーム | ファイル                                   | 用途                       |
| ---------------- | ------------------------------------------ | -------------------------- |
| Mobile           | `apps/mobile/src/lib/revenuecat.ts`        | アプリ内課金               |
| Web              | `apps/web/src/lib/revenuecat.ts`           | Web 課金（`'use client'`） |
| Functions        | `apps/functions/src/revenuecat-webhook.ts` | Webhook → Firestore 同期   |

### コンポーネントの整理方針

```
components/
├── icons/        # アイコンコンポーネント
├── ui/           # 汎用 UI（Button, Modal, Input 等）
├── auth/         # 認証関連（LoginForm, AuthGuard 等）
└── <feature>/    # 機能別（dashboard/, settings/ 等）
```

小規模なうちは `components/` 直下でよい。増えてきたら機能別に分ける。

## スキル（スラッシュコマンド）

| コマンド          | 説明                                               |
| ----------------- | -------------------------------------------------- |
| `/new-page`       | Next.js の新規ページ作成                           |
| `/new-component`  | React コンポーネント作成                           |
| `/new-function`   | Firebase Cloud Function 追加                       |
| `/new-collection` | Firestore コレクション追加（型+API+ルール+テスト） |
| `/new-form`       | バリデーション付きフォームコンポーネント作成       |
| `/new-store`      | Zustand ストア追加                                 |
| `/new-locale`     | i18n 翻訳キー追加（ja/en 同時）                    |
| `/new-type`       | shared に型定義追加                                |
| `/new-app`        | モノレポに新しいアプリ追加                         |
| `/new-skill`      | 新しいスキル（スラッシュコマンド）を作成           |
| `/migrate`        | 既存リポジトリの移植 + Notion ドキュメント自動生成 |
| `/review`         | プロジェクト構成を前提としたコードレビュー         |
| `/deploy`         | デプロイ手順ガイド                                 |
| `/troubleshoot`   | ビルドエラー・型エラーの診断と修正                 |

## よく使うコマンド

```bash
yarn setup               # 初回セットアップ
yarn dev:web             # Web 開発サーバー
yarn dev:mobile          # Mobile 開発サーバー
yarn build               # 全ビルド
yarn test                # テスト実行
yarn type-check          # 型チェック
yarn lint                # ESLint
yarn firebase:emulators  # Firebase エミュレーター

# 環境切り替え
yarn env:develop         # develop 環境に切り替え
yarn env:staging         # staging 環境に切り替え
yarn env:production      # production 環境に切り替え

# デプロイ（チェック + ビルド + デプロイ）
yarn deploy:develop      # develop にデプロイ
yarn deploy:staging      # staging にデプロイ
yarn deploy:production   # production にデプロイ
```
