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
判断がつかない層は残しておいてよい。外した層は加算スキル（`/add-firebase` `/add-functions`
`/add-mobile` `/add-billing`。実体は `scripts/add-layer.mjs`）で後から戻せる。

### 2. scripts/setup.sh の実行

```bash
yarn setup
```

- `.firebaserc` のプレースホルダ（`your-project-develop` 等）を実際の Firebase プロジェクト ID に置換
- `.env.develop` / `.env.staging` / `.env.production` / `.env.local` を `.env.example` から作成
- Node.js / yarn / Firebase CLI のチェック、production ブランチ保護の設定、依存インストール

### 3. ルート package.json の name 変更

`package.json` の `"name": "geckou-monorepo"` を `"<project-name>-monorepo"` 等に変更する。

### 3.5. 第0層の設定パッケージを削除する

ESLint / Prettier / commitlint の共通設定は npm から取る。scaffold には
**公開元の実体**（`packages/*-config`）が付いてくるので、派生プロジェクトでは削除する。
残すとローカルのワークスペースが優先され、テンプレート側の修正が届かない。

```bash
rm -rf packages/eslint-config packages/prettier-config packages/commitlint-config
```

参照する側（`eslint.config.mjs` / `.prettierrc.cjs` / `commitlint.config.cjs` と、
各 `package.json` の `@geckou/*-config` 依存）は**そのまま残す**。
次の `yarn install` で npm から取得される。

あわせて `layers.json` から該当の行（`packages/eslint-config/*` と、mobile 層の
`deps` / `json` のエントリ）を消す。実在しないパスは `node scripts/check-layers.mjs` が
検出する。

### 3.6. テンプレート専用の導線を削除する

パッケージ公開とテンプレート自身の検証のための仕組みは、派生プロジェクトでは使わない。
ワークフロー側は `if: github.repository == 'geckou/project-starter'` で起動しないが、
ファイルが残っていると読む人を惑わせるので消してよい（`.templatesyncignore` に
入っているので、消しても Template Sync で戻ってこない）。

```bash
rm -f .github/workflows/publish.yml .github/workflows/layer-matrix.yml \
  .github/workflows/smoke-test.yml .github/workflows/release-tag.yml
rm -f scripts/release.sh scripts/geckou-release scripts/install-release-command.sh \
  scripts/test-release-command.sh scripts/check-api-diff.mjs scripts/test-api-diff.sh \
  scripts/check-workspace-ranges.mjs scripts/test-workspace-ranges.sh
```

`ci.yml` の該当ステップは `hashFiles` で存在を見ているため、消しても CI は緑のまま通る。

### 4. `@geckou/*` スコープの一括リネーム

ワークスペース内部のスコープ `@geckou/*` を `@<project-name>/*` に一括置換する。

> ⚠️ **npm から取得する外部パッケージは置換しない。**
> `@geckou/ui-react` / `@geckou/ui-core`（[`geckou/ui`](https://github.com/geckou/ui) 管理）、
> `@geckou/billing` / `@geckou/firebase-client` / `@geckou/firebase-server`
> （[`geckou/kit`](https://github.com/geckou/kit) 管理）、
> `@geckou/eslint-config` / `@geckou/prettier-config` / `@geckou/commitlint-config`
> （テンプレート本体から公開している第0層の設定）が対象であり、
> リネームすると依存が解決できなくなる。下の手順はこの 8 つを除外している。
>
> 判断の基準は「`private: true` のワークスペースかどうか」。npm から取るものは
> ワークスペースとして存在しないので、増えたらこのリストにも足す。

対象は package.json の name / 依存だけでなく、以下すべてに及ぶ:

- 全ワークスペースの `package.json`（`name`, `dependencies` の `@geckou/shared` 等）
- ルート `package.json` の `workspaces.nohoist`（`@geckou/mobile/**`, `@geckou/mobile-*/**`）と
  scripts の `turbo dev --filter=@geckou/web...` 等
- 全ソースコードの import 文（`@geckou/shared`, `@geckou/shared/stores` 等）
- `apps/*/tailwind.config.{ts,js}` の `@geckou/shared/theme` 参照
- `scripts/setup.sh` 内の `yarn workspace @geckou/shared build`
- `apps/functions/tsconfig.json` の paths（`@geckou/shared` エイリアス）
- `apps/web/next.config.ts` / `apps/mobile/metro.config.js` / `firebase.json` /
  `lint-staged.config.cjs` 内の参照
- `.claude/skills/` / `.claude/docs/` / `README.md` 内のコード例

一括置換（macOS の BSD sed。Linux では `sed -i ''` を `sed -i` にする）:

> ⚠️ **このファイル（`SKILL.md`）自身は置換対象から外すこと。**
> 下の `sed` の正規表現リテラル `@geckou/(ui-react|ui-core|billing|...)` も `@geckou/` を含むため、
> 自身に適用するとコマンドが書き換わり、次回以降の手順が壊れる。
> 以下のコマンドは `grep -v` でこのファイルを除外している。

```bash
EXCLUDES="--exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next --exclude-dir=.turbo"
SELF=".claude/skills/init-project/SKILL.md"

# 対象ファイルの確認
grep -rl '@geckou/' $EXCLUDES . | grep -v "$SELF"

# 一括置換（npm から取得する外部パッケージは温存する）
# デリミタは # を使う。| だと正規表現の選択と衝突する
grep -rl '@geckou/' $EXCLUDES . | grep -v "$SELF" \
  | xargs sed -i '' -E 's#@geckou/(ui-react|ui-core|billing|firebase-client|firebase-server|eslint-config|prettier-config|commitlint-config)#@@KEEP@@\1#g; s#@geckou/#@<project-name>/#g; s#@@KEEP@@#@geckou/#g'

# 置換漏れの確認
# （温存した外部パッケージと、SKILL.md 内の記述だけが残っていれば完了）
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

### 7. CI と依存更新をテンプレート参照に切り替える

コピーではなく参照にすることで、テンプレート側の修正が取り込み作業ゼロで届く。

**CI（reusable workflow）**

`.github/workflows/ci.yml` を参照だけの内容に置き換え、`.templatesyncignore` に
`.github/workflows/ci.yml` を追加する（テンプレートの実体で上書きされないようにするため）。
置き換える内容と理由は `.claude/docs/git-workflow.md`「CI の配布（reusable workflow）」を参照。

**Copilot の自動レビューを ruleset で入れる。**

```bash
gh api repos/{owner}/{repo}/rulesets \
  --method POST \
  --input .github/rulesets/copilot-review.json
```

PR ごとにレビューを依頼する手間が無くなる。`production.json` とは別の ruleset なので、
プランの都合で `production.json` を取り込めない場合でもこちらだけ入れられる。
詳細は `.claude/docs/git-workflow.md`「Copilot の自動レビュー」を参照。

**依存更新（Renovate）**

`renovate.json5` はテンプレートから配られるのでそのまま使う。**Renovate の GitHub App を
このリポジトリにインストールする**（未インストールだと依存更新が一切来ない）。

インストールしただけでは PR が来ない。**Mend の管理画面でこのリポジトリの Silent mode を
OFF にする**（Settings > Dependencies）。Silent mode はジョブを実行しても PR も
Dependency Dashboard も作らないモードで、組織の既定が Silent になっていることがある。

あわせて **Dependency graph と Dependabot alerts を有効化する**（Settings > Advanced Security）。
これが無効だと `vulnerabilityAlerts` が働かず、**気付かないままセキュリティ更新だけ止まる**。
Dependabot の設定ファイルが残っていれば削除する（PR が二重に立つため）。
詳細は `.claude/docs/dependencies.md`。

### 8. ドキュメント・メモリの初期化

- `.claude/docs/planning.md` / `spec.md` / `roadmap.md` のプレースホルダ
  （空のテーブル・コメント）を確認し、プロダクトの内容を記入する
- `memory/daily/` / `memory/short-term/` / `memory/long-term/` 配下に
  テンプレート由来の記録が残っていれば削除する（`memory/evolution.md` は残す）

## 確認事項

- [ ] 使う層を決め、不要な層を `scripts/remove-layer.mjs` で外した
- [ ] `node scripts/check-layers.mjs` が通る（層マニフェストと実態が一致している）
- [ ] `yarn setup` を実行した（.firebaserc / .env.*）
- [ ] ルート `package.json` の `name` を変更した
- [ ] `packages/{eslint,prettier,commitlint}-config` を削除し、`layers.json` から該当の行を消した
- [ ] テンプレート専用のワークフロー・スクリプト（公開導線・layer-matrix・smoke-test・release-tag）を削除した
- [ ] `@geckou/` の grep が npm から取得する外部パッケージ（`ui-react` / `ui-core` / `billing` /
      `firebase-client` / `firebase-server` / `eslint-config` / `prettier-config` /
      `commitlint-config`）と
      `.claude/skills/init-project/SKILL.md`（この手順書自身）以外 0 件になった
- [ ] `yarn install` 後に `yarn type-check` / `yarn test` が通る
- [ ] `apps/mobile/app.config.ts` の識別子を変更した（mobile 層を残した場合）
- [ ] CLAUDE.md の Figma URL を設定した
- [ ] CI を reusable workflow の参照に切り替え、`.templatesyncignore` に追加した
- [ ] Copilot の自動レビュー ruleset（`.github/rulesets/copilot-review.json`）を取り込んだ
- [ ] Renovate の GitHub App をインストールし、Silent mode を OFF にした
- [ ] Dependency graph / Dependabot alerts を有効化した（脆弱性の PR が来るようにする）
- [ ] `.claude/docs/` と `memory/` を初期化した
