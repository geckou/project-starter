import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/', 'eslint.config.mjs'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      // フォーマット系ルールは Prettier に委譲
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_' },
      ],
      // 理由コメント付きの ts-ignore / ts-nocheck は許可
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-ignore': 'allow-with-description',
          'ts-nocheck': 'allow-with-description',
        },
      ],
    },
  }
)
