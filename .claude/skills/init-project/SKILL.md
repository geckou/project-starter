---
name: init-project
description: テンプレートから派生プロジェクトを初期化する（Firebase 設定・スコープリネーム・アプリ識別子・ドキュメント）
---

# init-project

このテンプレート（`geckou/project-starter`）から scaffold した派生プロジェクトの初期化を行う。
ユーザーに新しいプロジェクト名（例: `myapp`）を確認してから開始する。

## 手順

### 1. scripts/setup.sh の実行

```bash
yarn setup
```

- `.firebaserc` のプレースホルダ（`your-project-develop` 等）を実際の Firebase プロジェクト ID に置換
- `.env.develop` / `.env.staging` / `.env.production` / `.env.local` を `.env.example` から作成
- Node.js / yarn / Firebase CLI のチェック、production ブランチ保護の設定、依存インストール

### 2. ルート package.json の name 変更

`package.json` の `"name": "geckou-monorepo"` を `"<project-name>-monorepo"` 等に変更する。

### 3. `@geckou/*` スコープの一括リネーム

`@geckou/*` を `@<project-name>/*` に一括置換する。対象は package.json の name / 依存だけでなく、
以下すべてに及ぶ:

- 全ワークスペースの `package.json`（`name`, `dependencies` の `@geckou/shared` 等）
- ルート `package.json` の `workspaces.nohoist`（`@geckou/mobile/**`, `@geckou/mobile-*/**`）と
  scripts の `turbo dev --filter=@geckou/web...` 等
- 全ソースコードの import 文（`@geckou/shared`, `@geckou/shared/stores` 等）
- `apps/*/tailwind.config.{ts,js}` の `@geckou/shared/theme` 参照
- `scripts/deploy.sh` 内の `dep.startsWith('@geckou/')`
- `scripts/setup.sh` 内の `yarn workspace @geckou/shared build`
- `.github/workflows/ci.yml` / `deploy.yml` の `yarn workspace @geckou/mobile exec ...`
- `apps/functions/tsconfig.json` の paths（`@geckou/shared` エイリアス）
- `apps/web/next.config.ts` / `apps/mobile/metro.config.js` / `firebase.json` /
  `lint-staged.config.cjs` 内の参照
- `.claude/skills/` / `.claude/docs/` / `README.md` 内のコード例

一括置換（macOS の BSD sed。Linux では `sed -i ''` を `sed -i` にする）:

```bash
# 対象ファイルの確認
grep -rl '@geckou/' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next --exclude-dir=.turbo .

# 一括置換
grep -rl '@geckou/' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next --exclude-dir=.turbo . \
  | xargs sed -i '' 's|@geckou/|@<project-name>/|g'

# 置換漏れの確認（何も出なければ完了）
grep -rn '@geckou/' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next --exclude-dir=.turbo .
```

置換後に `yarn install` を実行し直し、`yarn type-check` が通ることを確認する。

### 4. apps/mobile/app.config.ts のアプリ識別子変更

`apps/mobile/app.config.ts` の以下を変更する:

| 項目 | 現在値 | 変更内容 |
|---|---|---|
| `name` | `Geckou App` | アプリ表示名 |
| `slug` | `geckou-app` | Expo のスラッグ（ケバブケース） |
| `scheme` | `geckou` | ディープリンク用スキーム |
| `ios.bundleIdentifier` | `com.geckou.app` | iOS バンドル ID |
| `android.package` | `com.geckou.app` | Android パッケージ名 |

### 5. CLAUDE.md のプレースホルダ設定

- プロジェクトドキュメント表の `<Figma URL>` を実際の Figma URL に置き換える
- 「テンプレート起因の問題を親リポジトリに報告」セクションはそのまま残す（派生プロジェクトで使うルール）

### 6. ドキュメント・メモリの初期化

- `.claude/docs/planning.md` / `spec.md` / `roadmap.md` のプレースホルダ
  （空のテーブル・コメント）を確認し、プロダクトの内容を記入する
- `memory/daily/` / `memory/short-term/` / `memory/long-term/` 配下に
  テンプレート由来の記録が残っていれば削除する（`memory/evolution.md` は残す）

## 確認事項

- [ ] `yarn setup` を実行した（.firebaserc / .env.*）
- [ ] ルート `package.json` の `name` を変更した
- [ ] `@geckou/` の grep が 0 件になった
- [ ] `yarn install` 後に `yarn type-check` / `yarn test` が通る
- [ ] `apps/mobile/app.config.ts` の識別子を変更した
- [ ] CLAUDE.md の Figma URL を設定した
- [ ] `.claude/docs/` と `memory/` を初期化した
