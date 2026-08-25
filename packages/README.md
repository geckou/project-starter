# packages/

アプリ間で共有するライブラリを格納するディレクトリ。
ここに置いたコードは `apps/` 内のどのアプリからでもインポートできる。

## テンプレートに含まれるパッケージ

| ディレクトリ | 説明                                                                        |
| ------------ | --------------------------------------------------------------------------- |
| `shared/`    | 共有の型定義・ユーティリティ・Firebase クライアント初期化・デザイントークン |

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

1. `package.json` に `"@geckou/ui-react": "^0.1.0"` を追加
2. `next.config.ts` の `transpilePackages` に `'@geckou/ui-react'` を追加
3. `tailwind.config.ts` の `content` に `'../../node_modules/@geckou/ui-react/src/**/*.{ts,tsx}'` を追加
4. グローバル CSS に `@import '@geckou/ui-react/styles/tokens.css';` を追加（デザイントークン）

### 既存の派生プロジェクトへの導入

**この変更は Template Sync では届かない。** `.templatesyncignore` が `apps/`・
ルート `package.json`・`yarn.lock` を除外しているため、上記 1〜4 はいずれも同期対象外。
導入したいプロジェクトで一度だけ手作業で行う。

```bash
yarn workspace <web ワークスペース名> add @geckou/ui-react
```

そのうえで 2〜4 を設定する。以後の更新は `yarn up @geckou/ui-react` で受け取れる。

なお、テンプレートに同梱していた `packages/ui` は**どの派生プロジェクトにも配布されていなかった**
（`taros` / `corp-site-v2` / `aumund` のいずれにも存在しない）。したがって削除による影響はなく、
「使いたければ導入する」だけでよい。

## shared の構成

```
shared/src/
├── types/      # 共通の型定義（User, ApiResponse 等）
├── utils/      # ユーティリティ関数（formatDate, sleep 等）
├── firebase/   # Firebase クライアント SDK の初期化（"use client"）
├── theme/      # デザイントークン（色・フォント・角丸等）
└── index.ts    # 一括エクスポート
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
// 全部まとめて
import { formatDate, initFirebase } from '@geckou/shared'
import type { User } from '@geckou/shared'

// 個別に（Firebase クライアント SDK を含めたくない場合）
import type { User } from '@geckou/shared/types'
import { formatDate } from '@geckou/shared/utils'
```

## Tailwind CSS / デザイントークンの仕組み

Web と Mobile で Tailwind のバージョンが異なるが、色やフォント等のデザイントークンは共有している。

### なぜバージョンが違うのか

- **Web**: Tailwind CSS **v4**（最新。CSS ベースの設定）
- **Mobile**: Tailwind CSS **v3** + NativeWind（NativeWind が v3 を要求するため）

バージョンは違うが、`className="text-primary-500"` のような書き方は同じ。

### デザイントークンの流れ

```
packages/shared/src/theme/index.ts    ← 色・フォント・角丸を定義（単一の情報源）
        │
        ├── apps/web/tailwind.config.ts       ← import して theme.extend に設定
        │   └── apps/web/src/styles/globals.css で @config から読み込み
        │
        └── apps/mobile/tailwind.config.js    ← require して theme.extend に設定
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
| `apps/mobile/tailwind.config.js`     | Mobile 用 Tailwind 設定。shared/theme を読み込む |
| `apps/mobile/src/global.css`         | NativeWind 用の Tailwind ディレクティブ          |
| `apps/mobile/metro.config.js`        | Metro bundler に NativeWind を統合               |
| `apps/mobile/babel.config.js`        | Babel に NativeWind プリセットを追加             |

## 新しいパッケージを追加する場合

1. `packages/` 配下にディレクトリを作成
2. `package.json` の `name` を `@geckou/<package-name>` にする
3. `yarn install` を実行
4. 使いたいアプリの `package.json` に依存として追加（`"@geckou/<package-name>": "*"`）
