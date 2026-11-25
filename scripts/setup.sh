#!/bin/bash
set -e

echo "=== Geckou Project Starter - Setup ==="
echo ""

# .firebaserc の確認
#
# Firebase プロジェクトは 1 つで、develop / staging / production を相乗りさせる
# （→ .claude/docs/git-workflow.md「Firebase プロジェクトは 1 つに相乗りさせる」）。
# .firebaserc の環境エイリアスは全て同じプロジェクト ID を指す
if grep -q "your-project-id" .firebaserc 2>/dev/null; then
  echo "[todo] Firebase プロジェクト ID を設定してください"
  echo ""
  echo "  Firebase プロジェクトを 1 つ作成してください（develop / staging / production で共有します）。"
  echo ""

  read -p "Project ID (後で設定する場合は Enter): " PROJECT_ID

  # 置換後の文字列は入力そのもの。sed の特殊文字（/ & \ 改行）を素通しすると
  # .firebaserc が壊れる（貼り付けミスで / が入るだけで起きる）
  escape_replacement() {
    printf '%s' "$1" | sed -e 's/[\\&/]/\\&/g' -e 's/$/\\/' | sed -e '$s/\\$//'
  }

  if [ -n "$PROJECT_ID" ]; then
    escaped=$(escape_replacement "$PROJECT_ID")

    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s/your-project-id/$escaped/g" .firebaserc
    else
      sed -i "s/your-project-id/$escaped/g" .firebaserc
    fi

    echo "[done] .firebaserc を更新しました"
    echo ""
    echo "[next] 環境ごとに Hosting サイトを分けます:"
    echo "  1. Firebase コンソールで環境ぶんの Hosting サイトを作る"
    echo "  2. firebase target:apply hosting develop <サイト ID> （staging / production も同様）"
    echo "  3. firebase.json の hosting を配列にし、各要素に target を書く"
    echo "  → 手順: .claude/docs/git-workflow.md「Hosting のターゲットは環境名に合わせる」"
    echo ""
    echo "[note] Functions は環境ごとに配り分けます（develop-api / staging-api / api）。"
    echo "  firestore / storage のルールは全環境で 1 つで、production のデプロイでだけ配ります。"
  else
    echo "[skip] Project ID は後で .firebaserc の your-project-id を置き換えてください"
  fi
else
  echo "[skip] .firebaserc は設定済みです"
fi

echo ""

# 環境別 .env ファイルの作成
for ENV in develop staging production; do
  if [ -f ".env.${ENV}" ]; then
    echo "[skip] .env.${ENV} は既に存在します"
  else
    cp .env.example ".env.${ENV}"
    echo "[done] .env.${ENV} を作成しました"
  fi
done

echo ""
echo "  → 各 .env.{環境名} に Firebase の設定値を入力してください"
echo "  → Firebase Console: https://console.firebase.google.com"

echo ""

# デフォルト環境の設定
if [ ! -f .env.local ]; then
  cp .env.develop .env.local 2>/dev/null || cp .env.example .env.local
  echo "[done] .env.local を作成しました（develop 環境）"
else
  echo "[skip] .env.local は既に存在します"
fi

echo ""

# Node.js バージョンチェック
# メジャーだけでなく minor も見る。firebase-admin が引く @firebase/database-compat が
# engines.node で >=24.12.0 を要求するため、24.0〜24.11 はここを通ったあと
# yarn install が engines で落ちる（#392。@commitlint/* の要求は >=22.12.0）
REQUIRED_NODE=24
REQUIRED_NODE_MINOR=12
CURRENT_NODE=$(node -v 2>/dev/null | tr -d 'v')
CURRENT_NODE_MAJOR=$(printf '%s' "$CURRENT_NODE" | cut -d'.' -f1)
CURRENT_NODE_MINOR=$(printf '%s' "$CURRENT_NODE" | cut -d'.' -f2)
if [ -z "$CURRENT_NODE" ]; then
  echo "[warn] Node.js がインストールされていません"
  echo "  → Node.js $REQUIRED_NODE.$REQUIRED_NODE_MINOR 以上をインストールしてください"
elif [ "$CURRENT_NODE_MAJOR" -lt "$REQUIRED_NODE" ] ||
  { [ "$CURRENT_NODE_MAJOR" -eq "$REQUIRED_NODE" ] &&
    [ "$CURRENT_NODE_MINOR" -lt "$REQUIRED_NODE_MINOR" ]; }; then
  echo "[warn] Node.js v$CURRENT_NODE が検出されました（v$REQUIRED_NODE.$REQUIRED_NODE_MINOR 以上が必要）"
  echo "  → nvm use $REQUIRED_NODE または nvm install $REQUIRED_NODE"
else
  echo "[ok] Node.js v$CURRENT_NODE"
fi

# yarn チェック
if command -v yarn &> /dev/null; then
  echo "[ok] yarn $(yarn -v)"
else
  echo "[warn] yarn がインストールされていません"
  echo "  → npm install -g yarn"
fi

# Firebase CLI チェック。
# firebase-tools はルート package.json の devDependencies に固定し、yarn install で
# node_modules/.bin/firebase に入れる（#381）。グローバルの CLI に頼ると、マシンや CI
# ごとに版がずれて Functions エミュレーターの起動やデプロイが予告なく壊れる。
# ルート package.json は Template Sync の対象外なので、固定していない派生では
# 従来どおりグローバルの CLI を見たうえで、固定を促す
if node -e "process.exit(require('./package.json').devDependencies?.['firebase-tools'] ? 0 : 1)" 2>/dev/null; then
  if [ -x node_modules/.bin/firebase ]; then
    echo "[ok] firebase $(node_modules/.bin/firebase --version)（node_modules に固定）"
  else
    echo "[info] firebase-tools は yarn install で node_modules に入ります（グローバルのインストールは不要）"
  fi
elif command -v firebase &> /dev/null; then
  echo "[ok] firebase $(firebase --version)（グローバル）"
  echo "  → 版を固定するには: yarn add -W -D firebase-tools@^15"
else
  echo "[warn] Firebase CLI がインストールされていません"
  echo "  → yarn add -W -D firebase-tools@^15（推奨。リポジトリで版を固定する）"
  echo "  → または npm install -g firebase-tools@15"
fi

echo ""

# gh が使えるかと、対象リポジトリ（REPO）を確かめる。
# 保護ルールの設定はこの後に 2 つ続くので、前提の判定はここに 1 か所だけ置く
# （片方の関数の早期 return にぶら下げると、その分岐に入ったときもう片方が
#   一度も呼ばれない。「production の保護は設定済み」の派生で release/* の
#   保護が永久に提案されなくなる形になっていた）
detect_repo() {
  # gh CLI の存在チェック
  if ! command -v gh &> /dev/null; then
    echo "[skip] GitHub CLI (gh) がインストールされていません"
    echo "  → brew install gh でインストール後、手動でブランチ保護を設定してください"
    echo "  → https://docs.github.com/ja/repositories/configuring-branches-and-merges-in-your-repository/managing-a-branch-rule/managing-a-branch-protection-rule"
    return 1
  fi

  # gh の認証チェック
  if ! gh auth status &> /dev/null; then
    echo "[skip] GitHub CLI が未認証です"
    echo "  → gh auth login で認証後、再度 yarn setup を実行してください"
    return 1
  fi

  # リモートURLからリポジトリを検出
  REMOTE_URL=$(git remote get-url origin 2>/dev/null || true)
  if [ -z "$REMOTE_URL" ]; then
    echo "[skip] git remote origin が設定されていません"
    return 1
  fi

  # owner/repo を抽出（BSD sed は非貪欲量指定子 .+? を解釈できないため多段置換。末尾の / と .git も除去）
  #
  # 先に github.com の URL かを確かめる。sed は一致しなければ入力をそのまま返すので、
  # GitLab 等のリモートでも REPO が空にならず、URL 全体を owner/repo として gh api に
  # 渡して「production ブランチがまだ存在しません」という無関係な案内になる（#316）
  case "$REMOTE_URL" in
    *github.com[:/]*) ;;
    *)
      # URL は出さない（https://<トークン>@host/... の形だと資格情報が画面に残る）
      echo "[skip] origin が github.com のリポジトリではありません"
      echo "  → ブランチ保護とラベルの設定は GitHub のリポジトリでのみ行います"
      return 1
      ;;
  esac

  REPO=$(echo "$REMOTE_URL" | sed -E 's#.*github\.com[:/]##; s#/$##; s#\.git$##')
  if [ -z "$REPO" ]; then
    echo "[skip] GitHub リポジトリを検出できませんでした"
    return 1
  fi

  echo "リポジトリ: $REPO"
  return 0
}

# GitHub ブランチ保護ルール設定
setup_branch_protection() {
  # production ブランチの存在チェック
  if ! gh api "repos/$REPO/branches/production" &> /dev/null; then
    echo "[skip] production ブランチがまだ存在しません"
    echo "  → production ブランチを作成後、再度 yarn setup を実行してください"
    return
  fi

  # 保護の定義は .github/rulesets/production.json に一本化してある。
  # ここで legacy の branch protection API を別に叩くと required check 名が
  # 二重管理になり、片方だけ古い名前（"ci"）のまま残ると production への PR が
  # 存在しないチェックを待ち続けて永遠にマージできなくなる
  RULESET_FILE="$(dirname "$0")/../.github/rulesets/production.json"
  if [ ! -f "$RULESET_FILE" ]; then
    echo "[skip] $RULESET_FILE が見つかりません"
    return
  fi

  # require() はモジュール解決なので、相対パス（yarn setup = bash scripts/setup.sh）だと
  # 必ず MODULE_NOT_FOUND になる。ファイルとして読む
  RULESET_NAME=$(node -p \
    "JSON.parse(require('fs').readFileSync('$RULESET_FILE','utf8')).name" \
    2>/dev/null || echo 'production-protection')

  # required status check の名前は CI の呼び方で変わる。
  #   参照形（reusable workflow を uses で呼ぶ）      -> 'ci / ci'
  #   ci.yml が pull_request で直接動く形（テンプレ本体・未移行の派生） -> 'ci'
  # 実態と違う名前を要求すると、そのチェックは永久に報告されず
  # production への PR が Pending のままマージできなくなる
  CI_WORKFLOW="$(dirname "$0")/../.github/workflows/ci.yml"
  CI_CONTEXT='ci'
  if grep -Eq '^[[:space:]]*uses:[[:space:]]*[^[:space:]]+/\.github/workflows/ci\.yml@' \
    "$CI_WORKFLOW" 2>/dev/null; then
    CI_CONTEXT='ci / ci'
  fi

  # 既存の ruleset チェック
  if gh api "repos/$REPO/rulesets" --jq '.[].name' 2>/dev/null |
    grep -qx "$RULESET_NAME"; then
    echo "[skip] production ブランチの保護ルール（$RULESET_NAME）は設定済みです"
    return
  fi

  read -p "production ブランチに保護ルールを設定しますか？ (Y/n): " PROTECT
  if [ "$PROTECT" = "n" ] || [ "$PROTECT" = "N" ]; then
    echo "[skip] ブランチ保護の設定をスキップしました"
    return
  fi

  # ruleset を取り込む。context だけはこのリポジトリの CI の呼び方に合わせる
  # （set -e 環境下でも失敗時に else 節へ到達できるよう if で直接判定する）
  RULESET_BODY=$(node -e "
    const fs = require('fs')
    const ruleset = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'))
    const context = process.argv[2]

    for (const rule of ruleset.rules ?? []) {
      if (rule.type !== 'required_status_checks') continue

      rule.parameters.required_status_checks = (
        rule.parameters.required_status_checks ?? []
      ).map((check) => (check.context === 'ci / ci' ? { context } : check))
    }

    process.stdout.write(JSON.stringify(ruleset))
  " "$RULESET_FILE" "$CI_CONTEXT")

  if printf '%s' "$RULESET_BODY" | gh api "repos/$REPO/rulesets" \
    --method POST \
    --input - > /dev/null; then
    echo "[done] production ブランチに保護ルール（$RULESET_NAME）を設定しました"
    echo "  - Required status checks: guard / $CI_CONTEXT"
    echo "  - PR 必須（レビュー承認は 0 件。複数人で回すなら UI で増やす）"
    echo "  - force push 禁止"
    echo "  - ブランチ削除禁止"
  else
    echo "[error] ブランチ保護の設定に失敗しました"
    echo "  → リポジトリの Admin 権限があるか確認してください"
    echo "  → Free プランのプライベートリポジトリでは Rulesets を使えません"
    echo "    （.claude/docs/git-workflow.md「マージルールの強制」を参照）"
  fi

  # legacy の branch protection が残っていると required check 名が二重管理になる
  if gh api "repos/$REPO/branches/production/protection" > /dev/null 2>&1; then
    echo "[warn] legacy の branch protection が残っています"
    echo "  → ruleset と二重管理になります。GitHub の Settings > Branches から削除するか、"
    echo "    gh api repos/$REPO/branches/production/protection --method DELETE"
  fi
}

# release/* / hotfix/* の保護ルール設定。
#
# CLAUDE.md「マージルール」の「release/* への直接コミット・push は禁止」は
# pre-git-guard.sh の承認確認だけでは支えられない（GitHub UI や他のクライアントからは
# 素通りする）。release/* への push は staging デプロイを発火するため、
# 未レビューの変更がそのまま staging に載る経路になる。サーバー側でも塞ぐ。
#
# ブランチ作成そのものは禁止しない（creation ルールを入れていない）。
# production から切って feat/* をマージした結果の初回 push は「作成」なので通り、
# 以降の更新だけが PR 経由に限定される
setup_release_protection() {
  RELEASE_RULESET_FILE="$(dirname "$0")/../.github/rulesets/release.json"
  if [ ! -f "$RELEASE_RULESET_FILE" ]; then
    echo "[skip] $RELEASE_RULESET_FILE が見つかりません"
    return
  fi

  RELEASE_RULESET_NAME=$(node -p \
    "JSON.parse(require('fs').readFileSync('$RELEASE_RULESET_FILE','utf8')).name" \
    2>/dev/null || echo 'release-protection')

  if gh api "repos/$REPO/rulesets" --jq '.[].name' 2>/dev/null |
    grep -qx "$RELEASE_RULESET_NAME"; then
    echo "[skip] release/* の保護ルール（$RELEASE_RULESET_NAME）は設定済みです"
    return
  fi

  read -p "release/* と hotfix/* に保護ルール（PR 必須）を設定しますか？ (Y/n): " PROTECT_RELEASE
  if [ "$PROTECT_RELEASE" = "n" ] || [ "$PROTECT_RELEASE" = "N" ]; then
    echo "[skip] release/* の保護ルールをスキップしました"
    return
  fi

  if gh api "repos/$REPO/rulesets" \
    --method POST \
    --input "$RELEASE_RULESET_FILE" > /dev/null; then
    echo "[done] release/* と hotfix/* に保護ルール（$RELEASE_RULESET_NAME）を設定しました"
    echo "  - 更新は PR 必須（QA 修正は fix/* を切って PR でマージする）"
    echo "  - ブランチの作成（production から切った初回 push）は従来どおり通る"
  else
    echo "[error] release/* の保護ルールの設定に失敗しました"
    echo "  → リポジトリの Admin 権限があるか確認してください"
    echo "  → Free プランのプライベートリポジトリでは Rulesets を使えません"
    echo "    （.claude/docs/git-workflow.md「マージルールの強制」を参照）"
  fi
}

# 同期される設定が前提にしているラベルを作る（#365）。
#
# ラベルはリポジトリの状態であってファイルではないので、Template Sync でも
# /init-project でも作られない。無いと Issue テンプレートのラベル指定は黙って
# 無視され、Template Sync は PR の作成で失敗する
# （→ .claude/docs/git-workflow.md「先に `template-sync` ラベルを作る」）。
#
#   template-sync   .github/workflows/template-sync.yml の pr_labels
#   dependencies    renovate/default.json の labels
#   security        renovate/default.json の vulnerabilityAlerts.labels
#   task            .github/ISSUE_TEMPLATE/task.yml
#   from-downstream .github/ISSUE_TEMPLATE/bug_report.yml / improvement.yml
#
# 既にあるラベルには触らない（--force は色と説明を上書きするので使わない）
REQUIRED_LABELS='template-sync:ededed dependencies:0366d6 security:d93f0b task:ededed from-downstream:ededed'

setup_labels() {
  if ! EXISTING_LABELS=$(gh label list --repo "$REPO" --limit 1000 --json name --jq '.[].name' 2>/dev/null); then
    echo "[skip] ラベルの一覧を取得できませんでした"
    echo "  → 手動で作る場合: gh label create <名前>（必要なラベルは scripts/setup.sh の REQUIRED_LABELS）"
    return
  fi

  MISSING_LABELS=''
  for entry in $REQUIRED_LABELS; do
    if ! printf '%s\n' "$EXISTING_LABELS" | grep -qxF "${entry%%:*}"; then
      MISSING_LABELS="$MISSING_LABELS $entry"
    fi
  done

  if [ -z "$MISSING_LABELS" ]; then
    echo "[skip] 必要なラベルは作成済みです"
    return
  fi

  MISSING_NAMES=$(for entry in $MISSING_LABELS; do printf '%s ' "${entry%%:*}"; done)
  read -p "不足しているラベル（${MISSING_NAMES% }）を作成しますか？ (Y/n): " CREATE_LABELS
  if [ "$CREATE_LABELS" = "n" ] || [ "$CREATE_LABELS" = "N" ]; then
    echo "[skip] ラベルの作成をスキップしました"
    return
  fi

  for entry in $MISSING_LABELS; do
    if gh label create "${entry%%:*}" --repo "$REPO" --color "${entry##*:}" > /dev/null 2>&1; then
      echo "[done] ラベル ${entry%%:*} を作成しました"
    else
      echo "[error] ラベル ${entry%%:*} の作成に失敗しました"
      echo "  → リポジトリの Issues への書き込み権限があるか確認してください"
    fi
  done
}

if detect_repo; then
  setup_branch_protection
  setup_release_protection
  setup_labels
fi

echo ""

# 依存インストール
read -p "yarn install を実行しますか？ (Y/n): " INSTALL
if [ "$INSTALL" != "n" ] && [ "$INSTALL" != "N" ]; then
  yarn install
  echo ""
  echo "[done] 依存関係をインストールしました"

  # packages/shared の dist を生成（tailwind.config.js などの Node ランタイム
  # から `require('<スコープ>/shared/theme')` を解決可能にするため）。
  #
  # ワークスペース名を書かずパスで指定する。/init-project がスコープを
  # リネームすると名前指定は存在しないワークスペースを指し、set -e で
  # ここから先（Template Sync の案内など）がまるごと出なくなる（#360）
  yarn turbo build --filter='./packages/shared'
  echo "[done] packages/shared をビルドしました"
fi

echo ""
echo "=== セットアップ完了 ==="
echo ""
echo "次のステップ:"
echo "  1. .env.develop に Firebase (develop) の設定値を入力"
echo "  2. yarn env:develop で develop 環境に切り替え"
echo "  3. yarn dev:web で Web 開発サーバーを起動"
echo "  4. yarn firebase:emulators で Firebase エミュレーターを起動"
echo ""
echo "環境の切り替え:"
echo "  yarn env:develop     → 開発環境"
echo "  yarn env:staging     → ステージング環境"
echo "  yarn env:production  → 本番環境"
echo ""
echo "デプロイ:"
echo "  yarn deploy:develop     → develop にデプロイ"
echo "  yarn deploy:staging     → staging にデプロイ"
echo "  yarn deploy:production  → production にデプロイ"
echo ""
# ruleset と違い、値を人が用意するため自動化できない。未登録だと Template Sync が
# 一度も動かないまま気付かれないので、セットアップの最後に案内だけ出す
echo "Template Sync の設定（派生プロジェクトのみ）:"
echo "  未登録だとテンプレートの更新が一度も届かない。GitHub App（推奨）か PAT"
echo "  template-sync ラベルが要る（無いと初回の PR 作成が失敗する。上のラベル作成で作られる）"
echo "  手順は .claude/docs/git-workflow.md「Template Sync の有効化」"
echo ""
