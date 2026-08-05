// コミットメッセージ規約: <type>: <description>（CLAUDE.md 参照）
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
