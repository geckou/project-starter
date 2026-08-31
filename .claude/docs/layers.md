# 層構成と層マニフェスト

このテンプレートは**全部入りではなく、core + opt-in 層**として構成する。
何を同梱するかの定義は `layers.json`（層マニフェスト）が持ち、
`scripts/remove-layer.mjs`（減算）と `scripts/check-layers.mjs`（検証）がそれを実行する。

## 層

```
第0層（制約層）   .claude/, memory/, 規約設定 — 全層に直交
core              LP が作れる最小構成（Next.js + Hosting + CI/deploy + 環境切替）
 └ firebase       Auth + Firestore + Storage + rules + emulator + Admin SDK
      └ functions apps/functions（API・トリガー・スケジュール実行の器）
           ├ mobile   Expo（iOS / Android）
           └ billing  Stripe / RevenueCat の配線
```

- **第0層は層に直交する**。`.claude/hooks/` とプロセス系スキル、commitlint・ESLint の共通ルール・
  Prettier は規約に従属し、スタックには従属しない。どの層構成でも同じものを使う
- **依存は一直線**。firebase を外すと functions / mobile / billing も外れる
- **opt-in は「めったに使わない」の意味ではない**。API・トリガー・スケジュールのどれかが要る案件は
  functions 層を持つ。外せるのは LP と「認証 + Firestore をクライアント SDK 直で使うだけ」の構成

各層に何が属するか（ファイル・依存・設定・環境変数）は `layers.json` が正。
このドキュメントは読み方と使い方だけを書く。

## 層を外す（減算）

```bash
node scripts/remove-layer.mjs mobile          # Expo だけ外す
node scripts/remove-layer.mjs billing         # 課金だけ外す
node scripts/remove-layer.mjs firebase        # core 構成にする（配下も連鎖して外れる）
node scripts/remove-layer.mjs --dry-run mobile          # 変更内容だけ表示する
node scripts/remove-layer.mjs --target /tmp/x mobile    # 別のディレクトリに対して実行する
```

外すと以下がまとめて消える。

| 対象 | 例 |
| --- | --- |
| ファイル・ディレクトリ | `apps/mobile/`、`firestore.rules` |
| マーカーで囲まれた範囲 | `middleware.ts` のセッション Cookie 判定、CI の Expo ステップ |
| 依存・スクリプト | `apps/web` の `firebase`、ルートの `dev:mobile` |
| 設定のキー | `firebase.json` の `functions`、`workspaces.nohoist` |
| 環境変数 | `.env.example` の該当セクション |
| マニフェスト自身 | `layers.json` から外した層の定義と、残った層の実在しなくなった項目 |

実行後は `yarn.lock` が実態と合わなくなるため、`yarn install`（`--frozen-lockfile` なし）で作り直し、
`yarn format` で整形する（範囲を削った跡の空行と、書き換えた JSON の体裁を Prettier に揃えるため）。

**残った層の定義も刈り込まれる。** 層の交点があるため（billing の RevenueCat 関連は
`apps/mobile/` 側にある）、外した層の定義を消すだけでは残った層が実在しないファイルを指したままになる。
減算は検証と同じ判定で、実在しなくなった項目を残りの層からも落とす。

**加算（`/add-*`）より減算を先に作っている**のは、全部入りが動いている現在の状態を
「既知の正解」として層の境界を検証できるため。加算の検証には比較対象が必要で、
それを供給するのが減算で作った構成になる。

## マーカー

1つのファイルに複数の層の内容が混ざる場合（`middleware.ts`・`.env.example`・CI 等）は、
コメントで範囲を囲む。

```ts
// layer:firebase:start
import { AuthProvider } from '@/components/auth/AuthProvider'
// layer:firebase:end
```

- コメント記号は言語に合わせる（`//` `#` `<!-- -->`）
- `layer:billing,mobile:start` のように複数列挙すると、**いずれかの層が外れたときに消える**
  （層の交点。RevenueCat 関連がこれにあたる）
- 範囲の入れ子は可（`functions` の中に `billing` 等）
- 削除で前後に空行が重なる場合は、継ぎ目の1行だけが自動で詰められる

範囲を消すのではなく**別の内容に置き換えたい**場合はマーカーではなく `layers.json` の
`replace`（`find` / `with` の完全一致置換）を使う。`layout.tsx` の
`<AuthProvider>{children}</AuthProvider>` → `{children}` がその例。

## マニフェストの書き方

`layers.json` の1層は次の要素を持つ。

| キー | 内容 |
| --- | --- |
| `requires` | 前提になる層（`core` は `null`） |
| `removable` | `false` なら外せない（core のみ） |
| `files` | 層と一緒に消えるファイル・ディレクトリ |
| `blocks` | その層のマーカーを含むファイル（検証用の一覧） |
| `deps` | `<package.json のパス>: [依存名]` |
| `scripts` | `<package.json のパス>: [スクリプト名]` |
| `json` | `<ファイル>: [[キー, キー…]]`（キー列で指す。`exports./billing` のようにドットを含むキーがあるため配列） |
| `replace` | `{ file, find, with }` の完全一致置換 |
| `env` | その層の環境変数（`.env.example` の該当マーカー内にあること） |
| `notes` | 判断の理由。なぜその層に属するかを書く |

**層マニフェストはリポジトリの中身の関数**である。共有実装を npm パッケージへ切り出すほど
層の境界は痩せて安定する（`@geckou/billing` を切り出した結果、billing 層は配線 2 ファイルと
依存 1 行まで縮んだ）。ファイルを足す・動かすときは `layers.json` も合わせて更新すること。

## 検証

```bash
node scripts/check-layers.mjs   # マニフェストと実態の一致（CI で実行）
bash scripts/test-layers.sh     # 減算スクリプトの回帰テスト（CI で実行）
```

さらに `.github/workflows/layer-matrix.yml` が、減算で作った 6 構成
（`core` / `+firebase` / `+functions` / `+functions+billing` / `+functions+mobile` / 全部入り）を
それぞれインストールして型チェック・Lint・テスト・ビルドまで通す。
層の仕組みに触る PR と手動実行（workflow_dispatch）で回る。

`check-layers.mjs` は `files` の実在、マーカーの対応と `blocks` との一致、`deps` / `scripts` /
`json` / `replace` / `env` の実在を検査する。どちらも node_modules に依存しないので
`yarn install` なしで走る。

`layers.json` が無いプロジェクトでは検査をスキップする（層の構成をやめた派生プロジェクト向け）。

## 派生プロジェクトでの扱い

- `layers.json` は `.templatesyncignore` に登録してある。層構成は派生プロジェクトごとに違うため、
  テンプレート更新で上書きしない
- 逆に `scripts/remove-layer.mjs` / `scripts/check-layers.mjs` は同期対象。マニフェストの形式を
  変えるときは、古いマニフェストでも動くか（キーが無くても既定値で動くか）に注意する
- 層の構成を持たないプロジェクトは `layers.json` を削除してよい。検証はスキップされる

## 残っている作業

- `/add-firebase` `/add-functions` `/add-mobile` `/add-billing`（加算）。機械的な部分は
  減算と対になるスクリプト、判断が要る部分（Stripe のアカウント作成、price ID の発行、
  権利変化フックの中身）がスキルの担当
- 6 構成のマトリクスを GitHub Actions 上で実際に回して緑を確認する（ローカルでは 6 構成とも
  型チェック・Lint・テスト・ビルドが通っている）。**これが CI で緑になるまで、
  分割版は派生プロジェクトへ配らない**
