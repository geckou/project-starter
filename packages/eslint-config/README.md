# @geckou/eslint-config

geckou のプロジェクト共通の ESLint 設定（flat config）。各プロジェクトは参照 1 行だけを持ち、
ルール本体はこのパッケージが持つ。

## インストール

```bash
yarn add -D @geckou/eslint-config eslint
```

`eslint` は peerDependency。プラグイン類はこのパッケージが依存として持つので、個別に入れる必要はない。

## 使い方

プリセットは 3 つ。**重ねて使わない**（それぞれ単独で完結する。重ねると同じプラグインを
別々の実体で登録することになり、ESLint が `Cannot redefine plugin` で落ちる）。

| サブパス | 対象 |
| --- | --- |
| `.` | TypeScript パッケージ（Cloud Functions・共有パッケージ等） |
| `./next` | Next.js アプリ |
| `./expo` | Expo アプリ |

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

プロジェクト固有のルールを足す場合は、配列に足す形で書く。

## 方針

- **フォーマット系のルールは持たない。** Prettier に委譲する（`eslint-config-prettier` で無効化済み）。
  フォーマットは [`@geckou/prettier-config`](https://www.npmjs.com/package/@geckou/prettier-config) を使う
- 共通の値（無視するパス・共有ルール）は `rules.js` に置き、3 つのプリセットから参照する

ルールを変えるときは [`geckou/project-starter`](https://github.com/geckou/project-starter) の
`packages/eslint-config/` を直す。
