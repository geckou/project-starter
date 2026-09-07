# フック（強制ルール）と CI が守る規約

CLAUDE.md に書いただけのルールは読み飛ばされうるため、**繰り返し破られるルールは
Hook 化して機械的に強制する**。実体は `.claude/settings.json` + `.claude/hooks/`。

CLAUDE.md にはフックの一覧だけを置き、各フックが何を見るか・どう直すかはここに書く。

| タイミング | フック | 内容 |
|---|---|---|
| SessionStart | `session-start-git-context.sh` | `git fetch origin --prune` を実行し、現在ブランチ・`origin/production` との差分・進行中の `release/*` を文脈に入れる（古い情報のまま作業を始めるのを防ぐ） |
| SessionStart | `session-start-questions.sh` | 未回答の確認事項（`.claude/docs/questions.md`）を冒頭の文脈に入れる |
| PreToolUse (Bash) | `pre-git-guard.sh` | ブランチ命名（改名・複製を含む）・分岐元・fetch 鮮度・コミットメッセージ形式・husky の迂回（`--no-verify`（commit / push / merge / rebase）、`-c core.hooksPath`、`git config` での設定・`--unset` / `--remove-section`、`HUSKY=0` / `GIT_CONFIG_*` の前置きと別セグメントでの `export`）・alias 定義経由の呼び出し・`production` への直接 push と force push を**実行前にブロック**。`sh -c` / `eval` / バッククォートで包んだ形も中身を展開して検査し、`command` / `exec` / `time` / `nohup` / `sudo` と `{ }` / `if` / `then` / `do` などの予約語の後ろにある git も同じ検査に載せる。git 自身やサブコマンド・refspec が置換・グロブで書かれていて判定できない形は拒否する。コミットの可否は同じコマンド内の `checkout -b` / `switch -c` / `checkout <既存ブランチ>` を反映した「コミット時のブランチ」で判定する。**ユーザー承認を求める**もの: `release/*` / `hotfix/*` への push と `--prune`、`xargs` / パイプ経由の間接実行、`gh pr merge`（PR のマージ）、ブランチの削除（ローカル / リモート）、作業ブランチとタグへの force push、`feat/*` 同士の取り込み（`merge` / `rebase` / `pull` / `cherry-pick`。自分のブランチを取り込むだけの形は対象外）。検査対象は**このリポジトリで git を実行するコマンドだけ**（`gh pr merge` を除く。コマンド中の `cd` / `git -C` を解釈し、別リポジトリへの操作と、`gh pr create --body` のような引数に書いたコマンド例は素通しする） |
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

`layers.json` を変えたら `bash scripts/test-layers.sh`（減算の回帰テスト）と
`node scripts/check-layers.mjs`（実態との一致）を実行する。
どちらも node_modules に依存しないので `yarn install` なしで走る。CI でも実行される。

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

`.github/workflows/docs-check.yml` が全 PR で実行する。`ci.yml` と分けているのは、
`ci.yml` がコードの差分が無い PR で重いステップを飛ばす作りになっており、
ドキュメントだけの差分ではこの検査まで飛んでしまうため（`ci.yml` の「Detect code changes」）。

## 本体保守で使うスクリプト

派生プロジェクトでは使わない（テンプレート本体の検証・公開まわり）。

```bash
node scripts/check-layers.mjs        # 層マニフェストと実態の一致を検証
bash scripts/test-layers.sh          # 層スクリプトの回帰テスト（減算・加算・往復）
node scripts/remove-layer.mjs <層>   # 層を外す（--dry-run で確認のみ）
node scripts/add-layer.mjs <層>      # 層を足す（テンプレートから取り寄せる）

node scripts/adopt-references.mjs --repo <派生のパス>  # 既存の派生を参照方式へ移行する
bash scripts/test-adopt-references.sh                 # 上記スクリプトの回帰テスト

yarn release <パッケージのディレクトリ名>...           # タグを打って公開する（通常は自動公開で足りる。複数可）
bash scripts/install-release-command.sh               # geckou-release をどこからでも使えるようにする
bash scripts/test-release-command.sh                  # 上記コマンドの回帰テスト

node scripts/check-workspace-ranges.mjs               # 参照レンジがローカルの version を満たすか検証
bash scripts/test-workspace-ranges.sh                 # 上記の回帰テスト
bash scripts/test-api-diff.sh        # リリース時の API 差分検査の回帰テスト
```

