# apps/

デプロイ可能なアプリケーションを格納するディレクトリ。
1つのリポジトリで複数のデプロイ先を管理でき、`packages/shared` の型やユーティリティを共有できる。

## テンプレートに含まれるアプリ

| ディレクトリ | 説明                                                            | デプロイ先の例          |
| ------------ | --------------------------------------------------------------- | ----------------------- |
| `web/`       | Next.js 15 (App Router / SSR)。Tailwind CSS v4                  | Vercel / Cloud Run      |
| `mobile/`    | Expo SDK 52 (iOS / Android)。NativeWind v4。不要なら削除可      | App Store / Google Play |
| `functions/` | Firebase Cloud Functions (v2)。サーバーサイドのビジネスロジック | Firebase                |

## ディレクトリ名について

`web/` や `mobile/` はテンプレートとしての仮名。
実プロジェクトではわかりやすい名前に変更して構わない。

例: CustomJapan プロジェクトの場合

```
apps/
├── customjapan/        # メインサイト
├── customjapan-admin/  # 社内管理画面
├── mobile/             # モバイルアプリ
└── functions/          # Cloud Functions
```

名前を変更したら `package.json` の `name` も合わせて変更する。

```json
{
  "name": "@geckou/customjapan"
}
```

## 新しいアプリを追加する場合

既存のアプリ（`web/` 等）をコピーして作るのが早い。

1. `apps/` 配下にディレクトリを作成（コピー or 新規）
2. `package.json` の `name` を `@geckou/<app-name>` にする
3. `yarn install` を実行
4. `yarn dev --filter=@geckou/<app-name>` で起動できるようになる

ルートの `package.json` に `"workspaces": ["apps/*"]` と定義されているため、
`apps/` 配下に置くだけで Turborepo が自動的に認識する。設定の追加は不要。
