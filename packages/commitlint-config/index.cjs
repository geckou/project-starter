// コミットメッセージ規約: <type>: <description>（CLAUDE.md「コミットメッセージ規約」）
//
//   // commitlint.config.cjs
//   module.exports = { extends: ['@geckou/commitlint-config'] }
//
// type の値は CLAUDE.md「コミットメッセージ規約」と .claude/hooks/pre-git-guard.sh にも
// 書かれている（フックはシェルなので npm パッケージを参照できない）。
// type を増減するときは、この 3 箇所とも直す。
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'refactor', 'style', 'docs', 'test', 'chore'],
    ],
    // 日本語の description を許可するため大文字小文字ルールは無効化
    'subject-case': [0],
  },
}
