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
- ブランチ名が命名規則（`feat/` `fix/` `refactor/` `chore/` `test/` `docs/` `release/` `hotfix/`）に合わない
- 分岐元が `production` でない（例外: `fix/*` は `release/*` からも可）

**`claude/*` の扱い。** Claude Code の Web / GitHub Action 等のハーネスは、セッション用の
ブランチを自分で作る。名前も分岐元もこちら側では決められないため、`claude/*` は命名と
ケバブケースの検査から外してある。ただし外れるのは**既に `claude/*` にいるセッションの中だけ**で、
分岐元も `production` かそのセッションブランチに限る。`production` にいるときの
`git checkout -b claude/Whatever feat/existing` は通らない（`claude/` を付けるだけで
命名・分岐元の検査を外せる、では意味がないため）。**`claude/*` を自分で切らないこと。**

次の操作は禁止ではないが、実行前にユーザーへの確認を求める（CLAUDE.md「自律性の境界」で
「その場で止めて聞く」に置いているもの）。

- `gh pr merge`（PR のマージ。マージの判断は人がする）
- ブランチの削除（`git branch -d/-D`、`git push --delete`、`git push origin :<branch>`、`git push --prune`）
- 作業ブランチへの force push（`production` / `release/*` へのものは禁止）
- タグの force push（リモートのタグを別のコミットへ動かす操作）
- `feat/*` 同士の取り込み（`merge` / `rebase` / `pull` / `cherry-pick`。自分のブランチを
  リモートから取り込むだけの `git pull origin <自分>` は対象外）

`--no-verify` は commit だけでなく push / merge / rebase でも禁止（husky の迂回になるため）。

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

### Hosting のターゲットは環境名に合わせる

既定は 1 環境 = 1 Firebase プロジェクトで、`firebase.json` の `hosting` も 1 つ。この構成では
`deploy.sh` は `firebase deploy --only hosting` を 1 回実行するだけで、以下は関係ない。

1 つの Firebase プロジェクトに複数のサイトを相乗りさせる場合（`.firebaserc` の `targets` に
サイトを並べ、`firebase.json` の `hosting` を配列にする構成）は、**ターゲット名を環境名
（`develop` / `staging` / `production`）に揃えること。** `deploy.sh` は環境名と一致する
ターゲットだけに配る。

```jsonc
// firebase.json
"hosting": [
  { "target": "staging", "source": "apps/web", "frameworksBackend": { "region": "asia-northeast1" } },
  { "target": "production", "source": "apps/web", "frameworksBackend": { "region": "asia-northeast1" } }
]
```

揃えないと**絞り込みができず、全ターゲットに配られる**。`yarn deploy:staging` が
staging の `.env` でビルドしたものを production のサイトにも出す、という壊れ方をする
（警告は出るが、止まりはしない）。環境名で分けられない構成（`web` / `admin` のような
役割での分割）では `DEPLOY_HOSTING_TARGETS` で配る先を明示する。

```bash
DEPLOY_HOSTING_TARGETS='web admin' yarn deploy:staging
```

判定は `scripts/lib/hosting-targets.mjs` にあり、`scripts/test-deploy-targets.sh` が回帰テストする。

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

- `FIREBASE_SERVICE_ACCOUNT` が未設定なら `deploy` ジョブはスキップされ、チェック（型・lint・テスト・ビルド）のみ実行される。判定に使うのは鍵そのものではなく `secrets.FIREBASE_SERVICE_ACCOUNT != ''` の真偽値で、鍵の値を参照する `env:` は「Authenticate to Firebase」ステップだけ（`yarn install` の postinstall や `yarn build` に鍵を渡さないため）。
- この鍵は staging / production で共通のため、本番の権限が `release/*` の push でも使われる。環境ごとに鍵を分けたい場合は GitHub Environment（production / staging）を作り、`deploy` ジョブに `environment:` を付けて Environment secret に置き換える。
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

内容: production の削除・force push 禁止、PR 必須（**承認は 0 件**）、Required status checks（`guard` / `ci / ci`）。
`hotfix/*` の緊急セルフマージを許す場合は、取り込み後に UI で bypass 設定を調整する。

⚠️ **承認を既定で 0 件にしている理由。** このテンプレートは「PR を出すのは AI、マージの判断は人」
（CLAUDE.md）というモデルで、**マージボタンを押す人間が既にゲートになっている**。ここを 1 件以上に
すると、もう 1 人の人間を要求することになり、レビュー担当が実質 1 人の構成では**自分の PR を自分で
承認できない**（GitHub の仕様）ため、出した PR が軒並みマージできなくなる。Template Sync や
Renovate の PR も同じ理由で毎週詰まる。

承認 0 件でも、**PR 必須（直接 push 禁止）と Required status checks は効く** — この ruleset の
主目的である「赤い PR をマージできなくする」は保たれる。複数人でレビューを回すプロジェクトは、
取り込み後に UI で 1 以上へ上げる（`hotfix/*` の bypass 設定と同じ扱い）。上げた場合は
`.claude/docs/dependencies.md`「Renovate の自動マージ」も併せて読むこと。

`release/*` / `hotfix/*` も同じ仕組みで塞ぐ:

```bash
gh api repos/{owner}/{repo}/rulesets \
  --method POST \
  --input .github/rulesets/release.json
```

内容: `release/**` と `hotfix/**` の更新を PR 必須にする（承認は 0 件。`fix/*` → `release/*` の
PR フローはそのまま動く）。**ブランチの作成は禁止していない**ので、`production` から切って
`feat/*` をマージした結果の初回 push は従来どおり通り、以降の直接 push だけが塞がれる。

⚠️ **`hotfix/*` も対象に含めている。** `hotfix/*` への push も staging への自動デプロイを
発火するため（`deploy.yml`）、理由は `release/*` と同じ。ただし緊急対応中に「作成 push のあと
もう 1 コミット直して push」ができなくなるので、hotfix を急ぐ運用なら取り込み後に
`bypass_actors`（リポジトリ管理者ロール）を UI で足しておく。`pre-git-guard.sh` は
`release/*` / `hotfix/*` どちらへの push でもユーザーに確認を求めるので、ローカル側の扱いは揃っている。

これを入れないと、「`release/*` への直接コミット・push は禁止」は `pre-git-guard.sh` の
承認確認だけで支えられていることになり、GitHub UI や他のクライアントからは素通りする。
`release/*` への push は staging デプロイを発火するため、未レビューの変更がそのまま
staging に載る経路になる。

`yarn setup`（`scripts/setup.sh`）もこの定義を取り込む。**保護の定義はこのファイルが正**で、
legacy の branch protection API とは二重管理にしない（required check 名が片方だけ古いと、
production への PR が存在しないチェックを待ち続けてマージできなくなる）。

⚠️ **required status check の名前は CI の呼び方で変わる。**

| CI の形 | 報告されるチェック名 |
|---|---|
| 参照形（`uses: geckou/project-starter/.github/workflows/ci.yml@v1`） | `ci / ci` |
| `ci.yml` が `pull_request` で直接動く（テンプレート本体・未移行の派生） | `ci` |

`setup.sh` は `ci.yml` の中身を見てこの名前を決めてから POST する。上の JSON に書いてあるのは
参照形の値なので、**手で `gh api` を叩くときは自分の構成に合わせて書き換えること。**

⚠️ **ruleset はリポジトリ外の状態**で、JSON を直しても既に取り込み済みのリポジトリには届かない。
CI を参照形へ移行したら（`scripts/adopt-references.mjs`）、GitHub 側の required check 名も
`ci / ci` へ更新する必要がある。

```bash
# 取り込み済みの ruleset を確認して、required_status_checks の context を直す
gh api repos/{owner}/{repo}/rulesets
gh api repos/{owner}/{repo}/rulesets/{id} --method PUT --input -
```

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
    branches: [production, 'release/**', 'hotfix/**']

jobs:
  ci:
    uses: geckou/project-starter/.github/workflows/ci.yml@v1
```

**呼ぶ側に `concurrency` を書かないこと。** reusable workflow の `concurrency` は
呼び出し元のコンテキストで評価されるため、呼ばれる側（テンプレートの `ci.yml`）が宣言している
`ci-${{ github.ref }}` と group 名が一致する。run が自分自身の group を奪い、**ジョブを 1 つも
起こさないまま数秒で failure** になる（jobs 0 件・ログもアノテーションも無い）。連続 push の
打ち切りは呼ばれる側が持っているので、書かなくても挙動は変わらない。

**既に参照方式へ移行済みの派生には、この修正が Template Sync では届かない。**
派生の `ci.yml` は派生側の `.templatesyncignore` に載っていて上書きされないため、
`node scripts/adopt-references.mjs --repo <派生のパス>` を流し直す必要がある
（冪等なので、他の設定が推奨形なら差分は `ci.yml` だけになる。`--force` は要らない）。

`hotfix/**` を落とさないこと。`.github/rulesets/release.json` は `hotfix/*` にも PR を
必須にしているので、トリガーから外すと**緊急対応のときだけ** type-check / lint / test が
走らない PR ができる（required check が無いので、そのままマージできてしまう）。

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
5. 第0層の設定（ESLint / Prettier / commitlint）を参照形にする（下記）
6. 残る手動作業（下記）を印字する

**既存の `ci.yml` を書き換えるのではなく生成する**のは、古いトリガーを引き継がないため。
`production` への push をトリガーに残すと、`deploy.yml` が同内容のチェックを実行するので
**check が二重に走る**。層構成は実ファイル（`apps/mobile/` の有無）で判定するので、
`layers.json` を持たない古い派生でも動く。冪等なので、途中まで手作業で移行済みでも流してよい。

#### 第0層の設定（`packages/*-config`）の参照化

ESLint / Prettier / commitlint も npm パッケージの参照に切り替える
（→ `packages/README.md`「第0層の設定は npm パッケージで配る」）。

- 各ワークスペースの `eslint.config.mjs` を生成する。プリセットは `package.json` の依存で
  決める（`next` → `/next`、`expo` → `/expo`、それ以外の TypeScript パッケージ → `.`）
- `.prettierrc.cjs` を生成し、**古い `.prettierrc` を削除する**。Prettier は `.prettierrc` を
  `.prettierrc.cjs` より先に読むため、両方あると参照が効かず古いコピーが黙って使われ続ける。
  `tailwindStylesheet` は既存の値を引き継ぐ
- `commitlint.config.cjs` を参照形にする
- `package.json` の依存を入れ替える（`@geckou/*-config` を足し、実体だった
  `eslint-config-next` / `typescript-eslint` / `prettier-plugin-tailwindcss` 等を外す）。
  `yarn.lock` が古くなるので、`yarn install` が残作業として印字される

**独自ルールを足している設定ファイルは書き換えない。** テンプレートの既知の形
（現行の参照形か、移行前に配っていた形）と一致しないものは差分を印字して人に渡す。
**そのとき、その設定が必要とする依存も消さない**（独自の `eslint.config.mjs` を残したまま
`typescript-eslint` を外すと lint が落ちる）。上書きしてよいと分かっているときだけ
`--force` を付ける。

スクリプトが**やらない**こと（人にしかできない・触るべきでない）:

- Renovate App のインストールと Silent mode の解除、Dependency graph / Dependabot alerts の
  有効化（→ `.claude/docs/dependencies.md`「派生プロジェクトでの前提」）
- Template Sync の設定
- ルート `package.json` の `resolutions`。派生ごとに値が違うため触らない
  （→ `.claude/docs/dependencies.md`「配れないもの」）。依存フィールドだけを書き換える
- `yarn install`（`yarn.lock` の更新）。依存を入れ替えたときだけ残作業として印字される

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

**互換性を壊す変更ではタグが進まない。** 見るのは `<今のメジャータグ>..HEAD`、つまり
**まだ昇格していないコミット全部**で、`push` で入った分だけではない。判定は
Conventional Commits の書式に限る（件名の `type!:` か、本文の**行頭**の
`BREAKING CHANGE:` / `BREAKING-CHANGE:` フッター）。本文中に語が現れるだけでは止まらない
（この仕組みを説明したコミットが自分で自分を止めてしまうため）。
「タグを進めない = 派生に配らない」という判断をこの仕組みで表現できる。

⚠️ **起動は `.github/workflows/**` の変更に絞られているのに、ゲートは範囲内の全コミットを
見る。** そのため `scripts/` だけを変えた `feat!:` が入っていると、その後にワークフローを
直しても昇格が止まり続け、修正が `v1` に届かない。破壊的変更を入れたら次のメジャータグを
切ること。

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

**古い派生プロジェクトからも呼べる。** `scripts/format.sh` やルールテストのスクリプトが
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

## Template Sync の有効化（派生プロジェクト）

親テンプレートの更新を週次で PR として取り込む（`.github/workflows/template-sync.yml`）。
ワークフローは同梱されているが、**認証情報を登録するまで動かない**。未登録のまま動かすと
CI が 1 つも走らない PR を作り続けることになるため、最初のステップで明示的に落としてある。

GitHub App と PAT のどちらでも動く。**App を推奨**する。

| | 同期 PR の作成者 | 紐づく先 | 期限 |
| --- | --- | --- | --- |
| GitHub App | bot | Organization | 秘密鍵に期限なし |
| PAT | トークンの持ち主 | 個人アカウント | あり（切れると毎週失敗に戻る） |

PAT だと、詰まる／詰まらない以前に次の3つが常時ついて回る。

- **レビュー承認を必須にすると噛み合わない。** 自分の PR は自分で承認できないため、
  `required_approving_review_count` を 1 以上へ上げた構成では毎週マージできない PR ができる
  （既定は 0 なので、上げていなければ詰まりはしない。→「マージルールの強制」）
- **同期 PR が来たことに気付けない。** GitHub は既定で自分の操作による通知を送らない
  （Settings > Notifications の "Include your own updates"）
- **帰属が嘘になる。** cron が取り込んだものが、人の判断として履歴に残る

### GitHub App を使う場合（推奨）

1. **App を作る** — Organization settings > Developer settings > GitHub Apps > New GitHub App
   - Repository permissions: **Contents: Read and write** / **Pull requests: Read and write**
   - **Webhook の Active のチェックを外す**（このワークフローは webhook を使わない）
   - 親テンプレートは public なので、読み取り用の追加権限は要らない
2. **Client ID を控え、Private key を生成する**（`.pem` がダウンロードされる）
3. **インストールする** — 作った App を Organization にインストールし、対象を派生リポジトリに絞る
4. **登録する** — Client ID は Variables、秘密鍵は Secrets（置き場所が違う）

   ```bash
   # 秘密鍵。改行ごと渡す必要があるので、貼り付けずにファイルから読ませる
   gh secret set TEMPLATE_SYNC_APP_PRIVATE_KEY < path/to/key.pem
   ```

   Client ID は Settings > Secrets and variables > Actions > **Variables** タブで
   `TEMPLATE_SYNC_APP_CLIENT_ID` として登録する（Secrets タブではない）。
5. **確認する** — Actions > Template Sync > Run workflow。差分があれば
   `chore: テンプレート更新の取り込み` の PR ができる。**作成者が bot になっていること**を見る

⚠️ **Variables / Secrets を Organization に置くと、全リポジトリに継承される。**
`TEMPLATE_SYNC_APP_CLIENT_ID` だけを先に Org へ置くと、まだ秘密鍵の無いリポジトリが
「App の設定が片方だけです」で落ちる（設定漏れを PAT で黙って隠さないための挙動）。
Org へ置くのは、App を全リポジトリへインストールしてからにする。

**つまずきやすいところ**: 秘密鍵の改行が落ちていると、トークン生成のステップだけが落ちる。
エラーメッセージからは鍵の問題だと読み取りにくいので、`gh secret set ... < file` の形で入れる。

### PAT を使う場合

App を作れないとき（Organization の owner 権限が無い、個人リポジトリで scaffold した等）の代替。

Settings > Developer settings > Personal access tokens > **Fine-grained tokens** で作る。
Repository access に対象リポジトリ、権限は **Contents: Read and write** と
**Pull requests: Read and write**（Metadata は自動で付く）。

```bash
gh secret set TEMPLATE_SYNC_TOKEN
```

期限が切れると毎週の実行が失敗に戻る。更新を促す仕組みは無いので、期限を長めに取るか
カレンダーに入れておく。App を作れるようになったら、Secrets を入れ替えるだけで移行できる
（ワークフローは App があればそちらを優先する）。

### なぜ `GITHUB_TOKEN` では駄目か

`GITHUB_TOKEN` が起こしたイベントは新しいワークフローを起動しない、という GitHub の仕様がある。
そのままだと同期 PR で ci / branch-guard / docs-check が一切走らず、required status check が
Expected のままマージできない PR になる。PR にワークフローを起こすために、外部のトークンが要る。

なお、取り込み元（親テンプレート）の**読み取り**は `github.token` で行う。親は public で足りるうえ、
App のインストールトークンは `owner` / `repositories` を指定しない限り自リポジトリにしか
スコープされないため、別リポジトリを読む経路には使えない。

## ブランチ名とコミットメッセージの補足

CLAUDE.md には規則そのものを置き、その理由と例外の扱いをここに書く。

`claude/*` の扱い（ハーネスが作るブランチで自分では切らない。検査の免除範囲）は
「作業ブランチの切り方 > 機械的な強制」を参照。

### `chore/` の使いどころ

依存更新・パッケージのバージョン上げ・設定変更など、**機能でもバグ修正でもない作業**に使う
（コミットの type `chore` に対応する。デプロイ先は無い）。

### コミットメッセージ規約を守る動機

commitlint（`.husky/commit-msg`）は検証するが、**規約違反は警告のみでコミットはブロックしない**。
派生プロジェクトでは `release/*` に何が載っているかを `git log` で追う場面が多いため、
type が揃っていること自体が可読性の担保になる。守る動機はそこにある。

ただし **Claude のコミットは `.claude/hooks/pre-git-guard.sh`（PreToolUse）が実行前に検証し、
規約外のメッセージはブロックする**。人を止めるほどの重みはないが、AI が規約を読み飛ばすのは
機械的に防げるため。

**PR タイトルも同じ規約に従う。** squash merge のコミットメッセージは PR タイトルから
作られるが、commitlint もフックもローカルのコミットしか見ない。
`.github/workflows/pr-title-lint.yml` が PR タイトルを同じ設定で検証する（必須チェックには
しない。赤で気付ければ十分）。可読性だけの話ではなく、`release-tag.yml` の破壊的変更ゲートが
squash コミットの件名を読むため、タイトルが崩れると互換性の判断が効かなくなる。
