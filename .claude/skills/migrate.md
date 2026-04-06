---
name: migrate
description: 既存リポジトリをこのテンプレートに移植し、Notion にドキュメントを自動生成する
---

# migrate

既存プロジェクトのコードを読み取り、このテンプレートの構成に移植する。
企画書・仕様書がない場合は、コードから逆生成して Notion に作成する。

## 前提

- 移植元のリポジトリがローカルにクローン済みであること
- Notion MCP が接続されていること（ドキュメント自動生成に必要）
- CLAUDE.md の「プロジェクトドキュメント（Notion）」に Notion URL が設定済み、
  または新しいプロジェクトページの作成先が指定されていること

## 入力

ユーザーに以下を確認する:

1. **移植元リポジトリのパス**（例: `~/projects/old-app`）
2. **プロジェクト名**（例: `my-app`）
3. **Notion の作成先**（既存の企画書・仕様書があればその URL、なければ新規作成）
4. **移植対象**（Web のみ / Mobile のみ / 両方 / Functions のみ）

## 手順

### Phase 1: 既存コードの解析

移植元リポジトリを読み取り、以下を特定する:

```
1. 技術スタック（フレームワーク、ライブラリ、言語）
2. ディレクトリ構成
3. データモデル（DB スキーマ、型定義）
4. API エンドポイント（ルーティング定義）
5. 画面一覧（ページ / ルート定義）
6. 認証方式
7. 環境変数
8. 外部サービス連携
```

特に以下のファイルを重点的に読む:

| 情報 | 読むファイル |
|---|---|
| 技術スタック | `package.json`, `tsconfig.json` |
| 型定義 | `types/`, `models/`, `interfaces/` |
| API | `api/`, `routes/`, `controllers/`, `functions/` |
| 画面 | `pages/`, `app/`, `views/`, `screens/` |
| DB スキーマ | `schema/`, `migrations/`, `firestore.rules`, Prisma スキーマ等 |
| 認証 | `auth/`, `middleware/`, `lib/firebase*.ts` |
| 環境変数 | `.env.example`, `.env.local`, `.env` |
| 状態管理 | `store/`, `stores/`, `state/` |

### Phase 2: Notion ドキュメントの自動生成

解析結果をもとに、Notion にドキュメントを生成する。

#### 企画書（コードから推測できる範囲で埋める）

| セクション | 生成方法 |
|---|---|
| プロダクト概要 | README、package.json の description から |
| ユーザー種別・権限 | 認証ロジック、ルール定義から |
| コア機能一覧 | ページ一覧 + API エンドポイントから |
| 用語集 | コレクション名、型名、変数名から |

**注意**: 以下は人間が埋める必要がある（コードからは推測できない）:
- ターゲットユーザー / ペルソナ
- 背景・課題
- 収益モデル
- 競合分析
- スケジュール

→ 該当セクションには `⚠️ 要記入: コードからは判断できません` と注記を入れる。

#### 仕様書（コードからほぼ完全に生成可能）

| セクション | 生成方法 |
|---|---|
| 画面一覧（Web） | App Router / Pages Router のファイル構成から URL パスを列挙 |
| 画面一覧（Mobile） | Expo Router のファイル構成からパスを列挙 |
| データモデル | 型定義 + Firestore ルール + 実際の DB 操作コードから |
| API エンドポイント一覧 | ルーティング定義 + ハンドラからリクエスト / レスポンスを推測 |
| セキュリティルール | `firestore.rules` からそのまま方針を抽出 |
| 外部サービス連携 | 環境変数 + import 文から |

#### ロードマップ

既存の機能は全て「完了」ステータスでロードマップ DB に登録する。
フェーズは実装内容から自動判定する。

### Phase 3: コードの移植

既存のコードをこのテンプレートの構成に配置する。

```
移植元                          → 移植先
─────────────────────────────────────────────────────
型定義                          → packages/shared/src/types/
ユーティリティ                  → packages/shared/src/utils/
状態管理（Store）               → packages/shared/src/stores/
翻訳ファイル                    → packages/shared/src/i18n/
ページ（Web）                   → apps/web/src/app/
コンポーネント（Web）           → apps/web/src/components/
Firebase クライアント           → apps/web/src/lib/firebase.ts
Firebase Admin                  → apps/web/src/lib/firebase-admin.ts
ページ（Mobile）                → apps/mobile/src/app/
Cloud Functions                 → apps/functions/src/
Firestore ルール                → firestore.rules
環境変数                        → .env.example + .env.local
```

移植時の変換ルール:

- **import パスの書き換え**: 共有コードは `@geckou/shared` からインポートするように変更
- **命名規則の統一**: CLAUDE.md の命名規則に合わせる（ケバブケース、パスカルケース等）
- **コーディング規約の適用**: シングルクォート、セミコロンなし、`const` 優先、`type` 使用
- **ページ構成の統一**: `page.tsx` + `loading.tsx` + `error.tsx` の3ファイルセット
- **`interface` → `type`**: 既存コードの `interface` 宣言を `type` に変換

### Phase 4: 動作確認

```bash
# 1. 依存関係のインストール
yarn install

# 2. 型チェック
yarn type-check

# 3. リント
yarn lint

# 4. ビルド
yarn build

# 5. テスト（既存テストがあれば）
yarn test
```

エラーがあれば修正し、全てパスするまで繰り返す。

### Phase 5: 差分レポート

移植完了後、以下のレポートを出力する:

```markdown
## 移植レポート

### 解析結果
- 技術スタック: Next.js 14 → Next.js 15 にアップグレード
- ページ数: 12 画面
- API エンドポイント数: 8 個
- Firestore コレクション: 5 個

### Notion に生成したドキュメント
- 企画書: <URL>
- 仕様書: <URL>
- ロードマップ: <URL>

### 移植したファイル
- 型定義: 5 ファイル → packages/shared/src/types/
- コンポーネント: 15 ファイル → apps/web/src/components/
- ...

### 人間が確認・記入すべき項目
- [ ] 企画書のターゲットユーザー / ペルソナ
- [ ] 企画書の収益モデル
- [ ] 仕様書の Figma リンク（各画面）
- [ ] 環境変数の値（.env.local）
- [ ] CLAUDE.md のプロジェクトドキュメント URL

### 注意点・手動対応が必要な箇所
- XXX のライブラリは互換性の問題で移植できず、代替案を使用
- ...
```

## 確認事項

- [ ] Phase 1: 既存コードの解析が完了した
- [ ] Phase 2: Notion にドキュメントが生成された
- [ ] Phase 3: コードがテンプレートの構成に配置された
- [ ] Phase 4: `yarn type-check && yarn lint && yarn build` が通る
- [ ] Phase 5: 差分レポートを出力した
- [ ] CLAUDE.md の Notion URL を更新した
