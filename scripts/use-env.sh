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

# apps/functions/.env に配布する変数。
# Functions の .env はデプロイ時に関数の環境変数として取り込まれるため、
# ルートの .env をまるごとコピーせず、必要なキーだけを許可リストで抽出する
# （FIREBASE_SERVICE_ACCOUNT_KEY 等の不要なサーバー秘密を載せないため）。
# Functions に新しい環境変数を追加したらここにも追記すること
FUNCTIONS_ENV_KEYS=(
  ALLOWED_ORIGINS
  REVENUECAT_WEBHOOK_AUTH
  STRIPE_SECRET_KEY
  STRIPE_WEBHOOK_SECRET
  STRIPE_PRICE_IDS
  STRIPE_SUCCESS_URL
  STRIPE_CANCEL_URL
  STRIPE_PORTAL_RETURN_URL
  SYNC_SUBSCRIPTION_CLAIMS
  SENTRY_DSN
)

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

# 本番キーの誤用ガード。
# development 環境に本番キーが入っていると、開発中の操作が実際の決済として
# 処理され、実在するカードに課金される。取り返しがつかないのでここで止める
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

# .env.local にコピー（ルート + apps/web + apps/mobile）
# Next.js は apps/web/、Expo (app.config.ts) は apps/mobile/ の .env.local を読む
cp ".env.${ENV}" .env.local
cp ".env.${ENV}" apps/web/.env.local
cp ".env.${ENV}" apps/mobile/.env.local
echo "[done] .env.${ENV} → .env.local, apps/web/.env.local, apps/mobile/.env.local にコピーしました"

# apps/functions/.env を許可リストのキーだけで生成する。
# ここを配布しないと、環境を切り替えても Functions だけ前の環境のキーが残り、
# 例えば develop に切り替えたつもりで本番の Stripe / RevenueCat を叩いてしまう
{
  echo "# このファイルは scripts/use-env.sh が .env.${ENV} から生成しています。"
  echo "# 直接編集しても yarn env:<環境名> の実行で上書きされます。"
  echo "# 値を変更する場合は .env.${ENV} を編集してください。"
  echo ""
  for key in "${FUNCTIONS_ENV_KEYS[@]}"; do
    line=$(grep -E "^${key}=" ".env.${ENV}" | tail -n 1 || true)
    if [ -n "${line}" ]; then
      echo "${line}"
    fi
  done
} > apps/functions/.env
echo "[done] .env.${ENV} → apps/functions/.env を生成しました（Functions 用のキーのみ）"

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
