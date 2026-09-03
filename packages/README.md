# packages/

アプリ間で共有するライブラリを格納するディレクトリ。
ここに置いたコードは `apps/` 内のどのアプリからでもインポートできる。

## テンプレートに含まれるパッケージ

| ディレクトリ | 説明                                                                        |
| ------------ | --------------------------------------------------------------------------- |
<!-- layer:firebase:start -->
| `shared/`    | 共有の型定義・ユーティリティ・Firebase クライアント（初期化 / Firestore / Storage）・状態管理・i18n・デザイントークン |
<!-- layer:firebase:end -->
| `eslint-config/` / `prettier-config/` / `commitlint-config/` | 第0層（規約）の共通設定。npm へ公開して参照で配る（→「第0層の設定パッケージ」） |

## 第0層の設定パッケージ

ESLint / Prettier / commitlint の共通設定は、このリポジトリから npm へ公開して
**参照で配る**（CLAUDE.md「第0層の設定は npm パッケージで配る」）。
ツール側が共有設定を npm パッケージとしてしか受け付けないため、Renovate preset や
reusable workflow のような URL 参照にはできない。

| ディレクトリ | パッケージ | 参照する側 |
| --- | --- | --- |
| `eslint-config/` | `@geckou/eslint-config` | 各ワークスペースの `eslint.config.mjs` |
| `prettier-config/` | `@geckou/prettier-config` | `.prettierrc.cjs` |
| `commitlint-config/` | `@geckou/commitlint-config` | `commitlint.config.cjs` |

ESLint はサブパスで層に対応する。`.` は TypeScript パッケージ（`apps/functions` /
`packages/shared`）、`./next` は Next.js アプリ、`./expo` は Expo アプリ、
`./react` は React（Next.js 以外）、`./vue` は Vue / Nuxt。
**プリセットは重ねて使わない**（それぞれ単独で完結する。重ねると同じプラグインを
別々の実体で登録することになり、ESLint が `Cannot redefine plugin` で落ちる）。

```js
// apps/web/eslint.config.mjs
import next from '@geckou/eslint-config/next'

export default next
```

Prettier には `extends` が無いので、参照する側は spread で受けてプロジェクト固有の
項目だけを足す。`.prettierignore` は参照にできないため各プロジェクトが持つ。

```js
// .prettierrc.cjs
const geckou = require('@geckou/prettier-config')

module.exports = { ...geckou, tailwindStylesheet: './apps/web/src/styles/globals.css' }
```

### 公開する

タグ（`<ディレクトリ名>@<バージョン>`）を打つと `.github/workflows/publish.yml` が
npm へ公開する。`production` への直接 push は禁止なので、version を上げるのは通常の PR。

> **リリース用の仕組みの正はこのリポジトリ。** `scripts/release.sh` /
> `check-api-diff.mjs` / `geckou-release` / `install-release-command.sh` /
> `test-api-diff.sh` / `test-release-command.sh` / `.github/workflows/publish.yml` は
> [`geckou/kit`](https://github.com/geckou/kit) と [`geckou/ui`](https://github.com/geckou/ui)
> にも同じものがある。**直すときはここを直してから 2 リポジトリへ配る。**
> `install-release-command.sh` は 3 リポジトリで中身が同じであることを前提にしている
> （どこから実行しても同じ `geckou-release` が入る）。

```bash
# 1. packages/<パッケージ>/package.json の version を上げる PR を出してマージする
# 2. production でタグを打つ（複数まとめて指定できる）
git checkout production && git pull --ff-only
yarn release eslint-config prettier-config commitlint-config
```

**version を上げる PR には、それを参照するワークスペースのレンジの更新も含める。**
`^0.2.0` のまま 0.3.0 に上げると、そのバージョンはレンジ外になり、yarn はローカルの
パッケージではなく npm 上の旧版をダウンロードして使う。lint も type-check も通ってしまい、
`yarn.lock` に tarball の行が増えるのが唯一の手がかりになる。
`node scripts/check-workspace-ranges.mjs` が検出する（CI と `release.sh` の両方で実行）。

`yarn release` はタグを打つだけで、version は上げない。**HEAD が `origin/production` と
一致していなければ止まる** — 手元が古いままタグを打つと、GitHub は「タグが指すコミットの
ワークフローファイル」で実行するため、古い `publish.yml` が動いて意図しない中身が
公開されうるため。

公開済みのバージョンに対してタグを打っても publish はスキップされる（冪等）。

#### どこからでも実行する

`yarn release` はリポジトリの中でしか動かない（yarn がスクリプトを引けないため）。
各リポジトリで一度だけ次を実行すると、`geckou-release` がどのディレクトリからでも使える。

```bash
bash scripts/install-release-command.sh
```

やっているのは 2 つだけ。リポジトリの絶対パスを
`~/.config/geckou/release-repos` へ登録し、`scripts/geckou-release` を
`~/.local/bin` へ置く（場所は `XDG_CONFIG_HOME` / `XDG_BIN_HOME` に従う）。

```bash
geckou-release eslint-config          # project-starter のものだと自動で分かる
geckou-release core vue --force       # ui のもの
```

パッケージ名から**どのリポジトリのものかを引いて**、そのリポジトリの
`scripts/release.sh` に渡すだけで、検査もタグ打ちも `release.sh` が行う。
`packages/<名前>` が見つからないとき・複数のリポジトリに同名があるとき・
別々のリポジトリのものをまとめて指定したときは、何もせずに止まる。

リポジトリを移動したら、そのリポジトリでもう一度実行する。

**タグを打つ前に、公開済みの型定義と比べて破壊的変更が patch に載っていないかを検査する。**
差分があると止まるので、minor 以上に上げ直すか、互換性のある追加だと分かっていれば `--force` を付ける。

```console
$ yarn release firebase-client
[error] @geckou/firebase-client の型定義が変わっているのに patch 上げになっています（0.1.1 → 0.1.1）
    変更 dist/index.d.ts
      -export declare function initFirebase(config: {
      +export declare function initFirebase(breakingRequiredArgument: string, config: {

  破壊的変更なら minor 以上に上げてください。互換性のある追加なら --force で続行できます。
```

型定義を持たないパッケージ（`packages/*-config` のような素の JS）は API の判定ができないので、
内容が変わっていることを警告するだけで止めない。未公開・ネットワーク不通・ビルド失敗のときも
素通しする（事故を防ぐ安全網であって、公開を守る仕組みではない。そちらは `publish.yml` の
`production` 包含チェック）。

**公開できるのは `production` に入っているコミットだけ。** タグも手動実行も任意の ref から
起動できるので、そのままだと「version の変更を PR で入れてから公開する」手順を迂回して、
レビューを通っていないコードを npm へ出せてしまう。ワークフローは起動元のコミットが
`origin/production` に含まれること・タグのバージョンが `package.json` の version と
一致することを確認してから公開する。

#### 認証（Trusted Publishing）

公開の認証は npm の **Trusted Publishing**（GitHub Actions の OIDC）で行う。
`NPM_TOKEN` のような長期シークレットは持たない。実行のたびに短命なトークンが
発行されるので、**盗まれて後から悪用される秘密が存在しない**。

そのかわり、**npm 側でパッケージごとに Trusted Publisher の登録が要る**。
npmjs.com のパッケージ設定（Settings → Trusted Publisher）で以下を登録する。

| 項目 | 値 |
| --- | --- |
| Provider | GitHub Actions |
| Organization / Repository | `geckou` / `project-starter` |
| Workflow filename | `publish.yml` |
| Environment | `npm-publish` |

新しいパッケージを足したときは、この登録も 1 回だけ行う（登録前に公開しようとすると
認証に失敗する）。

npm 側の紐付けは「リポジトリ + ワークフロー」単位なので、**どの ref から起動されたか
までは npm 側では縛れない**。そこは上の `production` 包含チェックと、`npm-publish`
Environment の「Deployment branches and tags」で担保している。**許可するのは 2 つ**:

| ref type | パターン | 用途 |
| --- | --- | --- |
| Tag | `*@*` | 通常のリリース（`yarn release`） |
| Branch | `production` | `workflow_dispatch` での公開（初回リリース等） |

**タグだけに限定すると `workflow_dispatch` が Environment 側で弾かれる。**
どちらも起動元コミットの `production` 包含チェックを通るので、許可を 2 つにしても
レビューを通っていないコードを公開できる経路は増えない。

`Workflow filename` は**ファイル名だけ**を入れる（`.github/workflows/` のパスは付けない）。
Organization / Repository / Workflow filename は**大文字小文字まで一致**する必要がある。

移行が動くことを確認できたら、パッケージ設定の
**「Require two-factor authentication and disallow tokens」を有効にする**。
以後そのパッケージはトークンでは公開できなくなり、公開経路が Trusted Publishing だけに
なる。**順番を逆にすると公開できなくなる**ので、必ず 1 回公開が通ってから有効にする。

公開されたパッケージには provenance（どのコミット・どのワークフローから公開されたか
の証明）が付く。npm のパッケージページから辿れる。

### 派生プロジェクトでは

派生プロジェクトはこの 3 つを**持たない**（npm から取る）。scaffold 直後は
テンプレートのコピーが残っているので、`/init-project` の手順で削除する。

既にテンプレートから scaffold してある派生プロジェクトの切り替えは
`scripts/adopt-references.mjs` が行う（→ `.claude/docs/git-workflow.md`
「第0層の設定（`packages/*-config`）の参照化」）。

```bash
node scripts/adopt-references.mjs --repo <派生プロジェクトのパス> --dry-run
node scripts/adopt-references.mjs --repo <派生プロジェクトのパス>
```

`eslint.config.mjs` / `.prettierrc.cjs` / `commitlint.config.cjs` を生成し、`package.json` の
依存を入れ替える。**古い `.prettierrc` はスクリプトが消す**。Prettier は `.prettierrc` を
`.prettierrc.cjs` より先に見るため、残すと参照が効かず、古いコピーが黙って使われ続ける。
独自ルールを足している設定ファイルは書き換えず、差分を印字する（`--force` で上書きできる）。
依存が変わるので、実行後に `yarn install` で `yarn.lock` を更新する。

## UI コンポーネント

フォーム部品・モーダル・タブ等の汎用 UI は、このリポジトリではなく
[`geckou/ui`](https://github.com/geckou/ui) で管理し、npm から取得する。

| パッケージ | 用途 |
| ---------- | ---- |
| [`@geckou/ui-react`](https://www.npmjs.com/package/@geckou/ui-react) | Web（React / Next.js）用のコンポーネント |
| [`@geckou/ui-core`](https://www.npmjs.com/package/@geckou/ui-core) | バリデーション・日付処理などの共通ロジック（`ui-react` が依存として取得する） |

派生プロジェクトで修正が必要になった場合は `geckou/ui` 側で直す。
テンプレートに同梱していた頃は、修正が派生プロジェクトへ届かなかった。

`apps/web` には設定済み。新しいアプリで使う場合は以下を設定する。

1. `package.json` に `"@geckou/ui-react": "^0.3.0"` を追加
2. `tailwind.config.ts` の `content` に `'../../node_modules/@geckou/ui-react/dist/**/*.js'` を追加
3. グローバル CSS に `@import '@geckou/ui-react/styles/tokens.css';` を追加（デザイントークン）

0.2.0 から dist（ビルド済み）を配るので `transpilePackages` は要らない。
Tailwind は **v4 が必須**（コンポーネントが `bg-(--x)` / `flex-none!` など v4 の記法を
直書きしている）。スキャン対象は `src` ではなく `dist` を指す（`files: ["dist"]` のため
tarball に `src` は入らない）。

### 既存の派生プロジェクトへの導入

**上記 1〜3 は Template Sync では届かない。** `.templatesyncignore` が `apps/`・
ルート `package.json`・`yarn.lock` を除外しているため、いずれも同期対象外。
導入したいプロジェクトで一度だけ手作業で設定する。

```bash
yarn workspace <web ワークスペース名> add @geckou/ui-react
```

そのうえで 2〜3 を設定する。以後の更新は `yarn up @geckou/ui-react` で受け取れる。

## shared の構成

```
shared/src/
├── types/      # 共通の型定義（User, ApiResponse 等）
<!-- layer:billing:start -->
├── billing/    # @geckou/billing/entitlement の re-export（権利判定）
<!-- layer:billing:end -->
├── utils/      # ユーティリティ関数（formatDate, sleep 等）
<!-- layer:firebase:start -->
├── firebase/   # Firebase クライアント SDK の初期化（"use client"）
├── firestore/  # Firestore の CRUD・クエリ・購読（"use client"）
├── storage/    # Firebase Storage のアップロード・削除（"use client"）
├── stores/     # Zustand ストア（認証状態等）
<!-- layer:firebase:end -->
├── i18n/       # 翻訳キーとロケール（ja / en）
├── theme/      # デザイントークン（色・フォント・角丸等）
└── index.ts    # 環境非依存のモジュールだけを一括エクスポート
```

## インポート方法

各アプリの `package.json` に依存を追加すると:

```json
{
  "dependencies": {
    "@geckou/shared": "*"
  }
}
```

コード内で外部ライブラリと同じようにインポートできる。
実際にはダウンロードされるわけではなく、yarn のワークスペース機能で `packages/shared/src/` を直接参照している。

```typescript
// ルートのバレルが出すのは環境非依存のもの（types / utils / theme / i18n）だけ
import { formatDate } from '@geckou/shared'
import type { User } from '@geckou/shared'

// layer:firebase:start
// firebase / zustand に依存するものはサブパスから取る
import { initFirebase } from '@geckou/shared/firebase'
import { getDocument } from '@geckou/shared/firestore'
import { uploadFile } from '@geckou/shared/storage'
import { useAuthStore } from '@geckou/shared/stores'
// layer:firebase:end
```

<!-- layer:firebase:start -->

**`initFirebase` をルートから import することはできない。** バレルが Firebase クライアント
SDK を巻き込むと、`firebase-admin` しか依存に持たない `apps/functions` が
`@geckou/shared` を import しただけで `firebase` / `zustand` の型解決を要求されるため、
意図的に除外している（`packages/shared/src/index.ts` の冒頭コメント参照）。

<!-- layer:firebase:end -->

## Tailwind CSS / デザイントークンの仕組み

色やフォント等のデザイントークンは `packages/shared/src/theme/index.ts` を単一の情報源として共有する。

<!-- layer:mobile:start -->

### なぜバージョンが違うのか

Web と Mobile で Tailwind のバージョンが異なる。

- **Web**: Tailwind CSS **v4**（最新。CSS ベースの設定）
- **Mobile**: Tailwind CSS **v3** + NativeWind（NativeWind が v3 を要求するため）

バージョンは違うが、`className="text-primary-500"` のような書き方は同じ。

<!-- layer:mobile:end -->

### デザイントークンの流れ

```
packages/shared/src/theme/index.ts    ← 色・フォント・角丸を定義（単一の情報源）
        │
        ├── apps/web/tailwind.config.ts       ← import して theme.extend に設定
        │   └── apps/web/src/styles/globals.css で @config から読み込み
<!-- layer:mobile:start -->
        │
        └── apps/mobile/tailwind.config.js    ← require して theme.extend に設定
<!-- layer:mobile:end -->
```

### 色を変更・追加したい場合

`packages/shared/src/theme/index.ts` を編集するだけで Web と Mobile の両方に反映される。

```typescript
// packages/shared/src/theme/index.ts
export const colors = {
  primary: {
    500: '#0ea5e9', // ← ここを変えれば両方変わる
    // ...
  },
}
```

各アプリの Tailwind 設定ファイルは触る必要なし。

### 各ファイルの役割

| ファイル                             | 役割                                             |
| ------------------------------------ | ------------------------------------------------ |
| `packages/shared/src/theme/index.ts` | デザイントークンの定義（色・フォント・角丸）     |
| `apps/web/tailwind.config.ts`        | Web 用 Tailwind 設定。shared/theme を読み込む    |
| `apps/web/src/styles/globals.css`    | Tailwind の読み込みと `@config` でconfig を参照  |
| `apps/web/postcss.config.mjs`        | PostCSS 経由で Tailwind v4 を処理                |
<!-- layer:mobile:start -->
| `apps/mobile/tailwind.config.js`     | Mobile 用 Tailwind 設定。shared/theme を読み込む |
| `apps/mobile/src/global.css`         | NativeWind 用の Tailwind ディレクティブ          |
| `apps/mobile/metro.config.js`        | Metro bundler に NativeWind を統合               |
| `apps/mobile/babel.config.js`        | Babel に NativeWind プリセットを追加             |
<!-- layer:mobile:end -->

## 新しいパッケージを追加する場合

1. `packages/` 配下にディレクトリを作成
2. `package.json` の `name` を `@geckou/<package-name>` にする
3. `yarn install` を実行
4. 使いたいアプリの `package.json` に依存として追加（`"@geckou/<package-name>": "*"`）
