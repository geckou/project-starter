# @geckou/commitlint-config

geckou のプロジェクト共通の commitlint 設定。

## インストール

```bash
yarn add -D @geckou/commitlint-config @commitlint/cli
```

`@commitlint/cli` は peerDependency。`@commitlint/config-conventional` はこのパッケージが依存として持つ。

**Node 22.12 以上が要る。** `@commitlint/config-conventional@21` と `@commitlint/cli@21` が
どちらも `engines.node: ">=22.12.0"` を宣言しているため、Node 20 では yarn 1 が
`The engine "node" is incompatible with this module` でインストール自体を止める。
Node 20 のまま使う場合、`resolutions` で依存を `^19` に下げるだけでは足りない。
**このパッケージ自身の `engines` で止まる**ため `--ignore-engines` が要る。

```jsonc
// package.json
"resolutions": { "@commitlint/config-conventional": "^19" },
"devDependencies": { "@commitlint/cli": "^19" }
```

```bash
yarn install --ignore-engines
```

`--ignore-engines` を常用したくないなら、このパッケージを使わず
`@commitlint/config-conventional@19` を直接 extends する。

## 使い方

```js
// commitlint.config.cjs
module.exports = { extends: ['@geckou/commitlint-config'] }
```

`.husky/commit-msg` から実行する。

```sh
yarn commitlint --edit "$1"
```

## 内容

`@commitlint/config-conventional` を土台に、2 点だけ変えている。

| ルール | 値 | 理由 |
| --- | --- | --- |
| `type-enum` | `feat` `fix` `refactor` `style` `docs` `test` `chore` | リリースで `git log` を追うときの可読性 |
| `subject-case` | 無効 | 日本語の description を許可するため |

コミットメッセージは `<type>: <description>` 形式で書く。

```
feat: ユーザープロフィール画面を追加する
fix: 0 バイトのファイルで進捗が NaN になるのを直す
```

ルールを変えるときは [`geckou/project-starter`](https://github.com/geckou/project-starter) の
`packages/commitlint-config/` を直す。
