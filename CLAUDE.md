# CLAUDE.md

このプロジェクトの Claude Code 向け設定。

## プロジェクト概要

Turborepo モノレポ。Next.js 15 (Web) + Expo 52 (Mobile) + Firebase Cloud Functions。
共有コードは `packages/shared` に集約。

## プロダクトの目的（北極星）

> ⚠️ scaffold 後、`planning.md` の「一言で言うと」「目的・ゴール」から転記する。企画書側を更新したら必ずここも更新する。

**<XXX に困っている YYY が、ZZZ するための、Web/Mobile アプリ>**

北極星指標（KPI）: <1行で記入>

実装の判断に迷ったら「この作業は上記の目的に資するか」に立ち返る。

## プロジェクトドキュメント

プロダクトの「何を作るか」「どう作るか」はローカルの `.claude/docs/` で管理する。
実装時はまずこれらを読み、全体像を把握してから作業を始めること。

| ドキュメント | パス | 内容 |
|---|---|---|
| 企画書 | `.claude/docs/planning.md` | プロダクト背景・ターゲット・ペルソナ・用語集・機能一覧 |
| 仕様書 | `.claude/docs/spec.md` | 画面一覧・データモデル・API・セキュリティ（**最新・正**） |
| ロードマップ | `.claude/docs/roadmap.md` | 機能ステータス表（**進捗の正**）・残タスク・セッション引き継ぎ |
| Figma | `<Figma URL>`（⚠️ scaffold 後に実際の URL へ置換。未使用なら行ごと削除） | デザインカンプ |

技術仕様は仕様書を、進捗・タスク状態はロードマップの機能ステータス表を正とする。
企画書はプロダクト背景・ターゲット・優先度の参考として使う。

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

1. **ロードマップの機能ステータス表**で、現在のバージョンの「未着手」の機能を探す
2. **フェーズ順**（基盤→BE→FE→結合）で最も早いものを選ぶ
3. **前提機能**が全て「完了」であることを確認する
4. 機能ステータス表の「関連仕様」に列挙された**仕様書**セクションを読む（画面・データモデル・API）
5. **Figma** リンクがあればデザインを確認する
6. 作業内容・影響範囲・使うスキルを提案する
7. ユーザーが承認したら実装を開始する

この手順は `/next` で実行できる。

## 機能実装フロー

```
1. ロードマップ（.claude/docs/roadmap.md）の機能ステータス表で対象機能を「実装中」に更新
2. 企画書（.claude/docs/planning.md）の用語集でドメイン用語を確認（→ 変数名・コレクション名に使う）
3. 仕様書（.claude/docs/spec.md）のデータモデルを確認 → /new-collection でスキーマ・型・API・テストを生成
4. 仕様書の API を確認 → /new-function でエンドポイントを生成
5. 仕様書の画面一覧 + Figma を確認 → /new-page でページを生成
6. 必要に応じて /new-component, /new-form, /new-store を使う
7. テストを実行（yarn test）
8. 完了条件（Definition of Done）を確認し、機能ステータス表を「完了」に更新
```

### 仕様書ファースト（仕様にない実装依頼を受けたら）

1. 実装する**前に** spec.md（必要なら planning.md のコア機能一覧・roadmap.md の機能ステータス表）に追記し、ユーザーの承認を得る
2. 承認後に実装を開始する
3. 「仕様書に書く → 実装する」の順を崩さない。緊急対応で実装が先行した場合も、同じ作業内で必ず仕様書に反映する

### 機能の完了条件（Definition of Done）

- [ ] `yarn type-check` / `yarn lint` / `yarn test` が通る
- [ ] テスト方針の必須ケース（API 正常系 + 認証エラー、ルール許可 / 拒否）がある
- [ ] spec.md が実装と一致している（実装中の仕様変更を反映済み）
- [ ] 実装中に導入した新しいドメイン用語を planning.md の用語集に追記した
- [ ] roadmap.md の機能ステータス表を「完了」に更新した

### 自律性の境界

**確認なしで進めてよい**

- 仕様書に定義済みの機能の実装・テスト・リファクタ
- バグ修正（挙動を仕様書に合わせる方向）
- ドキュメントの整合更新

**ユーザー確認が必須**

- 依存パッケージの追加・メジャーアップデート
- データモデル（スキーマ・コレクション構造）の変更
- セキュリティルール・認証まわりの方針変更
- 課金・外部サービス連携に関わる変更
- 仕様書にない機能の追加（→ 仕様書ファースト）
- デプロイ・本番環境への操作

境界は派生プロジェクトの方針に合わせて調整してよい。

## テスト方針

| 対象 | テスト内容 | 必須度 |
|---|---|---|
| API エンドポイント | 正常系 + 認証エラーの最低2ケース | 必須 |
| Firestore ルール | 許可 / 拒否の各パターン（`yarn test:rules` で実行） | 必須 |
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

- 関数宣言（`function Name()`）で統一（アロー関数のコンポーネントは使わない）
- default export は Next.js の規約ファイル（`page.tsx`, `layout.tsx` 等）のみ。コンポーネントは named export
- Server Component をデフォルト、必要時のみ `'use client'`
- アイコンは `components/icons/`、定数は `lib/constants/`
- セマンティック HTML + Tailwind CSS でスタイリング
- ESLint: 各ワークスペースの `eslint.config.mjs`（flat config）のルールに従う

## Git ブランチ運用

デフォルトブランチは `production`（`main` ではない）。全てのブランチは `production` から切る。

作業開始時は必ず次の順で行う。

```bash
git fetch origin --prune                  # 進行中の release/* を見落とさないため
git branch -r --list 'origin/release/*'   # 進行中のリリースを確認
git checkout production && git pull
git checkout -b feat/<名前>
git merge origin/release/<バージョン>     # そのリリースに載せる場合のみ
```

**分岐元を `production` に保つ理由**: 作業内容を必ずしも進行中のリリースに混ぜるとは
限らないため。`release/*` から切ると、そのリリース行きに固定される。

**それでも release をマージする理由**: `production` は前回リリース時点で止まっており、
進行中の `release/*` より遅れているのが普通のため。マージせずに作業すると、
リリースへ PR を出す段階で大量のコンフリクトになる。

⚠️ `git branch -a` はローカルの参照しか出さない。**fetch せずに「production しか無い」と
判断しないこと。** 詳細は `.claude/docs/git-workflow.md` の「作業ブランチの切り方」。

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

> **このリポジトリ（`geckou/project-starter` 本体）は以下のマージルールに従わない。**
> 本リポジトリはテンプレートそのものであり、リリースフローを持たない。テンプレート自身の修正は `fix/*` 等から直接 `production` へ PR・マージしてよい。
> 以下のルールは、このテンプレートから scaffold した**派生プロジェクト**に適用する。

- **`production` へマージできるのは `release/*` と `hotfix/*` のみ**（それ以外のブランチからの PR・マージは禁止）
- `production` への直接 push は禁止（PR 必須）
- **`release/*` への直接コミット・push は禁止**（`release/*` への push は staging への自動デプロイを発火するため）。QA で見つかった修正も `fix/*` を切って `release/*` へ PR でマージする。例外は、ブランチ作成時（`production` から切って `feat/*` をマージした結果）の push と、PR マージによる更新のみ
- `release/*` → `production` は PR + レビュー必須
- `hotfix/*` → `production` は PR 必須（緊急時はセルフマージ可）
- `feat/*` → `release/*` へのマージは自由
- `feat/*` 同士のマージは禁止

詳細なリリースフロー・マルチ環境構成は `.claude/docs/git-workflow.md` を参照。

## スキル（スラッシュコマンド）

| コマンド | 説明 |
|---|---|
| `/kickoff` | 新規プロジェクトのヒアリング → 企画書・仕様書・ロードマップ作成 |
| `/next` | ロードマップから次のタスクを選定して提案 |
| `/wrap-up` | セッション終了処理（引き継ぎ・メモリ記録・コミット） |
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
| `/init-project` | テンプレートから派生プロジェクトを初期化 |
| `/migrate` | 既存リポジトリの移植 + ドキュメント自動生成 |
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

## テンプレート起因の問題を親リポジトリに報告

このテンプレート（[`geckou/project-starter`](https://github.com/geckou/project-starter)）から作成した派生プロジェクトでは、作業中につまづいた問題が **派生プロジェクト固有のコードではなくテンプレート側に原因がある** と判断した場合、親リポジトリに Issue を立てて還元する。
派生プロジェクト固有の不具合はそれぞれのプロジェクト内で扱えばよく、別途 Issue 化する必要はない。

### 対象になる問題（例）

- スキャフォールド（`.claude/skills/` のスラッシュコマンド）の生成結果がそのままでは動かない
- ルートの設定ファイル（`turbo.json`, `firebase.json`, `firestore.rules`, `.husky/`, ESLint/Prettier 設定等）に不備がある
- CI ワークフロー（`.github/workflows/`）が壊れている / 不足している
- `README.md` / `CLAUDE.md` / `.claude/docs/` の記述が誤っている・古い
- `packages/shared` の共通ユーティリティ・型定義の問題

### 対象外

- 派生プロジェクトのドメインロジック・画面・API の不具合
- 派生プロジェクトで追加した依存・設定変更による問題

### 書いてよいこと・いけないこと

> ⚠️ **親リポジトリは公開を前提とする。** Issue・PR・コミットメッセージは誰でも読める。

**書かない**

- 派生プロジェクト名・リポジトリ名・クライアント名・サービス名
- 派生プロジェクトの URL（GitHub / デプロイ先 / 管理画面）
- 事業上の情報（売上、契約、リリース時期、社内の判断経緯）
- 実在の値を含む設定（プロジェクト ID、ドメイン、API キー、メールアドレス）
- 派生プロジェクト固有のドメインロジックそのもの

**書く**

- テンプレートのどのファイル・どの仕組みに問題があるか
- 再現手順（**テンプレートの初期状態から再現する形**に書き直す）
- 期待する挙動と実際の挙動
- 派生側の事情を伝える必要があるときは匿名化する
  （「ある派生プロジェクトでは 1 つの Firebase プロジェクトに 3 環境を相乗りさせており…」）

**判断基準**: その Issue を第三者が読んだとき、**どの案件の話か特定できないこと**。
特定できてしまうなら、テンプレート側の問題として抽象化し直す。

抽象化すると問題が伝わらない場合は、その情報が本当に必要か疑う。
たいていはテンプレートの構造の問題として言い換えられる。

### 立て方

判断したらユーザーに「親リポジトリに Issue を立てますか？」と確認してから、以下のように `gh` で作成する:

```bash
gh issue create \
  -R geckou/project-starter \
  --template bug_report.yml          # 改善提案なら improvement.yml
```

`bug_report.yml` には「テンプレートのバージョン / コミット」欄があるので、`git log` で派生元のコミットを把握して記入する。
重複を避けるため、作成前に必ず `gh issue list -R geckou/project-starter --search "<キーワード>"` で既存 Issue を確認する。

`gh` CLI が使えない環境（Claude Code の Web / リモートセッション等）では、GitHub MCP ツール（Issue の検索・作成）で代替する。それも使えない場合は、Issue 本文の下書きを作成してユーザーに起票を依頼する。

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
| Lv.3 | `CLAUDE.md` | reinforce_count >= 3 → スキル / Hook |
| Lv.4 | スキル / Hook | -（手順型は /new-skill でスキル化、条件型は Hook 化） |

詳細は `memory/evolution.md` を参照。

## 詳細リファレンス

必要に応じて以下を参照:

- `.claude/docs/planning.md` — 企画書（プロダクト背景・ターゲット・ペルソナ・用語集・機能一覧）
- `.claude/docs/spec.md` — 仕様書（画面一覧・データモデル・API・セキュリティ）
- `.claude/docs/roadmap.md` — ロードマップ（機能ステータス表・残タスク・セッション引き継ぎ）
- `.claude/docs/architecture.md` — API方針、Firebase使い分け、認証、データ取得、環境変数、Zustand、Storage、FCM、Sentry、i18n、課金（Stripe / IAP）、Tailwind、コンポーネント整理
- `.claude/docs/billing.md` — 決済の実装手順（Stripe / IAP のセットアップ、権利判定、チェックリスト、よくある失敗）
- `.claude/docs/nuxt-nextjs.md` — Nuxt.js → Next.js の対応表（Server Component、ルーティング等）
- `.claude/docs/git-workflow.md` — リリースフロー詳細、マルチ環境構成、GCP API 有効化
