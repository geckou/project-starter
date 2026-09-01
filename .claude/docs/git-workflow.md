# Git リリースフロー・マルチ環境

## リリースフロー

```bash
# 1. 機能開発
git fetch origin --prune            # 進行中の release/* を見落とさないため必須
git checkout production && git pull
git checkout -b feat/user-profile
git merge origin/release/1.0.0      # 進行中の release があり、それに載せる場合
# ... 開発・push → develop で動作確認 ...

# 2. リリース準備（出したい機能だけ選ぶ）
git checkout production
git checkout -b release/1.0.0
git merge feat/user-profile
git merge feat/posts
git push origin release/1.0.0  # → staging で QA（push = staging へ自動デプロイ）

# 2.5. QA で見つかった不具合の修正（release に直接コミットしない）
git checkout -b fix/login-error release/1.0.0
# ... 修正・push → develop で動作確認 ...
gh pr create --base release/1.0.0

# 3. リリース
gh pr create --base production
# QA OK → merge → production に自動デプロイ
git tag v1.0.0

# 4. バックマージ（release の修正を取り込む）
git checkout production && git pull
# 次の feat/* は最新の production から切る

# 5. 緊急修正
git checkout -b hotfix/1.0.1 production
# ... 修正 → staging で確認 → production に merge ...
```

## 作業ブランチの切り方

**`production` から切り、進行中の `release/*` があればそれをマージしてから作業する。**

```bash
git fetch origin --prune            # まず必ず実行する
git branch -r --list 'origin/release/*'   # 進行中のリリースを確認
git checkout production && git pull
git checkout -b feat/user-profile
git merge origin/release/1.0.0      # そのリリースに載せる場合のみ
```

### なぜ production から切るのか

**作業内容を必ずしも進行中のリリースに混ぜるとは限らないため。**
分岐元を `release/*` にするとそのリリース行きに固定され、「次のリリースに回す」
「単独で hotfix にする」といった選択ができなくなる。分岐元を `production` に
保っておけば、リリースへの取り込みは後から選べる。

### なぜ release をマージするのか

**`production` は前回リリース時点で止まっており、進行中の `release/*` より
数週間〜数ヶ月遅れていることが普通だから。**
`production` から切ったまま作業すると、
既にマージ済みの変更が存在しない古い土台の上で作業することになり、
リリースへ PR を出した段階で大量のコンフリクトになる。

進行中の release に**混ぜたくない**作業（次のリリース以降に回すもの）は、
マージせず `production` 起点のまま進める。この場合、対象リリースが決まった
時点でそのブランチをマージする。

### 機械的な強制

上記の手順は Hook で強制される（`.claude/hooks/pre-git-guard.sh`）。ブランチ作成コマンドは次の場合に実行前ブロックされる。

- 直近 15 分以内に fetch していない（= remote の情報が古い状態で切ろうとしている）
- ブランチ名が命名規則（`feat/` `fix/` `refactor/` `test/` `docs/` `release/` `hotfix/`）に合わない
- 分岐元が `production` でない（例外: `fix/*` は `release/*` からも可）

セッション開始時には `.claude/hooks/session-start-git-context.sh` が自動で fetch し、進行中の `release/*` を文脈に載せる。

> ⚠️ **作業開始前に必ず `git fetch origin --prune` を実行すること。**
> `git branch -a` はローカルが持っている参照しか表示しない。fetch していないと
> 進行中の `release/*` が見えず、「production しか無い」と誤認して
> 何ヶ月も古い土台の上で作業を始めてしまう。
> **`production` が最新とは限らない。**

## マルチ環境（develop / staging / production）

Firebase プロジェクトを3つ作成し、環境ごとに使い分ける。
**環境とブランチは 1対1 ではない。**ブランチの種類に応じてデプロイ先が決まる。

### 環境

| 環境         | Firebase プロジェクト     | 用途                   |
| ------------ | ------------------------- | ---------------------- |
| `develop`    | `your-project-develop`    | 開発中の動作確認       |
| `staging`    | `your-project-staging`    | リリース前 QA          |
| `production` | `your-project-production` | 本番                   |

### ブランチ運用

| ブランチ      | デプロイ先   | 切る元         | 用途                     |
| ------------- | ------------ | -------------- | ------------------------ |
| `feat/*`      | develop（手動）| `production`   | 機能開発                 |
| `release/*`   | staging      | `production`   | リリース候補の QA        |
| `hotfix/*`    | staging      | `production`   | 緊急修正                 |
| `production`  | production   | -              | 本番（デフォルトブランチ）|

**上表のブランチ（`feat/*` / `release/*` / `hotfix/*`）は `production` から切る**（`develop` / `staging` はブランチではなく環境名）。
切った直後に、進行中の `release/*` があればマージして作業を始める（→「作業ブランチの切り方」）。
例外は QA で見つかった不具合の修正で、対象の `release/*` から `fix/*` を切る（→「リリースフロー」2.5）。

> ⚠️ **`release/*` / `hotfix/*` への push は staging への自動デプロイを発火する**（`.github/workflows/deploy.yml`）。
> そのため `release/*` への直接コミット・push は禁止。release に直接コミットすると、develop での動作確認を経ずに staging へ直行してしまう。
> QA で見つかった修正も `fix/*` / `feat/*` を切って develop で確認し、`release/*` へ PR でマージする。
> `release/*` へ push してよいのは、ブランチ作成時（`production` から切って `feat/*` をマージした結果）と PR マージのみ。

### 開発〜リリースの流れ

```
production（常にクリーン）
 │
 ├── feat/auth ──→ push → yarn deploy:develop で動作確認
 ├── feat/posts ──→ push → yarn deploy:develop で動作確認
 │
 ├── release/1.0.0 ←── feat/auth + feat/posts を merge
 │       │
 │       └──→ push → staging に自動デプロイ → QA テスト
 │       └──→ QA OK → production に PR → merge → 本番デプロイ + tag
 │
 └── hotfix/1.0.1 ──→ staging で確認 → production に merge
```

### 環境の切り替え（ローカル開発）

```bash
yarn env:develop      # .env.develop → .env.local にコピー + firebase use develop
yarn env:staging      # .env.staging → .env.local にコピー + firebase use staging
yarn env:production   # .env.production → .env.local にコピー + firebase use production
```

### 手動デプロイ

```bash
yarn deploy:develop
yarn deploy:staging
yarn deploy:production
```

CI/CD: `.github/workflows/deploy.yml` が `release/*` / `hotfix/*`（→ staging）と `production` の push で自動デプロイ。
develop は自動デプロイ対象外（複数人の feat/* push が互いに上書きし合うため）。各自 `yarn deploy:develop` で手動デプロイする。

### CI 用 GitHub Secrets の登録

`deploy.yml` はデプロイ時に環境別の env をシークレットから `.env.<環境名>` に書き出す（`secrets[format('ENV_FILE_{0}', name)]`）。
シークレット未登録のまま push すると env が空のままビルドされ失敗するため、事前に登録する。

| Secret 名 | 中身 | 参照されるブランチ |
| --- | --- | --- |
| `ENV_FILE_STAGING` | `.env.staging` の全文 | `release/*` / `hotfix/*`（staging 環境）|
| `ENV_FILE_PRODUCTION` | `.env.production` の全文 | `production`（本番）|
| `FIREBASE_SERVICE_ACCOUNT` | サービスアカウント鍵 JSON の全文 | 全環境共通 |

develop 用のシークレットは不要（CI からデプロイしないため）。

```bash
# 環境別 env の全文をそのまま登録（ローカルにファイルがある前提）
gh secret set ENV_FILE_STAGING < .env.staging
gh secret set ENV_FILE_PRODUCTION < .env.production

# サービスアカウント鍵を登録
# （Firebase Console > プロジェクトの設定 > サービスアカウント > 新しい秘密鍵の生成）
gh secret set FIREBASE_SERVICE_ACCOUNT < service-account.json
```

- `FIREBASE_SERVICE_ACCOUNT` が未設定なら `deploy` ジョブはスキップされ、チェック（型・lint・テスト・ビルド）のみ実行される。
- `firebase login:ci` の `FIREBASE_TOKEN` は firebase-tools v13 以降非推奨のため使わない。
- env ファイルを更新したら、対応する `ENV_FILE_*` シークレットも登録し直す。

### GCP API の初回有効化

新規 Firebase プロジェクトでは以下の GCP API がデフォルトで無効。初回デプロイ前に有効化が必要:

```bash
gcloud services enable cloudfunctions.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  run.googleapis.com \
  eventarc.googleapis.com \
  --project=your-project-id
```

| API | 用途 |
|---|---|
| Cloud Functions API | Cloud Functions のデプロイ |
| Cloud Build API | Functions / Hosting のビルド |
| Artifact Registry API | ビルド成果物の保存 |
| Cloud Run API | Functions (v2) の実行基盤 |
| Eventarc API | Functions (v2) のイベントトリガー |

自動有効化される場合もあるが反映に時間がかかるため、事前に有効化しておくのが確実。
[Google Cloud Console](https://console.cloud.google.com/apis/library) からも有効化可能。

## マージルールの強制（プラン別）

マージルール（production へは release/* と hotfix/* のみ等）の機械的な強制は、GitHub の契約プランによってできることが変わる。

### 全プラン共通（同梱済み）

`.github/workflows/branch-guard.yml` が production 向け PR の head ブランチを検証し、`release/*`・`hotfix/*` 以外なら CI を赤にする。

> **注意**: Free プランのプライベートリポジトリでは Required status checks が使えないため、これは「赤い ✗ による可視化」であり物理的なマージブロックではない。ただし本テンプレートではマージ操作の主体がかなりの割合で AI（Claude）であり、AI は「CI が赤の PR はマージしない」を守るため実効性は高い。

### 対応プラン（Pro / Team / Enterprise、またはパブリックリポジトリ）

Rulesets で強制できる。同梱の定義を取り込む:

```bash
gh api repos/{owner}/{repo}/rulesets \
  --method POST \
  --input .github/rulesets/production.json
```

内容: production の削除・force push 禁止、PR 必須（レビュー1件）、Required status checks（`ci` / `guard`）。
`hotfix/*` の緊急セルフマージを許す場合は、取り込み後に UI で bypass 設定を調整する。

### Free プランのプライベートリポジトリの場合

マージ操作の強制はできない。branch-guard の可視化と運用規律（CLAUDE.md のマージルール）に依存することを、チームで共有しておく。

## CI の配布（reusable workflow）

`.github/workflows/ci.yml` は **reusable workflow**（`on: workflow_call`）として書いてある。
派生プロジェクトは中身をコピーせず、参照 1 行だけを持つ。

```yaml
# 派生プロジェクトの .github/workflows/ci.yml
name: CI

on:
  pull_request:
    branches: [production, 'release/**']
    paths-ignore:
      - '**/*.md'
      - '.claude/docs/**'
      - '.claude/skills/**'
      - '.vscode/**'
      - 'LICENSE'

jobs:
  ci:
    uses: geckou/project-starter/.github/workflows/ci.yml@v1
```

**チェック内容の修正が、各派生での取り込み作業ゼロで行き渡る。** ルールテストの追加や
`firebase-tools` のバージョン固定のような修正は、テンプレート側の 1 コミットで全派生に効く。
Template Sync のファイルコピーと違い、コンフリクトも発生しない。

### 切り替え手順（派生プロジェクト側）

既存の派生プロジェクトの切り替えは **`scripts/adopt-references.mjs`** が行う。

```bash
node scripts/adopt-references.mjs --repo <派生プロジェクトのパス> --dry-run
node scripts/adopt-references.mjs --repo <派生プロジェクトのパス>
```

スクリプトがやること:

1. `.github/workflows/ci.yml` を上の推奨形で**生成する**
2. `.templatesyncignore` に `.github/workflows/ci.yml` を追加する
   （テンプレート側の実体で上書きされないようにするため）
3. `renovate.json5` を生成する（`apps/mobile` があれば `//renovate/mobile` も `extends`）
4. テンプレートとの設定差分を埋める（`.prettierignore` の生成ファイル除外）
5. 残る手動作業（下記）を印字する

**既存の `ci.yml` を書き換えるのではなく生成する**のは、古いトリガーを引き継がないため。
`production` への push をトリガーに残すと、`deploy.yml` が同内容のチェックを実行するので
**check が二重に走る**。層構成は実ファイル（`apps/mobile/` の有無）で判定するので、
`layers.json` を持たない古い派生でも動く。冪等なので、途中まで手作業で移行済みでも流してよい。

スクリプトが**やらない**こと（人にしかできない・触るべきでない）:

- **Required status check の名前を `ci / ci` に変える。** reusable workflow を呼ぶと
  チェック名が `<呼び出し側のジョブ ID> / <呼ばれる側のジョブ ID>` になる。
  `.github/rulesets/production.json` を取り込んでいる場合、`{ "context": "ci" }` のままだと
  **出力されないチェックを待ち続けてマージできなくなる**
- Renovate App のインストールと Silent mode の解除、Dependency graph / Dependabot alerts の
  有効化（→ `.claude/docs/dependencies.md`「派生プロジェクトでの前提」）
- Template Sync の設定
- ルート `package.json` の `resolutions`。派生ごとに値が違うため触らない
  （→ `.claude/docs/dependencies.md`「配れないもの」）

新規プロジェクトはこの手順を `/init-project` に含めてある。

### 依存更新（Renovate）の PR は branch-guard の例外

`renovate/*` から `production` への PR は `branch-guard.yml` が許可する。依存更新は
プロダクトの機能変更ではなく、リリース単位に束ねる意味が薄いため。

ただし **`production` へのマージは本番デプロイを発火する**ので、マージのタイミングは人が選ぶ
（自動マージは既定で無効。`.claude/docs/dependencies.md` 参照）。

### バージョンの進み方

`@v1` は `.github/workflows/release-tag.yml` が `production` の先頭へ進める浮動タグ。
**`.github/workflows/` が変わったときだけ**動く（このタグで配られるのはワークフローだけのため。
下の「配られるのはワークフローだけ」を参照）。

**互換性を壊す変更ではタグが進まない。** push で入ったコミットのいずれかに `BREAKING CHANGE`
または `type!:` が含まれていると昇格を止め、警告を出す。「タグを進めない = 派生に配らない」
という判断をこの仕組みで表現できる。

進めるのは **今あるメジャータグのうち最大のもの**。破壊的変更を入れたら `v2` を手で切る
（`git tag v2 && git push origin v2`）。以後の昇格は `v2` に移り、`v1` は破壊的変更の手前で
止まったまま残るので、参照を更新していない派生プロジェクトは壊れない。

### 配られるのはワークフローだけ（スクリプトは呼び出し元のもの）

reusable workflow の `actions/checkout` は**呼び出し元のリポジトリ**をチェックアウトする。
つまり `bash scripts/test-hooks.sh` のようなステップが実行するのは、**派生プロジェクト側の
`scripts/`**（Template Sync で配られたもの）であって、`@v1` が指すテンプレートのものではない。

- `release-tag.yml` が `v1` を進める対象を `.github/workflows/**` に限っているのはこのため
- 新しいスクリプトに依存するワークフローの変更は、**スクリプトの同期が先**になる。
  `ci.yml` はスクリプトが無くても落ちないよう `hashFiles` で存在を見てから実行する

### 層構成の違いは実行時に判定する

呼び出し元の層構成は、`ci.yml` が実ファイルを見て判定する。`layers.json` を持たない
派生プロジェクトでも正しく動き、1 つのワークフローがどの構成からでも呼べる。

| 判定 | 見るもの |
| --- | --- |
| Expo の型生成 | `apps/mobile/` の有無（ワークスペース名も `package.json` から読む） |
| ルールテスト | `tests/*rules*.test.ts` の有無（`firestore.rules` があってもテストが無ければ走らせない） |
| Hook Test / Layer Check | 対応するスクリプトの有無（`hashFiles`） |

**古い派生プロジェクトからも呼べる。** `scripts/format.sh` や `scripts/test-rules.sh` が
まだ Template Sync で届いていない構成では、`yarn format:check` / `yarn test:rules` に
フォールバックする（スクリプトは呼び出し元のものが実行されるため、届いていないことがある）。

### 対象外

`deploy.yml` は派生ごとにシークレットとデプロイ対象が違うため、reusable にせずファイル同期のまま残す。
`branch-guard.yml` / `template-sync.yml` も同様（リポジトリ固有の設定に依存する）。

## PR タイトルの検証

`.github/workflows/pr-title-lint.yml` が PR タイトルを commitlint の設定
（`commitlint.config.cjs`）で検証する。**squash merge のコミットメッセージは PR タイトルから
作られる**が、commitlint（`.husky/commit-msg`）も `pre-git-guard.sh` もローカルのコミットしか
見ないため、ここだけ検証が抜けていた。

可読性だけの問題ではない。`release-tag.yml` の破壊的変更ゲートは squash コミットの件名
（`type!:`）と本文のフッターを読んで `v1` を進めるかどうかを決めるので、**タイトルが規約から
外れると互換性の判断が効かなくなる**。

**必須チェックにはしない。** 「規約違反は警告のみでコミットをブロックしない」という方針
（CLAUDE.md）に揃え、マージするかどうかは人が決める。`.github/rulesets/production.json` の
required status checks にも入れていない。

これも reusable workflow として参照できる。

```yaml
jobs:
  pr-title:
    uses: geckou/project-starter/.github/workflows/pr-title-lint.yml@v1
```

## Copilot の自動レビュー

PR ごとに手でレビューを依頼しなくて済むよう、**Copilot code review を ruleset で常時 ON にする**。
定義は `.github/rulesets/copilot-review.json`。取り込みは production の保護と同じ手順:

```bash
gh api repos/{owner}/{repo}/rulesets \
  --method POST \
  --input .github/rulesets/copilot-review.json
```

`production.json` と分けているのは、対象が違うため。マージ保護は `production` 向けの PR だけを
守ればよいが、レビューは `feat/* → release/*` を含む**全ての PR**に欲しい
（`ref_name.include` が `~ALL` なのはそのため。ここで指す「全ブランチ」は PR の**マージ先**）。
`production.json` は Pro 以上のプランでないと効かないが、こちらは Copilot 側の要件だけで動くので、
片方だけ取り込む構成にもできる。

パラメータの既定値と、変えたくなる場面:

| パラメータ | 既定 | 意味 |
| --- | --- | --- |
| `review_on_push` | `false` | PR を開いたときだけレビューする。`true` にすると push のたびに走る（差分が細かいうちに気付けるが、コメントとコストは増える） |
| `review_draft_pull_requests` | `false` | Draft のうちはレビューしない。`true` にすると人にレビューを頼む前に机上のミスを拾える |

レビューの観点と言語は `.github/copilot-instructions.md` が決める。Copilot code review が
使えるプラン・組織設定でない場合は取り込みが失敗する（その場合は `.github/workflows/claude.yml`
の auto-review だけで運用する。両方入れて二重にレビューさせてもよい）。
