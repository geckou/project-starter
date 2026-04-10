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

- インデントはスペース2つ、LF、UTF-8
- シングルクォート、セミコロン省略（Prettier で強制）
- フォーマット系ルールは Prettier に委譲（ESLint では設定しない）
- 複数行ブロック間は空白行を挟む。1行コードは連続可

### 命名規則

| 対象 | ケース | 例 |
|---|---|---|
| ファイル名（通常） | ケバブケース | `user-profile.ts` |
| ファイル名（コンポーネント） | パスカルケース | `UserProfile.tsx` |
| 変数・関数 | キャメルケース | `userName`, `fetchData` |
| 定数 | コンスタントケース | `MAX_RETRY_COUNT` |
| 型名 | パスカルケース | `ChatRoom`, `ApiResponse` |
| CSS クラス名 | スネークケース | `user_icon` |

略語は避け、意味が明確な命名にする（`button` ○ / `btn` ×）。

### JavaScript / TypeScript

- 原則 `const`。やむを得ない場合のみ `let`
- `===` / `!==` を使う
- 配列は複数形（`users`, `messages`）
- `type` を使う（`interface` は使わない）

### React / Next.js

- `export default function Name()` で統一（アロー関数は使わない）
- Server Component をデフォルト、必要時のみ `'use client'`
- アイコンは `components/icons/`、定数は `lib/constants/`
- セマンティック HTML + Tailwind CSS でスタイリング
- ESLint: `.eslintrc.cjs` のルールに従う

## Git ブランチ運用

デフォルトブランチは `production`（`main` ではない）。全てのブランチは `production` から切る。

### ブランチ命名規則

| 種類 | パターン | デプロイ先 |
|---|---|---|
| 機能開発 | `feat/<名前>` | develop |
| リリース | `release/<バージョン>` | staging |
| 緊急修正 | `hotfix/<バージョン>` | staging |
| リファクタ | `refactor/<名前>` | develop |
| バグ修正 | `fix/<名前>` | develop |
| ドキュメント | `docs/<名前>` | - |
| テスト | `test/<名前>` | develop |

ケバブケースで、短く意味が分かる名前にする。チケット番号があれば先頭に付ける。

### コミットメッセージ規約

`<type>: <description>` 形式。type: `feat`, `fix`, `refactor`, `style`, `docs`, `test`, `chore`

### マージルール

- **`production` へマージできるのは `release/*` と `hotfix/*` のみ**（それ以外のブランチからの PR・マージは禁止）
- `production` への直接 push は禁止（PR 必須）
- `release/*` → `production` は PR + レビュー必須
- `hotfix/*` → `production` は PR 必須（緊急時はセルフマージ可）
- `feat/*` → `release/*` へのマージは自由
- `feat/*` 同士のマージは禁止

詳細なリリースフロー・マルチ環境構成は `.claude/docs/git-workflow.md` を参照。

## スキル（スラッシュコマンド）

| コマンド | 説明 |
|---|---|
| `/new-page` | Next.js の新規ページ作成 |
| `/new-component` | React コンポーネント作成 |
| `/new-function` | Firebase Cloud Function 追加 |
| `/new-collection` | Firestore コレクション追加（型+API+ルール+テスト） |
| `/new-form` | バリデーション付きフォームコンポーネント作成 |
| `/new-store` | Zustand ストア追加 |
| `/new-locale` | i18n 翻訳キー追加（ja/en 同時） |
| `/new-type` | shared に型定義追加 |
| `/new-app` | モノレポに新しいアプリ追加 |
| `/new-skill` | 新しいスキル（スラッシュコマンド）を作成 |
| `/migrate` | 既存リポジトリの移植 + Notion ドキュメント自動生成 |
| `/review` | プロジェクト構成を前提としたコードレビュー |
| `/deploy` | デプロイ手順ガイド |
| `/troubleshoot` | ビルドエラー・型エラーの診断と修正 |

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
yarn env:<環境名>        # 環境切り替え（develop / staging / production）
yarn deploy:<環境名>     # デプロイ（develop / staging / production）
```

## 進化的メモリシステム

フィードバックの記録・昇格は `memory/evolution.md` のプロトコルに従うこと。

### 必須ルール

- フィードバックを記録する前に、必ず `memory/short-term/` と `memory/long-term/` の既存ファイルを確認する
- 同じ趣旨のフィードバックが既にあれば、新規ファイルを作成せず `pain_count` を +1 する
- `pain_count >= 3` に達したフィードバックは、エッセンスを 1-2 行に蒸留して CLAUDE.md のルールに昇格させる
- 昇格時はユーザーに通知する

### メモリ階層

| 階層 | 場所 | 昇格条件 |
|---|---|---|
| daily | `memory/daily/` | - |
| short-term | `memory/short-term/` | pain_count >= 2 → long-term |
| long-term | `memory/long-term/` | pain_count >= 3 → CLAUDE.md |

詳細は `memory/evolution.md` を参照。

## 詳細リファレンス

必要に応じて以下を参照:

- `.claude/docs/architecture.md` — API方針、Firebase使い分け、認証、データ取得、環境変数、Zustand、Storage、FCM、Sentry、i18n、RevenueCat、Tailwind、コンポーネント整理
- `.claude/docs/nuxt-nextjs.md` — Nuxt.js → Next.js の対応表（Server Component、ルーティング等）
- `.claude/docs/git-workflow.md` — リリースフロー詳細、マルチ環境構成、GCP API 有効化
