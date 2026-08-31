---
name: init-project
description: テンプレートから派生プロジェクトを初期化する（Firebase 設定・スコープリネーム・アプリ識別子・ドキュメント）
---

# init-project

このテンプレート（`geckou/project-starter`）から scaffold した派生プロジェクトの初期化を行う。
ユーザーに新しいプロジェクト名（例: `myapp`）を確認してから開始する。

## 手順

### 1. 使う層を決める

このテンプレートは core + opt-in 層で構成されている（`layers.json` / `.claude/docs/layers.md`）。

```
core → firebase → functions → mobile / billing
```

ユーザーにプロジェクトの形（Web だけか / モバイルがあるか / 課金があるか / API・トリガーが要るか）を
確認し、**要らない層は依存インストールの前に外す**。後から外すより、最初から無い方が
Expo や課金の維持コストを払わずに済む。

```bash
node scripts/remove-layer.mjs --dry-run mobile   # 何が消えるか先に見る
node scripts/remove-layer.mjs mobile billing     # 例: Web のみ・課金なし
```

外したあとは `yarn format` で整形する（`yarn install` は次の手順で走る）。
判断がつかない層は残しておいてよい。**外した層を後から戻す加算スキル（`/add-*`）は未実装**のため、
迷ったら残す方が安全（`layers.json` に定義は残っている）。

### 2. scripts/setup.sh の実行

```bash
yarn setup
```

- `.firebaserc` のプレースホルダ（`your-project-develop` 等）を実際の Firebase プロジェクト ID に置換
- `.env.develop` / `.env.staging` / `.env.production` / `.env.local` を `.env.example` から作成
- Node.js / yarn / Firebase CLI のチェック、production ブランチ保護の設定、依存インストール

### 3. ルート package.json の name 変更

`package.json` の `"name": "geckou-monorepo"` を `"<project-name>-monorepo"` 等に変更する。

### 4. `@geckou/*` スコープの一括リネーム

ワークスペース内部のスコープ `@geckou/*` を `@<project-name>/*` に一括置換する。

> ⚠️ **`@geckou/ui-react`・`@geckou/ui-core`・`@geckou/billing` は置換しない。**
> これらは npm から取得する外部パッケージ（`ui-react` / `ui-core` は [`geckou/ui`](https://github.com/geckou/ui)、
> `billing` は [`geckou/kit`](https://github.com/geckou/kit) 管理）であり、
> リネームすると依存が解決できなくなる。下の手順はこの 3 つを除外している。

対象は package.json の name / 依存だけでなく、以下すべてに及ぶ:

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

> ⚠️ **このファイル（`SKILL.md`）自身は置換対象から外すこと。**
> 下の `sed` の正規表現リテラル `@geckou/(ui-react|ui-core|billing)` も `@geckou/` を含むため、
> 自身に適用するとコマンドが書き換わり、次回以降の手順が壊れる。
> 以下のコマンドは `grep -v` でこのファイルを除外している。

```bash
EXCLUDES="--exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next --exclude-dir=.turbo"
SELF=".claude/skills/init-project/SKILL.md"

# 対象ファイルの確認
grep -rl '@geckou/' $EXCLUDES . | grep -v "$SELF"

# 一括置換（@geckou/ui-react と @geckou/ui-core は温存する）
# デリミタは # を使う。| だと正規表現の選択と衝突する
grep -rl '@geckou/' $EXCLUDES . | grep -v "$SELF" \
  | xargs sed -i '' -E 's#@geckou/(ui-react|ui-core|billing)#@@KEEP@@\1#g; s#@geckou/#@<project-name>/#g; s#@@KEEP@@#@geckou/#g'

# 置換漏れの確認
# （@geckou/ui-react と @geckou/ui-core、および SKILL.md 内の記述だけが残っていれば完了）
grep -rn '@geckou/' $EXCLUDES .
```

置換後に `yarn install` を実行し直し、`yarn type-check` が通ることを確認する。

### 5. apps/mobile/app.config.ts のアプリ識別子変更

mobile 層を外した場合はこの手順を飛ばす。

`apps/mobile/app.config.ts` の以下を変更する:

| 項目 | 現在値 | 変更内容 |
|---|---|---|
| `name` | `Geckou App` | アプリ表示名 |
| `slug` | `geckou-app` | Expo のスラッグ（ケバブケース） |
| `scheme` | `geckou` | ディープリンク用スキーム |
| `ios.bundleIdentifier` | `com.geckou.app` | iOS バンドル ID |
| `android.package` | `com.geckou.app` | Android パッケージ名 |

### 6. CLAUDE.md のプレースホルダ設定

- プロジェクトドキュメント表の `<Figma URL>` を実際の Figma URL に置き換える
- 「テンプレート起因の問題を親リポジトリに報告」セクションはそのまま残す（派生プロジェクトで使うルール）

### 7. ドキュメント・メモリの初期化

- `.claude/docs/planning.md` / `spec.md` / `roadmap.md` のプレースホルダ
  （空のテーブル・コメント）を確認し、プロダクトの内容を記入する
- `memory/daily/` / `memory/short-term/` / `memory/long-term/` 配下に
  テンプレート由来の記録が残っていれば削除する（`memory/evolution.md` は残す）

## 確認事項

- [ ] 使う層を決め、不要な層を `scripts/remove-layer.mjs` で外した
- [ ] `node scripts/check-layers.mjs` が通る（層マニフェストと実態が一致している）
- [ ] `yarn setup` を実行した（.firebaserc / .env.*）
- [ ] ルート `package.json` の `name` を変更した
- [ ] `@geckou/` の grep が `@geckou/ui-react` / `@geckou/ui-core` / `@geckou/billing`（外部パッケージ）と
      `.claude/skills/init-project/SKILL.md`（この手順書自身）以外 0 件になった
- [ ] `yarn install` 後に `yarn type-check` / `yarn test` が通る
- [ ] `apps/mobile/app.config.ts` の識別子を変更した（mobile 層を残した場合）
- [ ] CLAUDE.md の Figma URL を設定した
- [ ] `.claude/docs/` と `memory/` を初期化した
