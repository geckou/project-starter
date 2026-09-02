# @geckou/eslint-config

geckou のプロジェクト共通の ESLint 設定（flat config）。各プロジェクトは参照 1 行だけを持ち、
ルール本体はこのパッケージが持つ。

## インストール

```bash
yarn add -D @geckou/eslint-config eslint
```

`eslint` は peerDependency。プラグイン類はこのパッケージが依存として持つので、個別に入れる必要はない。

## 使い方

プリセットは 5 つ。**重ねて使わない**（それぞれ単独で完結する。重ねると同じプラグインを
別々の実体で登録することになり、ESLint が `Cannot redefine plugin` で落ちる）。

| サブパス | 対象 |
| --- | --- |
| `.` | TypeScript パッケージ（Cloud Functions・共有パッケージ等） |
| `./next` | Next.js アプリ |
| `./expo` | Expo アプリ |
| `./vue` | Vue 3 パッケージ |
| `./react` | React パッケージ（Next.js を使わないコンポーネントライブラリ等） |

```js
// eslint.config.mjs（TypeScript パッケージ）
import geckou from '@geckou/eslint-config'

export default geckou
```

```js
// apps/web/eslint.config.mjs
import next from '@geckou/eslint-config/next'

export default next
```

```js
// apps/mobile/eslint.config.mjs
import expo from '@geckou/eslint-config/expo'

export default expo
```

```js
// Vue パッケージの eslint.config.mjs
import vue from '@geckou/eslint-config/vue'

export default vue
```

Vue と React が同居するリポジトリでは、**それぞれのディレクトリに絞って**並べる。
対象が重なると同じファイルに 2 つのプリセットが当たる。

```js
// リポジトリ直下の eslint.config.mjs
import react from '@geckou/eslint-config/react'
import vue from '@geckou/eslint-config/vue'

export default [
  ...vue.map((config) => ({ ...config, files: ['packages/vue/**/*.{vue,ts}'] })),
  ...react.map((config) => ({ ...config, files: ['packages/react/**/*.{ts,tsx}'] })),
]
```

## 方針

- **フォーマット系のルールは持たない。** Prettier に委譲する（`eslint-config-prettier` で無効化済み）。
  フォーマットは [`@geckou/prettier-config`](https://www.npmjs.com/package/@geckou/prettier-config) を使う
- 共通の値（無視するパス・共有ルール）は `rules.js` に置き、各プリセットから参照する。
  `rules.js` はプラグインを読み込まないので、どのプリセットから参照しても多重定義にならない

ルールを変えるときは [`geckou/project-starter`](https://github.com/geckou/project-starter) の
`packages/eslint-config/` を直す。
