#!/usr/bin/env sh
# フックのプロジェクト固有設定。各フックが自身のディレクトリから読み込む。
#
# ここに集めているのは「フックのロジック」ではなく「このプロジェクトのスタックに依存する値」。
# フック本体（*.sh）はスタック非依存に保ち、Next.js / Firebase / yarn といった前提は
# 全てこのファイルに置く。派生プロジェクトがスタックを変えたときに直すのはここだけになる。
#
# このファイルは .templatesyncignore に登録してあるため、テンプレート更新で上書きされない。
# 逆に、テンプレート側で新しい設定項目が増えても自動では流れてこないので、
# フック本体は「この項目が無くても動く」ようにデフォルト値を持っている。
#
# 各項目は環境変数で一時的に上書きできる（例: HOOK_RUNNER=npm）。テスト用途にも使う。

# 実行するパッケージマネージャ（npm / pnpm / bun 等に変更可）。
# タスクは `<HOOK_RUNNER> run <タスク名>` の形で呼ばれるため、run を解釈できるものを指定する
HOOK_RUNNER=${HOOK_RUNNER:-'yarn'}

# DoD（機能の完了条件）として stop-dod-check.sh が実行するタスク。空白区切り
HOOK_DOD_TASKS=${HOOK_DOD_TASKS:-'type-check lint test'}

# DoD の対象になる「コードファイル」の拡張子。grep -E の選択肢としてそのまま使う。
# ドキュメントのみの変更で重い DoD を走らせないための絞り込み
HOOK_CODE_EXTENSIONS=${HOOK_CODE_EXTENSIONS:-'ts|tsx|js|jsx|mjs|cjs|rules'}

# 変更時に検証コマンドをリマインドするパスと、その文言。
# 1行 = <パスパターン><TAB><メッセージ>。パスパターンはファイル・ディレクトリのどちらでもよく、
# 絶対パス / リポジトリ相対パスの両方にマッチする。
HOOK_WATCH_PATHS=${HOOK_WATCH_PATHS:-'
firestore.rules	firestore.rules が変更されました。yarn test:rules でルールテスト（許可/拒否）を実行してください。
packages/shared	packages/shared が変更されました。全 workspace に影響するため yarn type-check を実行してください。
'}
