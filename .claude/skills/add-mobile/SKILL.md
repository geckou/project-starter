---
name: add-mobile
description: mobile 層（Expo / iOS / Android）をプロジェクトに足す
---

# add-mobile

**mobile 層**（Expo SDK 52 + Expo Router + NativeWind）を足す。
層の考え方は `.claude/docs/layers.md` を参照。

> この層はメンテコストが大きい（React / Tailwind のバージョン分裂、`nohoist`、
> CI の `expo customize` ステップ、Renovate の Expo ルール）。
> 本当にネイティブアプリが要るのかを先に確認する。Web だけで足りるなら足さない。

## 1. 配線する（スクリプト）

```bash
node scripts/add-layer.mjs mobile --dry-run
node scripts/add-layer.mjs mobile
yarn install
yarn format
```

前提の firebase / functions 層が無ければ一緒に足される
（それぞれ `/add-firebase` `/add-functions` の判断部分も実施すること）。

スクリプトが入れるもの:

| 区分 | 中身 |
| --- | --- |
| ファイル | `apps/mobile/` 一式（Expo Router の画面・`lib/{api-client,firebase,push-notifications,sentry}.ts`・設定） |
| 設定 | ルート `package.json` の `workspaces.nohoist` と `dev:mobile`、lint-staged、`deploy.yml` の Expo ステップ（`ci.yml` / `smoke-test.yml` は `apps/mobile` の有無を実行時に判定する）、`renovate/mobile.json`（Expo 系の更新ルール） |
| env | `FIREBASE_*`（Expo 用）/ `EXPO_PUBLIC_API_BASE_URL` / `EXPO_PUBLIC_SENTRY_DSN` |

## 2. 判断が要る部分

### 2-1. アプリの識別子

`apps/mobile/app.config.ts` を書き換える。**後から変えるとストア側の登録に影響する**ため最初に決める。

| 項目 | 既定値 | 決めること |
| --- | --- | --- |
| `name` | `Geckou App` | ストアとホーム画面に出るアプリ名 |
| `slug` | `geckou-app` | Expo のスラッグ（ケバブケース） |
| `scheme` | `geckou` | ディープリンクのスキーム |
| `ios.bundleIdentifier` | `com.geckou.app` | iOS のバンドル ID |
| `android.package` | `com.geckou.app` | Android のパッケージ名 |

### 2-2. Expo / EAS のセットアップ

```bash
yarn workspace @geckou/mobile exec expo customize tsconfig.json   # 型定義の生成（CI でも実行される）
cd apps/mobile && npx eas-cli@latest init                         # EAS プロジェクトの作成
```

`eas-cli` は依存に含めていない（グローバル / 都度実行が Expo の想定のため）。
`npx eas-cli@latest` で都度実行するか、`npm i -g eas-cli` を入れる。

- `eas init` が発行する `projectId` を `app.config.ts` の `extra.eas.projectId` に入れる
  （プッシュ通知が参照する）
- ビルドプロファイルは `apps/mobile/eas.json`。develop / staging / production の
  どの環境を向くかは `EXPO_PUBLIC_API_BASE_URL` で切り替える

### 2-3. Firebase（Expo 側）

Expo は `NEXT_PUBLIC_*` ではなく `FIREBASE_*` を `app.config.ts` の `extra` 経由で読む。
`.env.<環境名>` に両方を入れること。ネイティブアプリを Firebase コンソールに登録し、
必要なら `google-services.json` / `GoogleService-Info.plist` を追加する。

### 2-4. プッシュ通知・ストア

- 送信側（`apps/functions/src/lib/push-notifications.ts`）は functions 層にある。
  受信側の権限要求とトークン登録は `apps/mobile/src/lib/push-notifications.ts`
- iOS は Apple Developer Program、Android は Google Play Console のアカウントが要る
- アプリ内課金を売るなら `/add-billing`（RevenueCat 側の設定が別途必要）

## 3. 確認

- [ ] `node scripts/check-layers.mjs` が通る
- [ ] `yarn workspace @geckou/mobile exec expo customize tsconfig.json` を実行した
- [ ] `yarn type-check` / `yarn lint` / `yarn test` が通る
- [ ] `yarn dev:mobile` で Expo が起動し、実機 / シミュレータで表示できる
- [ ] `app.config.ts` の識別子を自分のプロダクトのものに変えた
