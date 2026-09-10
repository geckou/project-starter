# フック（強制ルール）と CI が守る規約

CLAUDE.md に書いただけのルールは読み飛ばされうるため、**繰り返し破られるルールは
Hook 化して機械的に強制する**。実体は `.claude/settings.json` + `.claude/hooks/`。

CLAUDE.md にはフックの一覧だけを置き、各フックが何を見るか・どう直すかはここに書く。

| タイミング | フック | 内容 |
|---|---|---|
| SessionStart | `session-start-git-context.sh` | `git fetch origin --prune` を実行し、現在ブランチ・`origin/production` との差分・進行中の `release/*` を文脈に入れる（古い情報のまま作業を始めるのを防ぐ） |
| SessionStart | `session-start-questions.sh` | 未回答の確認事項（`.claude/docs/questions.md`）を冒頭の文脈に入れる |
| PreToolUse (Bash) | `pre-git-guard.sh` | ブランチ命名（改名・複製を含む）・分岐元・fetch 鮮度・コミットメッセージ形式・husky の迂回（`--no-verify`（commit / push / merge / rebase）、`-c core.hooksPath`、`git config` での設定・`--unset` / `--remove-section`、`HUSKY=0` / `GIT_CONFIG_*` の前置きと別セグメントでの `export`）・alias 定義経由の呼び出し・`production` への直接 push と force push を**実行前にブロック**。`sh -c` / `eval` / バッククォートで包んだ形も中身を展開して検査し、`command` / `exec` / `time` / `nohup` / `sudo` と `{ }` / `if` / `then` / `do` などの予約語の後ろにある git も同じ検査に載せる。git 自身やサブコマンド・refspec が置換・グロブで書かれていて判定できない形は拒否する。コミットの可否は同じコマンド内の `checkout -b` / `switch -c` / `checkout <既存ブランチ>` を反映した「コミット時のブランチ」で判定する。**ユーザー承認を求める**もの: `release/*` / `hotfix/*` への push と `--prune`、`xargs` / パイプ / 中身を静的に読めない `eval`・`source` 経由の間接実行、`gh pr merge`（PR のマージ）、ブランチの削除（ローカル / リモート）、作業ブランチとタグへの force push、`feat/*` 同士の取り込み（`merge` / `rebase` / `pull` / `cherry-pick`。自分のブランチを取り込むだけの形は対象外）。検査対象は**このリポジトリで git を実行するコマンドだけ**（`gh pr merge` を除く。コマンド中の `cd` / `git -C` を解釈し、別リポジトリへの操作と、`gh pr create --body` のような引数に書いたコマンド例は素通しする） |
| PostToolUse (Bash) | `post-git-branch-reminder.sh` | ブランチ作成直後、進行中の `release/*` があればマージ要否の確認を促す |
| PostToolUse (Edit/Write) | `post-edit-reminder.sh` | `firestore.rules` / `packages/shared` 変更時に検証コマンドをリマインド |
| Stop | `stop-dod-check.sh` | 未コミットのコード変更があれば DoD（type-check / lint / test）を自動実行し、失敗なら終了をブロック |
| Stop | `stop-roadmap-reminder.sh` | 作業があるのに `roadmap.md` 未更新ならリマインド |
| Stop | `stop-questions-reminder.sh` | この作業で確認事項を積んだのに提示していなければ、終了前に一覧を出させる |
| Stop | `stop-pr-reminder.sh` | 作業ブランチが push 済みで、`origin/production` へ未マージのコミットがあるのに open な PR が無ければ終了をブロック（CLAUDE.md「PR は出す、マージは人が決める」）。PR の有無は `gh` に聞くため、`gh` が無い / 未認証 / API が失敗したときは何もしない。探す先は remote の URL から決めた `owner/repo`（`gh` の既定リポジトリに任せると、比べた remote と別のリポジトリの PR を数えてしまう）。URL から `owner/repo` を作れないときと、ホストが github.com でも `HOOK_PR_GITHUB_HOST` でもないときも何もしない。`production` と `release/*` は対象外（`release/*` への push はデプロイであって、`production` への PR は後から出す） |

Stop フックは 4 つとも同じ `stop_hook_active` を受け取る。DoD がブロックした後の継続でも
残りの判定が走るように、**フックごとに「1 セッションで 1 回だけブロックする」**形にしてある
（DoD は実行コストが高いため、継続中はこれまでどおり実行しない）。

## スタック依存の値は `config.sh` に置く

フック本体（`.claude/hooks/*.sh`）は**スタック非依存**に保つ。`yarn` / `firestore.rules` /
`packages/shared` のような、このプロジェクトの構成に依存する値は `.claude/hooks/config.sh` に集める。

| 設定項目 | 用途 |
|---|---|
| `HOOK_RUNNER` | DoD を実行するパッケージマネージャ |
| `HOOK_DOD_TASKS` | DoD として実行するタスク |
| `HOOK_CODE_EXTENSIONS` | DoD の対象になるコードファイルの拡張子 |
| `HOOK_WATCH_PATHS` | 変更時にリマインドするパスと文言 |
| `HOOK_QUESTIONS_FILE` | 確認事項キューの場所 |
| `HOOK_ROADMAP_FILE` | ロードマップ（機能ステータス表）の場所 |
| `HOOK_PR_REMOTE` | PR の有無を見るときのリモート名 |
| `HOOK_PR_BASE_BRANCH` | PR のマージ先（既定ブランチ） |
| `HOOK_PR_GITHUB_HOST` | GitHub Enterprise のホスト名（未設定なら github.com のみ対象） |

`config.sh` は `.templatesyncignore` に登録してあり、テンプレート更新で上書きされない。
逆にテンプレート側で設定項目が増えても自動では流れてこないため、**フック本体は
その項目が無くても既定値で動く**ように書く。フックを追加するときも同じ方針に従う。

## 層マニフェストを変更したら

`layers.json` を変えたら `node scripts/check-layers.mjs`（実態との一致）を実行する。
node_modules に依存しないので `yarn install` なしで走る。CI でも実行される。

減算・加算スクリプト自体の回帰テスト（`bash scripts/test-layers.sh`）は
**テンプレート本体専用**で、派生プロジェクトには配られない。

## フックを変更したら

`pre-git-guard.sh` / `post-edit-reminder.sh` / `stop-dod-check.sh` には回帰テストがある。
フックを変更したら `yarn test:hooks`（実体は `scripts/test-hooks.sh`）を実行する。
node_modules に依存しないので `yarn install` なしでも `bash scripts/test-hooks.sh` で走る。
CI でも実行される。

**フックを追加・変更したらテストも足す。** 設定で挙動が変わるフックは、
設定が効くことと `config.sh` が無くても既定値で動くことの両方を検証する。

## ドキュメントの参照切れは CI が検出する

コードを移動・削除したときにドキュメントの追従を忘れると、読んだ人と AI が
存在しないパスを前提に作業してしまう。型チェックにもテストにも引っかからないため、
`yarn check:docs`（実体は `scripts/check-docs.sh`）が機械的に検出する。

- 検査対象: 追跡されている Markdown（`.claude/skills/` は除く。スキルは
  「これから作るファイル」を書くものなので、実在しないパスを含むのが正しい）
- 検査内容: リポジトリ相対パスの言及と、Markdown の相対リンク先
- gitignore 対象など意図的に存在しないパスは `ALLOW_MISSING` に追加する
- **テンプレート本体だけが持つファイル**（`scripts/adopt-references.mjs` 等）への言及は
  参照切れにしない。一覧は `.templatesyncignore` の `template-only:start` / `:end` の範囲が正で、
  `check-docs.sh` はそこを読むだけ。同期されないファイルを `scripts/` や
  `.github/workflows/` に足して除外するときは、この範囲の中に書く
- **採用していない層への言及**も参照切れにしない。`apps/mobile/` のように入れ物ごと
  無ければ「その層を持たない構成」とみなす。入れ物があって中のファイルだけ無い場合は
  従来どおり参照切れになる
- **同期されるドキュメントが、同期されないパスを指している場合**も参照切れにしない。
  `apps/` `packages/` は `.templatesyncignore` で丸ごと除外されているので、テンプレートの
  参照実装（`apps/web/src/lib/billing.ts` 等）は派生に届かない。`workflow.md` が指す
  `.claude/docs/planning.md` / `spec.md` / `roadmap.md` も同じで、Notion 等で管理する派生には
  無い。**同期では埋めようがないもの**なので数えない（#338）。逆に、除外に載っている
  ドキュメント（`CLAUDE.md` や `questions.md`。派生が自分で書く側）からの言及は従来どおり検査する。
  **代償**: 派生では `.claude/docs/*.md` からの `apps/**` `packages/**` への言及が実質検査されなく
  なる（同期されたものと派生が書き足したものを、パスからは区別できないため）。派生の実装を指す
  参照切れを拾いたいなら、除外に載るドキュメント側（`CLAUDE.md` や派生が `.templatesyncignore` に
  足したファイル）に書く

**この壊れ方はテンプレート本体では観測できない。** 本体には全ファイルが揃っているので
`check-docs.sh` は緑になり、同期した派生でだけ赤くなる（#322）。`scripts/test-docs-downstream.sh`
が「テンプレート本体だけが持つファイルを消し、層を外した状態」を作って `check-docs.sh` を回し、
本体側で検出する。`docs-check.yml` の Docs Check (downstream) が実行する。

逆向きの穴もある。上の「同期されないパスは数えない」を本体にも効かせると、本体で
`apps/…` の綴りを間違えても黙って通ってしまう。そこで `CHECK_DOCS_STRICT=1` を立てると
この見逃しだけが切れる（他の見逃しはそのまま。有効なのは値が `1` のときだけで、
`CHECK_DOCS_STRICT=0` は「切っている」扱い）。**派生では立てない** — 立てると
取り込んだだけで赤くなる。

**この strict は `yarn check:docs` には入っていない。** 回すのは `test-docs-downstream.sh`
（テンプレート本体だけが持つ）で、CI では `docs-check.yml` の Docs Check (downstream) が
本体でだけ実行する。つまり本体で `apps/…` の綴りを間違えると、**手元の `yarn check:docs` は
緑のまま CI で赤くなる**。手元で先に見るなら `bash scripts/test-docs-downstream.sh` を回す。

`.github/workflows/docs-check.yml` が全 PR で実行する。`ci.yml` と分けているのは、
`ci.yml` がコードの差分が無い PR で重いステップを飛ばす作りになっており、
ドキュメントだけの差分ではこの検査まで飛んでしまうため（`ci.yml` の「Detect code changes」）。

## デプロイ先の絞り込みは回帰テストで固定する

`scripts/deploy.sh` は `firebase.json` の `hosting` ターゲットのうち、**環境名と一致する
1 つだけ**に配る（→ `.claude/docs/git-workflow.md`「Hosting のターゲットは環境名に合わせる」）。
以前は全ターゲットに配っていて、`yarn deploy:staging` が staging のビルドを production の
サイトにも出していた。

判断は `scripts/lib/hosting-targets.mjs` に切り出してあり、`bash scripts/test-deploy-targets.sh`
（`yarn test:deploy-targets`）が検証する。`deploy.sh` 本体は firebase CLI と実プロジェクトが
無いと流せないため、**選び方だけを切り出してテスト可能にしている。** ターゲットの選び方を
変えるときはこのテストも足す。CI では `ci.yml` の Deploy Target Test が実行する。

## env の配布内容は回帰テストで固定する

`scripts/use-env.sh` は `.env.<環境名>` を単一の正として各所へ配る。間違えると
どちらかに倒れ、**どちらも型チェックにもテストにも引っかからない。**

- **足りない**: SSR / Functions で `undefined` になる（本番に出て初めて分かる）
- **多すぎる**: 秘密が関数の環境変数として載り、閲覧者ロールから読める

とくに framework-backed hosting は env の届き方が 3 通りあり、経路ごとに読まれる
ファイルが違う（→ `.claude/docs/architecture.md`）。
`bash scripts/test-env-distribution.sh`（`yarn test:env-distribution`）が検証するのは:

- どのキーがどのファイルへ行くか（許可リストのキーが載り、無いキーの行は書かれない）
- 生成ファイルにフィクスチャの秘密が載らないこと
- 環境を切り替えると前の値が消え、新しい値が入ること
- **デプロイ中に `apps/web/.env.local` が退避され、終了後に戻ること**
  （`firebase` をスタブに差し替えて `deploy.sh` を実際に流し、`firebase deploy` が
  呼ばれた時点のファイルの状態を記録して検証する）
- **許可リストのキーが Cloud Functions の予約語に当たらないこと**
  （`FIREBASE_*` / `X_GOOGLE_*` / `EXT_*` や `PORT` 等。当たると `firebase deploy` が
  `Failed to validate key` で止まる）

秘密の検査はフィクスチャに置いた 2 キーを見ているだけなので、**別名の秘密を許可リストへ
足しても素通りする**。許可リスト（`WEB_SSR_ENV_KEYS` / `FUNCTIONS_ENV_KEYS`）に何かを
足すときは、テストの緑だけでなく「それは秘密か」を人が見る。

層を持たない構成では、その層のセクションごと飛ばす（`FUNCTIONS_ENV_KEYS` の宣言が
残っているかで判定）。**このスクリプトに層マーカーの文字列を書かないこと** —
`remove-layer.mjs` が本物のマーカーとみなし、対応する `end` が無いためファイル末尾まで
削り落とす。CI では `ci.yml` の Env Distribution Test が実行する。

## 本体保守で使うスクリプト

テンプレート本体の検証・公開まわり。ここに挙げるものは派生プロジェクトへ配られないので、
`/init-project` は**この節ごと**派生から削除する。

```bash
bash scripts/test-layers.sh          # 層スクリプトの回帰テスト（減算・加算・往復）

node scripts/adopt-references.mjs --repo <派生のパス>  # 既存の派生を参照方式へ移行する
bash scripts/test-adopt-references.sh                 # 上記スクリプトの回帰テスト

bash scripts/test-docs-downstream.sh                  # 派生に同期された状態で check-docs.sh が通るか

yarn release <パッケージのディレクトリ名>...           # タグを打って公開する（通常は自動公開で足りる。複数可）
bash scripts/install-release-command.sh               # geckou-release をどこからでも使えるようにする
bash scripts/test-release-command.sh                  # 上記コマンドの回帰テスト

node scripts/check-workspace-ranges.mjs               # 参照レンジがローカルの version を満たすか検証
bash scripts/test-workspace-ranges.sh                 # 上記の回帰テスト
bash scripts/test-api-diff.sh        # リリース時の API 差分検査の回帰テスト
```

