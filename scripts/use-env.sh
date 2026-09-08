#!/bin/bash
set -e

# 使い方: bash scripts/use-env.sh [develop|staging|production]

ENV=${1:-develop}

if [ ! -f ".env.${ENV}" ]; then
  echo "[error] .env.${ENV} が見つかりません"
  echo "  作成: cp .env.example .env.${ENV} で作成し、値を入力してください"
  echo "  使い方: bash scripts/use-env.sh [develop|staging|production]"
  exit 1
fi

# apps/web/.env に配布する変数（SSR 実行時に読まれるサーバー専用の値）。
#
# framework-backed hosting（firebase.json の frameworksBackend）では、SSR 用の関数を
# firebase-tools が自動生成する。そのとき **hosting.source の .env だけ**が関数の .env に
# 取り込まれる（firebase-tools 14 の lib/frameworks/index.js）。.env.local は
# 同じディレクトリへコピーはされるが、関数の環境変数にはならない。
# つまり use-env.sh が apps/web/.env.local を書くだけでは、サーバー専用の変数が
# SSR 側で undefined になる（middleware の Basic 認証が dev/stg で効かない等）。
#
# NEXT_PUBLIC_* はここに要らない。next build がローカルで走り、ビルド時に値が
# 埋め込まれるため（アダプタは .next の成果物をコピーしてデプロイする）。
#
# 秘密はここに入れない。apps/functions/.env と同じ理由で、関数の環境変数は
# 閲覧者ロールでも Cloud Console / gcloud functions describe から読める。
# FIREBASE_SERVICE_ACCOUNT_KEY も入れない（Cloud Functions では ADC が自動で使われる）
WEB_SSR_ENV_KEYS=(
  BASIC_AUTH_CREDENTIALS
)

# layer:functions:start
# apps/functions/.env に配布する変数。
# Functions の .env はデプロイ時に関数の環境変数として取り込まれるため、
# ルートの .env をまるごとコピーせず、必要なキーだけを許可リストで抽出する
# （FIREBASE_SERVICE_ACCOUNT_KEY 等の不要なサーバー秘密を載せないため）。
# Functions に新しい環境変数を追加したらここにも追記すること
#
# 秘密（決済キー・Webhook の署名シークレット）はここに入れない。
# .env の値は関数の環境変数としてデプロイされ、閲覧者ロールでも
# Cloud Console / gcloud functions describe から読める。
# 秘密は Secret Manager へ（firebase functions:secrets:set。
# → apps/functions/src/lib/billing.ts と .claude/docs/billing.md）
FUNCTIONS_ENV_KEYS=(
  ALLOWED_ORIGINS
  # layer:billing:start
  REVENUECAT_ALLOW_SANDBOX
  STRIPE_ALLOW_TEST_MODE
  STRIPE_PRICE_IDS
  STRIPE_SUCCESS_URL
  STRIPE_CANCEL_URL
  STRIPE_PORTAL_RETURN_URL
  SYNC_SUBSCRIPTION_CLAIMS
  # layer:billing:end
  SENTRY_DSN
)
# layer:functions:end

# .env.<環境名> から指定キーの値を取り出す（前後のクォートは除去する）
read_env_value() {
  local key=$1
  local line
  line=$(grep -E "^${key}=" ".env.${ENV}" | tail -n 1 || true)
  if [ -z "${line}" ]; then
    return 0
  fi

  local value=${line#*=}
  value=${value%\"}
  value=${value#\"}
  value=${value%\'}
  value=${value#\'}
  printf '%s' "${value}"
}

# 許可リストのキーだけを抜き出して env ファイルを生成する。
#   write_env_file <出力先> <用途の説明> <キー…>
# 毎回作り直すのは、残ったまま環境を切り替えると前の環境の値が配られるため
write_env_file() {
  local destination=$1
  local description=$2
  shift 2

  {
    echo "# このファイルは scripts/use-env.sh が .env.${ENV} から生成しています。"
    echo "# 直接編集しても yarn env:<環境名> の実行で上書きされます。"
    echo "# 値を変更する場合は .env.${ENV} を編集してください。"
    echo "#"
    echo "# ${description}"
    echo ""

    local key line
    for key in "$@"; do
      line=$(grep -E "^${key}=" ".env.${ENV}" | tail -n 1 || true)
      if [ -n "${line}" ]; then
        echo "${line}"
      fi
    done
  } >"${destination}"
}

# layer:billing:start
# 本番キーの誤用ガード。
# development 環境に本番キーが入っていると、開発中の操作が実際の決済として
# 処理され、実在するカードに課金される。取り返しがつかないのでここで止める。
# STRIPE_SECRET_KEY は Secret Manager 管理になったので通常は空だが、
# 移行前の .env や手元の作業ファイルに残っている場合に備えて検査は残す
STRIPE_KEY=$(read_env_value STRIPE_SECRET_KEY)

if [ "${ENV}" != "production" ]; then
  case "${STRIPE_KEY}" in
    sk_live_* | rk_live_*)
      echo "[error] .env.${ENV} に本番の Stripe キーが設定されています"
      echo "  検出したキー: ${STRIPE_KEY:0:11}..."
      echo "  production 以外ではテストキー（sk_test_ / rk_test_）を使ってください。"
      echo "  本番キーのままだと開発中の操作が実際のカードに課金されます。"
      exit 1
      ;;
  esac
fi

if [ "${ENV}" = "production" ]; then
  case "${STRIPE_KEY}" in
    sk_test_* | rk_test_*)
      echo "[warn] .env.production に Stripe のテストキーが設定されています"
      echo "  本番で決済を受け付ける場合は本番キー（sk_live_）に差し替えてください。"
      ;;
  esac
fi

# テストモード許可のまま本番へ行くのを止める。
# .env.develop を複製して .env.production を作る運用だとフラグが残りやすく、
# 残ると「本番でテストモードの購入を適用しない」というガード自体が無力になる
if [ "${ENV}" = "production" ]; then
  if [ "$(read_env_value STRIPE_ALLOW_TEST_MODE)" = "true" ]; then
    echo "[error] .env.production で STRIPE_ALLOW_TEST_MODE=true になっています"
    echo "  テストモードの購入で本番の権利が付きます。空にしてください。"
    exit 1
  fi

  if [ "$(read_env_value REVENUECAT_ALLOW_SANDBOX)" = "true" ]; then
    echo "[error] .env.production で REVENUECAT_ALLOW_SANDBOX=true になっています"
    echo "  Sandbox の購入で本番の権利が付きます。空にしてください。"
    exit 1
  fi
fi
# layer:billing:end

# .env.local にコピー（ルート + apps/web）
# Next.js は apps/web/ の .env.local を読む
cp ".env.${ENV}" .env.local
cp ".env.${ENV}" apps/web/.env.local
echo "[done] .env.${ENV} → .env.local, apps/web/.env.local にコピーしました"

# apps/web/.env を許可リストのキーだけで生成する
write_env_file apps/web/.env \
  "framework-backed hosting では、このファイルの内容が SSR 関数の環境変数になります。" \
  "${WEB_SSR_ENV_KEYS[@]}"
echo "[done] .env.${ENV} → apps/web/.env を生成しました（SSR で読むキーのみ）"

# layer:mobile:start
# Expo (app.config.ts) は apps/mobile/ の .env.local を読む
cp ".env.${ENV}" apps/mobile/.env.local
echo "[done] .env.${ENV} → apps/mobile/.env.local にコピーしました"
# layer:mobile:end

# layer:functions:start
# apps/functions/.env を許可リストのキーだけで生成する。
# ここを配布しないと、環境を切り替えても Functions だけ前の環境のキーが残り、
# 例えば develop に切り替えたつもりで本番の Stripe / RevenueCat を叩いてしまう
write_env_file apps/functions/.env \
  "デプロイ時に、このファイルの内容が関数の環境変数として取り込まれます。" \
  "${FUNCTIONS_ENV_KEYS[@]}"
echo "[done] .env.${ENV} → apps/functions/.env を生成しました（Functions 用のキーのみ）"
# layer:functions:end

# Firebase プロジェクトを切り替え。
# ここで失敗を握りつぶすと、アクティブなプロジェクトが前の環境（例: production）の
# ままになり、次の firebase deploy が意図しない環境へ飛ぶため、必ず失敗させる
if firebase use "${ENV}"; then
  echo "[done] Firebase プロジェクトを ${ENV} に切り替えました"
else
  echo "[error] firebase use ${ENV} に失敗しました"
  echo "  .firebaserc に ${ENV} のエイリアスがあるか、firebase login 済みかを確認してください。"
  echo "  切り替えないまま進めると、次のデプロイが前の環境（本番の可能性あり）へ飛びます。"
  exit 1
fi

echo ""
echo "現在の環境: ${ENV}"
