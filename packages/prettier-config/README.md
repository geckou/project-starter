# @geckou/prettier-config

geckou のプロジェクト共通の Prettier 設定。

## インストール

```bash
yarn add -D @geckou/prettier-config prettier
```

`prettier` は peerDependency。`prettier-plugin-tailwindcss` はこのパッケージが依存として持つ。

## 使い方

Prettier には `extends` が無いため、参照する側は spread で受けてプロジェクト固有の項目だけを足す。

```js
// .prettierrc.cjs
const geckou = require('@geckou/prettier-config')

module.exports = { ...geckou }
```

Tailwind を使う場合は、クラス並べ替えの基準になる CSS を足す。

```js
// .prettierrc.cjs
const geckou = require('@geckou/prettier-config')

module.exports = {
  ...geckou,
  tailwindStylesheet: './apps/web/src/styles/globals.css',
}
```

## 内容

| 項目 | 値 |
| --- | --- |
| `semi` | `false` |
| `singleQuote` | `true` |
| `tabWidth` | `2` |
| `trailingComma` | `es5` |
| `printWidth` | `80` |
| `plugins` | `prettier-plugin-tailwindcss` |

プラグインは名前ではなく解決済みの絶対パスで渡している。名前で書くと参照する側の設定ファイルの
位置から解決されるため、依存の巻き上げ方によっては見つからないことがあるため。

## 注意

`.prettierignore` は参照にできないので、各プロジェクトが持つ。また **Prettier は `.prettierrc` を
`.prettierrc.cjs` より先に読む**。移行するときは古い `.prettierrc` を必ず消すこと（両方あると
参照が効かず、古いコピーが黙って使われ続ける）。

ルールを変えるときは [`geckou/project-starter`](https://github.com/geckou/project-starter) の
`packages/prettier-config/` を直す。
