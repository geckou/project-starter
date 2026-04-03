# packages/

アプリ間で共有するライブラリを格納するディレクトリ。
ここに置いたコードは `apps/` 内のどのアプリからでもインポートできる。

## テンプレートに含まれるパッケージ

| ディレクトリ | 説明                                                                        |
| ------------ | --------------------------------------------------------------------------- |
| `shared/`    | 共有の型定義・ユーティリティ・Firebase クライアント初期化・デザイントークン |

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
