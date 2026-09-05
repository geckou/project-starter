---
name: add-firebase
description: firebase 層（Auth + Firestore + Storage + ルール + エミュレーター + Admin SDK）をプロジェクトに足す
---

# add-firebase

`core`（LP が作れる最小構成）に **firebase 層**を足す。
層の考え方と全体像は `.claude/docs/layers.md` を参照。

配線のうち機械的な部分はスクリプトが行い、**このスキルは判断が要る部分を案内する**。

## 1. 配線する（スクリプト）

```bash
node scripts/add-layer.mjs firebase --dry-run   # 何が入るか先に見る
node scripts/add-layer.mjs firebase
yarn install
yarn format
```

層の実体は `layers.json` の `source`（テンプレートのリポジトリ）から取り寄せる。
テンプレートのチェックアウトが手元にあるなら `--from <パス>` を渡すと clone を省ける。

スクリプトが入れるもの:

| 区分 | 中身 |
| --- | --- |
| ファイル | `apps/web/src/lib/firebase-app.ts` / `firebase.ts`（Auth）/ `firebase-firestore.ts` / `firebase-storage.ts` / `firebase-admin.ts`、`app/{login,dashboard}/`、`app/api/session/`、`components/auth/`、`packages/shared/src/{firebase,firestore,storage,stores}/` |
| ルール | `firestore.rules` / `storage.rules` / `firestore.indexes.json` / `tests/`（ルールテスト）/ `scripts/test-rules.sh` |
| 依存 | `firebase` / `firebase-admin` / `@geckou/firebase-client` / `zustand` |
| 設定 | `firebase.json` の `firestore` / `storage` / エミュレーター、`middleware.ts` のセッション Cookie 判定、`deploy.yml` のルール・インデックスのデプロイ |
| env | `.env.example` の `NEXT_PUBLIC_FIREBASE_*` / `FIREBASE_SERVICE_ACCOUNT_KEY` 等 |

**ローカルの変更は 3-way マージで保たれる。** 衝突したファイルは実行結果に列挙されるので、
マージマーカーを解消すること。

## 2. 判断が要る部分（ここから先が人の仕事）

### 2-1. Firebase プロジェクト側の設定

- Firebase コンソールで **Authentication** を有効化し、使うサインイン方法（メール / Google 等）を選ぶ
- **Firestore** を作成する（ロケーションは後から変えられない。`asia-northeast1` 等を選ぶ）
- **Storage** を使うなら有効化する。使わないなら `firebase.json` の `storage` と
  `storage.rules` を消し、`layers.json` の firebase 層からも該当項目を外す
- 3環境（develop / staging / production）を分けているなら、それぞれで同じ設定を行う

### 2-2. 環境変数

`.env.<環境名>` に以下を入れる（`.env.example` のコメントに取得場所を書いてある）。

- `NEXT_PUBLIC_FIREBASE_*` — コンソール > プロジェクトの設定 > 全般 > ウェブアプリ
- `FIREBASE_SERVICE_ACCOUNT_KEY` — サービスアカウントの秘密鍵（1行の JSON 文字列）
- ローカルでエミュレーターを使うなら `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true`

入れ終わったら `yarn env:develop` で配布する。

### 2-3. セキュリティルール

`firestore.rules` / `storage.rules` はテンプレートの雛形が入る。**そのままでは本番に出せない。**
プロダクトのデータモデルに合わせて書き換え、`yarn test:rules` で許可 / 拒否の両方を検証する
（テスト方針の必須項目）。

### 2-4. 認証まわりの方針

- `middleware.ts` の `PROTECTED_PATHS` に、認証が必要なパスを列挙する
- セッション Cookie の実検証は各保護ページのサーバーコンポーネントで行う
  （Edge runtime では firebase-admin が使えないため）。詳細は `.claude/docs/architecture.md`

## 3. 確認

- [ ] `node scripts/check-layers.mjs` が通る
- [ ] `yarn type-check` / `yarn lint` / `yarn test` が通る
- [ ] `yarn test:rules` が通る（許可 / 拒否の両方のケースがある）
- [ ] `yarn build` が通る
- [ ] `yarn dev:web` で `/login` からサインインでき、`/dashboard` が表示される
