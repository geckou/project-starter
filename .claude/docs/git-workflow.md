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

環境は `develop` / `staging` / `production` の3つ。**環境とブランチは 1対1 ではない。**
ブランチの種類に応じてデプロイ先が決まる。

### Firebase プロジェクトの持ち方は2通りある

環境をどう Firebase プロジェクトへ割り当てるかは、**プロジェクトの規模で選ぶ**。
どちらも `.firebaserc` の `projects` で表す（`yarn setup` が対話で聞く）。

| | **A: 環境ごとにプロジェクトを分ける** | **B: 1 プロジェクトに相乗りさせる** |
| --- | --- | --- |
| Firebase プロジェクト | 3つ | 1つ |
| Hosting | プロジェクトごとに 1 サイト | **環境ごとにサイトを分ける必要がある**（手動設定。分けないと環境を配り分けられない）|
| 本番データ・本番ユーザー | 触れない | develop / staging から**触れる** |
| Auth のユーザープール | 環境ごとに分断（本番と同じアカウントで開発時の確認ができない）| 共通 |
| Functions / Firestore ルール | 環境ごとに検証できる | **環境で分けられない**（全環境で同じもの）|
| モバイルの `GoogleService-Info.plist` / `google-services.json` | 環境ごとに必要（Expo の設定と配信構成も分岐する）| 1セット |
| サービスアカウント発行と IAM 付与（→「先にサービスアカウントへ IAM ロールを付与する」）| プロジェクトごとに繰り返す | 1回 |
| Blaze の課金先・予算アラート・GCP API 有効化 | 3つ | 1つ |
| Firestore のデータ投入・インデックス作成 | 環境ごと | 1回 |

**A が既定**（`.firebaserc` のプレースホルダも A）。本番データを壊しうる操作を仕組みで
遮断できるため、本番に実ユーザーのデータが乗るなら A を選ぶ。**B は、その遮断を
「Functions / Firestore を環境で検証できない」というトレードオフと引き換えに手放す代わりに、
上表の右列ぶんの初期構築・維持コストを 1/3 にする。** LP・社内ツール・PoC のように
関数とルールがほとんど動かないものでは、A のコストが機能開発より重くなることがある。

```jsonc
// A: 環境ごとにプロジェクトを分ける（既定）
"projects": { "default": "myapp-develop", "develop": "myapp-develop", "staging": "myapp-staging", "production": "myapp-production" }

// B: 1 プロジェクトに相乗りさせる（Hosting サイトで分ける。→「Hosting のターゲットは環境名に合わせる」）
"projects": { "default": "myapp", "develop": "myapp", "staging": "myapp", "production": "myapp" }
```

> ⚠️ **B では `functions` / `firestore` / `storage` が環境で分かれない。** `deploy.sh` は
> `.firebaserc` を読んでこれを検出し、**同じプロジェクトを共有する環境のうち最も本番側の
> 1つ（通常は `production`）以外では、この3つを既定のデプロイ対象から外す**
> （→「デプロイ対象は `.firebaserc` の構成から決まる」）。`yarn deploy:develop` が
> 本番の関数とルールを上書きしないのは、この絞り込みのおかげ。**外した対象は
> `--only` で明示すれば配れる**ので、遮断ではなく「既定を安全側に倒す」だけ。

> ⚠️ **B では Hosting サイトを環境ごとに分けるまで、どの環境も配れない。** サイトが 1 つの
> ままだと `develop` も `production` も同じサイトを指すため、`yarn deploy:develop` が
> 本番サイトを develop のビルドで上書きする。`deploy.sh` は `firebase.json` の `hosting` に
> `target` / `site` の宣言が無いことを検出して **`hosting` も既定から外し**、配る前に止まる。
> サイトの分け方は「Hosting のターゲットは環境名に合わせる」。

後から A へ移行することはできる（プロジェクトを作り、`.firebaserc` を書き換え、
データと Auth を移す）。移行のコストは、そのとき本番に溜まっているデータの量で決まる。

### 環境

| 環境         | Firebase プロジェクト（A の場合） | 用途                   |
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

### デプロイ時の npm 解決は `.npmrc` で固定している

`firebase deploy` は、リポジトリの `package.json` をそのまま使わない。**手元の
`yarn install` が通ることと、デプロイ先で `npm` が解決できることは別**で、依存の
更新が入っただけで後者だけが壊れる。実際、セキュリティ更新が 2 件入っただけで
Cloud Functions と SSR 関数が別々の理由で解決に失敗し、デプロイが止まったことがある
（CI は緑のまま。Hosting は配れるので気付きにくい）。

そのため 2 か所に `.npmrc`（`legacy-peer-deps=true`）を置いている。**どちらも
置き場所に意味がある。**

| ファイル | どう届くか |
|---|---|
| `apps/functions/.npmrc` | `firebase.json` の `functions.source` がこのディレクトリで、中身がそのまま Cloud Functions のソースとして上がる。Cloud Build がそこで `npm install` する |
| `apps/web/.npmrc` | framework-backed hosting のアダプタが `.firebase/<サイト>/functions/` へコピーする。コピー元は **`hosting.source`（`apps/web`）で、リポジトリのルートではない**（firebase-tools の `lib/frameworks/index.js` の `getProjectPath`）。コピー先はローカル / CI 側の `npm i` と Cloud Build 側の `npm ci` の両方が読む |

`scripts/test-deploy-install.sh` が、この 2 つの形（`deploy.sh` が削ったあとの
`apps/functions/package.json` と、アダプタが生成する SSR 関数の `package.json`）を
再現して `npm` の解決を確かめる。`ci.yml` の Deploy Install Test が実行する。
`npm install` は peer の衝突を黙って通すが Cloud Build が使う `npm ci` は拒否するので、
両方を回している。

> ⚠️ **`apps/` は `.templatesyncignore` の対象外なので、この 2 ファイルは Template Sync で
> 届かない。** テンプレートより前に scaffold した派生プロジェクトは、自分で置く必要がある。

### `deploy.sh` を書き換えるときに保つ約束［派生専用］

`scripts/deploy.sh` は `.templatesyncignore` で同期対象外なので、派生プロジェクトは自分の版を
持てる。ただし**同期される側がこのスクリプトの入口に依存している**ため、書き換えても次は残すこと。

- **`SKIP_CHECKS=1` でデプロイ前チェック（type-check / lint / test / build）を省略できること**

依存しているのは 2 つ。`.github/workflows/deploy.yml` は同じチェックをワークフローの step で
済ませてから `SKIP_CHECKS=1` を渡す（残さないと CI で二重に走る）。`scripts/test-env-distribution.sh`
の [6] は `node_modules` の無い一時ツリーで `deploy.sh` を回すので、省略できないと
`yarn type-check` で止まり、**env の配り方とは無関係な理由でテストが赤くなる**（#341）。

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

### デプロイ対象は `.firebaserc` の構成から決まる

`--only` を付けずに `deploy.sh` を実行したときのデプロイ対象（既定のターゲット）は、
層構成（`firestore` / `storage` / `functions` を持つか）と **`.firebaserc` の `projects`** から決まる。

`projects` で複数の環境が**同じ Firebase プロジェクト ID** を指している場合（→「Firebase
プロジェクトの持ち方は2通りある」の B）、`functions` / `firestore` / `storage` は環境で
分けられない。そこで **同じプロジェクトを共有する環境のうち、最も本番側の 1つだけ**
（`develop` < `staging` < `production` の順。全部が同じプロジェクトなら `production`）が
既定でそれらを配り、**他の環境では既定から外す**。

```
$ bash scripts/deploy.sh develop      # B の構成（3環境が同じプロジェクト）
[warn] develop は staging / production と同じ Firebase プロジェクト（myapp）を指しています。
[warn]   環境で分けられない functions / firestore / storage は既定のデプロイ対象から外しました。
[warn]   この環境から配るなら明示してください: bash scripts/deploy.sh develop --only functions,firestore,storage
```

外した対象は **`--only` で明示すれば配れる**（止めはしない。ただし他の環境にも同じものが
配られることを警告する）。CI（`.github/workflows/deploy.yml`）も同じ判定を通すため、
B の構成では `release/*` への push で関数やルールが自動デプロイされることはない。

**`hosting` だけは扱いが違う。** サイトを分けてあれば環境ごとに配れるので既定に残るが、
`firebase.json` の `hosting` に `target` / `site` の宣言が無い（サイトが 1 つしかない）
相乗り構成では、配る先が他の環境と同じサイトになるため**既定から外し、`--only` での回避も
案内しない**（`--only hosting` を明示すれば配れてしまうので、そのときは警告を出す）。
この状態で `deploy.sh` を実行すると、配るものが無いことを告げて終了する。

A の構成（環境ごとにプロジェクトを分ける）では何も変わらない — 共有している環境が無いため、
既定のターゲットはそのまま使われる。

判定は `scripts/lib/deploy-targets.mjs` にあり、`scripts/test-deploy-targets.sh` が回帰テストする。

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
```

#### 先にサービスアカウントへ IAM ロールを付与する

⚠️ **鍵を作る前にやること。** Firebase Console が自動生成する `firebase-adminsdk-*`
サービスアカウントは、既定では Admin SDK の実行に必要な権限しか持たない。この鍵をそのまま
`FIREBASE_SERVICE_ACCOUNT` に入れて `deploy.yml` を回すと **403 でデプロイが止まる。**

厄介なのは**一度に全部はわからず、段階的に落ちる**こと。足りないロールを 1 つ直すと次が出る。

```
# 1回目 — firestore.rules のコンパイル検証で停止
Error: Request to https://firebaserules.googleapis.com/v1/projects/<project>:test
had HTTP Error: 403, The caller does not have permission

# 2回目 — Rules・Hosting・Functions 本体は通り、スケジュール実行の関数だけ失敗
lacks IAM permission "cloudscheduler.jobs.update"
```

どちらもワークフローが数分走ってから落ちるため、ロールを 1 つずつ足して再実行する往復になる。
**CI からデプロイする Firebase プロジェクトごとに同じ作業を繰り返す**ので、
初回デプロイの前に以下をまとめて付与しておく（1 プロジェクトに環境を相乗りさせる構成なら 1 回で済む）。

```bash
SA=firebase-adminsdk-xxxxx@<project-id>.iam.gserviceaccount.com

for role in \
  roles/firebase.admin \
  roles/cloudfunctions.admin \
  roles/run.admin \
  roles/artifactregistry.admin \
  roles/serviceusage.serviceUsageConsumer
do
  gcloud projects add-iam-policy-binding <project-id> \
    --member="serviceAccount:$SA" --role="$role" --condition=None
done
```

| ロール | 何のため |
|---|---|
| `roles/firebase.admin` | Rules API の `:test`（ルールのコンパイル検証）、Hosting・Firestore ルール / インデックスのデプロイ |
| `roles/cloudfunctions.admin` | Functions のデプロイ |
| `roles/run.admin` | 第2世代 Functions の実体が Cloud Run |
| `roles/artifactregistry.admin` | Functions のコンテナイメージ push |
| `roles/serviceusage.serviceUsageConsumer` | `ensuring required API ... is enabled` のチェック |

**対象はプロジェクトごと。** CI からデプロイするのは staging と production の 2 つ
（develop は CI からデプロイしないため不要）で、**`FIREBASE_SERVICE_ACCOUNT` は 1 つの鍵を
両環境で共用する**。相乗り構成（B）では staging と production が同じプロジェクトなので、
このループは 1 回だけ実行する。つまり既定では、**1 つの SA に対して staging / production の各プロジェクトで
上のループを実行する**（`add-iam-policy-binding` のメンバーには別プロジェクトの SA も指定できる）。
環境ごとに鍵を分ける構成にした場合（この節の後半の GitHub Environment）は、それぞれの SA に
それぞれのプロジェクトで付与する。

#### 残り 2 つのロールは対象を絞って付ける

上のループに混ぜていない 2 つがある。**プロジェクト全体に付けると過剰になる**ため。

**`roles/iam.serviceAccountUser`**（関数のランタイム SA を引き受ける）は、**プロジェクト全体に
付けると CI の SA がプロジェクト内の任意の SA を `actAs` できてしまう** — より強い SA を実行主体に
選べる状態になる。ランタイム SA 1 つに絞って付ける。

```bash
# デプロイ済みなら実物を引く
RUNTIME_SA=$(gcloud functions describe api --gen2 --region=asia-northeast1 \
  --project=<project-id> --format='value(serviceConfig.serviceAccountEmail)')

gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --project=<project-id> \
  --member="serviceAccount:$SA" --role=roles/iam.serviceAccountUser
```

初回デプロイ前は引くべき関数がまだ無い。その場合は既定のランタイム SA
（`<project-number>-compute@developer.gserviceaccount.com` か
`<project-id>@appspot.gserviceaccount.com` のどちらか。プロジェクトによって変わるので
**どちらかは確認してから**）に付け、外したら **403 のメッセージが `actAs` に失敗した SA を
名指しする**ので、それに合わせて付け直す。

**`roles/cloudscheduler.admin`** は `onSchedule` の関数を持つ構成でのみ必要
（`cloudscheduler.jobs.update`）。テンプレート同梱の `apps/functions/src/index.ts` は
スケジュール関数の export がコメントアウトされた状態なので、**既定構成では要らない**。
`/new-function` で `onSchedule` を足したときに、そのプロジェクトへ追加する。

```bash
gcloud projects add-iam-policy-binding <project-id> \
  --member="serviceAccount:$SA" --role=roles/cloudscheduler.admin --condition=None
```

足りないと、Rules・Hosting・Functions 本体まで通ってからその関数だけが落ちる。

#### 付与するときの補足

- **付与する側に `roles/resourcemanager.projectIamAdmin`（または Owner）が要る。** IAM の変更は
  権限昇格にあたるため `scripts/setup.sh` では自動実行せず、手順として残している。
- `roles/firebase.admin` は広いロールだが、Rules API の `:test` を含む最小の組み合わせを特定する
  コストが高いため、**CI 専用の SA であること**を前提に admin ロールで妥協している。
- 付与済みか確認する（プロジェクト単位の付与のみ。ランタイム SA に絞ったぶんは
  `gcloud iam service-accounts get-iam-policy "$RUNTIME_SA"` で見る）:

```bash
gcloud projects get-iam-policy <project-id> \
  --flatten="bindings[].members" \
  --filter="bindings.members:$SA" --format="value(bindings.role)"
```

#### 鍵を作って登録する

```bash
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
承認できない**（GitHub の仕様）ため、出した PR が軒並みマージできなくなる。

承認 0 件でも、**PR 必須（直接 push 禁止）と Required status checks は効く** — この ruleset の
主目的である「赤い PR をマージできなくする」は保たれる。複数人でレビューを回すプロジェクトは、
取り込み後に UI で 1 以上へ上げる（`hotfix/*` の bypass 設定と同じ扱い）。そのとき
**`require_last_push_approval` を同時に有効にしないこと** — 「最後の push を pusher 以外が
承認していること」を要求するルールで、承認者が 1 人しかいない構成では同じデッドロックが再発する。
自動マージとの噛み合わせは `.claude/docs/dependencies.md`「決めていること」を参照。

**既に `1` で取り込んでいるリポジトリは、この JSON を直しても変わらない**（ruleset は
リポジトリ外の状態。`yarn setup` も同名の ruleset があれば skip する）。UI か、この節の後半の
`gh api repos/{owner}/{repo}/rulesets/{id} --method PUT` で下げる。

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
# 取り込み済みの ruleset を確認して、中身（required check の名前、承認数など）を直す
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
| GitHub App | bot | Organization / 個人アカウント | 秘密鍵に期限なし |
| PAT | トークンの持ち主 | 個人アカウント | あり（切れると毎週失敗に戻る） |

App のインストールトークンは 1 時間で失効するため Secrets には置けず、実行時に生成する。
登録するのは秘密鍵と Client ID であって、トークンそのものではない。

PAT だと、詰まる／詰まらない以前に次の2つが常時ついて回る。

- **承認を必須にしていて、承認できる人が他にいないと詰まる。** 自分の PR は自分で承認できないため、
  `required_approving_review_count` を 1 以上へ上げていて、かつ承認者がトークンの持ち主しか
  いない構成では、毎週マージできない PR ができる（既定は 0 なので、上げていなければ
  詰まりはしない。→「マージルールの強制」）
- **帰属が嘘になる。** cron が取り込んだものが、人の判断として履歴に残る

### 先に `template-sync` ラベルを作る

ワークフローは同期 PR に `template-sync` ラベルを付ける（`pr_labels`）。
`AndreasAugustin/actions-template-sync` は**ラベルが無ければ作りに行くが、失敗しても警告だけ出して
先へ進み**、そのあとの `gh pr create --label` でラベルが見つからず PR の作成に失敗する
（v2.5.3 のソースで確認）。

ラベル作成に必要な権限は**未確認**だが、下で設定する権限（Contents / Pull requests）だけの
トークンでは作れない可能性がある。そうだとすると、App 側に `Issues: Read and write` を足す形でも
避けられるはず。

scaffold 直後のリポジトリにこのラベルは無いので、先に作っておくのが確実。

```bash
gh label create template-sync
```

### GitHub App を使う場合（推奨）

1. **App を作る** — Organization settings > Developer settings > GitHub Apps > New GitHub App
   （個人アカウント所有にするなら Settings > Developer settings > GitHub Apps）
   - Repository permissions: **Contents: Read and write** / **Pull requests: Read and write** /
     **Workflows: Read and write**
   - **Webhook の Active のチェックを外す**（このワークフローは webhook を使わない）
   - 親テンプレートは public なので、読み取り用の追加権限は要らない

   `Workflows` が要るのは、同期の対象に `.github/workflows/` が入るため。無いと取り込み自体は
   進んで、最後の push だけが
   `refusing to allow a GitHub App to create or update workflow ... without 'workflows' permission`
   で弾かれる。**権限を後から足した場合は、インストール側で変更を承認するまで反映されない**
   （Organization settings > GitHub Apps に「Review request」が出る）。
2. **Client ID を控え、Private key を生成する**（`.pem` がダウンロードされる）
3. **インストールする** — 作った App をインストールし、対象を派生リポジトリに絞る
4. **登録する** — Client ID は Variables、秘密鍵は Secrets（置き場所が違う）

   ```bash
   # 秘密鍵。改行ごと渡す必要があるので、貼り付けずにファイルから読ませる
   gh secret set TEMPLATE_SYNC_APP_PRIVATE_KEY < path/to/key.pem
   ```

   Client ID は Settings > Secrets and variables > Actions > **Variables** タブで
   `TEMPLATE_SYNC_APP_CLIENT_ID` として登録する（Secrets タブではない）。
5. **確認する** — Actions > Template Sync > Run workflow
   - PR ができたら、**作成者が bot になっていること**を見る
   - 同期 PR の head は `chore/template_sync_<ハッシュ>` で、`branch-guard.yml` がこれを
     `production` への PR の例外として明示的に許可している（だから guard が緑になる）

   ⚠️ **ジョブが緑でも PR が 0 件のことがある。** 3 通りある（v2.5.3 のソースで確認）。

   1. テンプレート側に新しいコミットが無い（取り込み済み）
   2. 取り込んだ結果に差分が無い
   3. **同名の同期ブランチが remote に残っている** — 前回の実行が PR の作成だけ失敗すると、
      ブランチは push 済みで PR だけ無い状態になる。この状態では以降の実行が
      「ブランチがあるので何もしない」で緑のまま終わり、テンプレート側の HEAD が動くまで
      PR が作られない。残った `chore/template_sync_*` ブランチを消してから再実行する

   1 と 2 は正常だが、3 は詰まっているので区別する。初回は PR ができるところまで見届ける。

⚠️ **Variables / Secrets を Organization に置くと、全リポジトリに継承される。** 落ち方が
2 通りあるので、置く順番に注意する。

- `TEMPLATE_SYNC_APP_CLIENT_ID` だけを先に Org へ置く → まだ秘密鍵の無いリポジトリが
  「App の設定が片方だけです」で落ちる（設定漏れを PAT で黙って隠さないための挙動）
- 両方を Org へ置く → App を未インストールのリポジトリで、トークン生成のステップが落ちる

**App を対象リポジトリへインストールしてから、両方をまとめて置く。**
リポジトリ単位で登録するぶんには、他のリポジトリに影響しない。

**つまずきやすいところ**: 秘密鍵の改行が落ちていると、トークン生成のステップだけが落ちる。
エラーメッセージからは鍵の問題だと読み取りにくいので、`gh secret set ... < file` の形で入れる。

### PAT を使う場合

App を作れないとき（Organization の owner 権限が無い、個人リポジトリで scaffold した等）の代替。

Settings > Developer settings > Personal access tokens > **Fine-grained tokens** で作る。
Repository access に対象リポジトリ、権限は **Contents: Read and write**、
**Pull requests: Read and write**、**Workflows: Read and write**（Metadata は自動で付く）。
`Workflows` は App と同じ理由で要る（同期の対象に `.github/workflows/` が入る）。

```bash
gh secret set TEMPLATE_SYNC_TOKEN
```

⚠️ **未確認**だが、Organization 所有のリポジトリでは組織側が fine-grained PAT を許可している
必要があり、ポリシーによっては組織オーナーの承認待ちになる。そうだとすると
「owner 権限が無いから App を作れない」という状況では、この代替も通らない。

期限が切れると毎週の実行が失敗に戻る。更新を促す仕組みは無いので、期限を長めに取るか
カレンダーに入れておく。App へ移るときは、秘密鍵を Secrets、Client ID を Variables に
**両方まとめて**足す（片方だけだと「App の設定が片方だけです」で落ちる）。ワークフローは
App があればそちらを優先するので、`TEMPLATE_SYNC_TOKEN` は残っていても使われない。

### なぜ `GITHUB_TOKEN` では駄目か

`GITHUB_TOKEN` が起こしたイベントは新しいワークフローを起動しない、という GitHub の仕様がある。
そのままだと同期 PR で ci / branch-guard / docs-check が一切走らず、required status check
（`guard` / `ci / ci`）が Expected のまま埋まらないため、マージできない PR になる。
PR にワークフローを起こすために、外部のトークンが要る。

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
