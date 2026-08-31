---
name: add-functions
description: functions 層（apps/functions。API・トリガー・スケジュール実行の器）をプロジェクトに足す
---

# add-functions

**functions 層**を足す。API・Firestore / Auth トリガー・スケジュール実行のいずれかが
必要になった時点で足す層。層の考え方は `.claude/docs/layers.md` を参照。

> API の置き場所は全構成で `apps/functions` に統一する（`.claude/docs/architecture.md`）。
> 「Route Handler で代用する」は選ばない。後から Mobile を足すときに移植が必要になり、
> `/new-function` も使えなくなるため。

## 1. 配線する（スクリプト）

```bash
node scripts/add-layer.mjs functions --dry-run
node scripts/add-layer.mjs functions
yarn install
yarn format
```

前提の firebase 層が無ければ、`layers.json` の `requires` を遡って一緒に足される
（その場合は `/add-firebase` の「判断が要る部分」も実施すること）。

スクリプトが入れるもの:

| 区分 | 中身 |
| --- | --- |
| ファイル | `apps/functions/` 一式（`api.ts` / `index.ts` / `lib/{auth-middleware,push-notifications,sentry}.ts` / テスト）、`apps/web/src/lib/api-client.ts` |
| 依存 | `firebase-functions` / `express` / `cors` / `@geckou/firebase-server` |
| 設定 | `firebase.json` の `functions` とエミュレーター、deploy のターゲット判定、lint-staged |
| env | `ALLOWED_ORIGINS` / `NEXT_PUBLIC_API_BASE_URL` / `SENTRY_DSN` |

## 2. 判断が要る部分

### 2-1. リージョンとデプロイ先

- `apps/functions/src/api.ts` の `onRequest({ region: ... })` は hosting と揃える
  （既定は `asia-northeast1`）。変えるならデプロイ先の URL も変わる
- Blaze プランは core の時点で必須（hosting の SSR が Cloud Functions を使うため）。
  この層を足しても課金プランは変わらない

### 2-2. 環境変数

- `ALLOWED_ORIGINS` — CORS で許可するオリジン。**本番では必ず設定する**（未設定は全許可＝開発用）
- `NEXT_PUBLIC_API_BASE_URL` — Web から API を呼ぶベース URL。環境ごとに変わる
- 新しい環境変数を Functions に足したら `scripts/use-env.sh` の `FUNCTIONS_ENV_KEYS` にも追記する
  （ここに無いキーは `apps/functions/.env` へ配布されない）

### 2-3. 何を Functions に置くか

| 用途 | 置き場所 |
| --- | --- |
| クライアントから呼ぶ API | `apps/functions/src/api.ts` に Express のルートを追加（`/new-function`） |
| Firestore / Auth のトリガー | `apps/functions/src/triggers.ts` を作り `index.ts` から export |
| スケジュール実行 | `apps/functions/src/scheduled.ts` を作り `index.ts` から export |

認証が要るルートは `requireAuth` を挟む（`lib/auth-middleware.ts`）。
API を足したら**正常系 + 認証エラーの最低2ケース**のテストを書く（テスト方針の必須項目）。

## 3. 確認

- [ ] `node scripts/check-layers.mjs` が通る
- [ ] `yarn type-check` / `yarn lint` / `yarn test` が通る
- [ ] `yarn build:functions` が通る（esbuild のバンドルが壊れていない）
- [ ] `yarn dev:functions` でエミュレーターが起動し、`/health` が 200 を返す
- [ ] `bash scripts/deploy.sh develop --only functions` でデプロイできる
