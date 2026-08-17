import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  { ignores: ['eslint.config.mjs'] },
  ...tseslint.configs.recommended,
  reactHooks.configs['recommended-latest'],
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
