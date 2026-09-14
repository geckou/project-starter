#!/bin/bash
set -e

# Prettier の実行。--check を付けるとチェックのみ（書き換えない）。
#
# 先に packages/ をビルドする理由:
# prettier-plugin-tailwindcss は .prettierrc.cjs の tailwindStylesheet から
# apps/web/src/styles/globals.css → @config → apps/web/tailwind.config.ts と辿る。
# この設定は @geckou/shared/theme を import しており、exports が dist を指すため
# packages/shared がビルドされていないと解決に失敗する。
# その場合プラグインは既定の Tailwind 設定にフォールバックし、テンプレート独自の
# クラス（primary-* 等）を知らないまま異なる順序に並べ替える。
# MODULE_NOT_FOUND は Prettier の終了コードに影響しないため、黙って誤った結果になる。
#
# 実体を package.json ではなくこのスクリプトに置いているのは、
# ルート package.json が Template Sync の対象外（.templatesyncignore）だから。
# scripts/ と .github/workflows/ は同期対象なので、両者からこれを呼ぶ。

cd "$(dirname "$0")/.."
export PATH="$PWD/node_modules/.bin:$PATH"

# パッケージ名をハードコードしないディレクトリ指定。
# turbo のキャッシュが効くので、変更が無ければ実質ノーコスト
turbo build --filter='./packages/*'

# prettier-plugin-tailwindcss は、インストールされている Tailwind が
# tailwindStylesheet（v4 専用のオプション）に対応していないと、警告を出して
# **オプションを黙って無視する**。終了コードは 0 のままなので、
# デフォルトテーマ基準で並べ替えた結果が CI を素通りする（#359）。
#
# Tailwind v3 のアプリ（Expo / 静的サイト等）を同居させると、ルートへ v3 が
# ホイストされてこの状態になる。気付かないまま大量のファイルが並べ替えられ、
# 後で設定を直すと同じファイルが再び全部並べ替わるので、ここで落とす
warn_ignored_tailwind_option() {
  echo ""
  echo "[error] prettier-plugin-tailwindcss が tailwindStylesheet を無視しています。"
  echo "  インストールされている Tailwind が v4 ではありません"
  echo "  （v3 のアプリを同居させると、ルートに v3 がホイストされます）。"
  echo "  .prettierrc.cjs の overrides で、v4 のアプリにだけ tailwindStylesheet を、"
  echo "  v3 のアプリには tailwindConfig を指定してください。"
}

run_prettier() {
  local output status

  set +e
  output=$(prettier "$@" 2>&1)
  status=$?
  set -e

  printf '%s\n' "$output"

  if printf '%s' "$output" | grep -q 'does not support this feature'; then
    warn_ignored_tailwind_option
    return 1
  fi

  return "$status"
}

if [ "${1:-}" = "--check" ]; then
  run_prettier --check .
else
  # **書き込む前に**警告を見る。--write で走らせてから気付いても、その時点で
  # 全ファイルがデフォルトテーマ基準の順序に書き換わっている（元に戻すには
  # 設定を直してもう一度全部並べ替えることになる）。
  #
  # --check は整形が必要なファイルがあれば非ゼロで終わるが、ここで見たいのは
  # 警告だけなので終了コードは使わない
  set +e
  probe=$(prettier --check . 2>&1)
  set -e

  if printf '%s' "$probe" | grep -q 'does not support this feature'; then
    warn_ignored_tailwind_option
    exit 1
  fi

  run_prettier --write .
fi
