---
name: new-form
description: バリデーション付きフォームコンポーネントの作成
---

# new-form

フォームコンポーネントを作成する。

## 基本方針

- `'use client'` が必須（フォームはクライアントコンポーネント）
- `useState` でフォーム状態を管理する
- バリデーションはフォーム送信時に実行する
- エラーメッセージはフィールドごとに表示する
- 送信中は二重送信を防止する（`loading` 状態）
- API 呼び出しは `@/lib/api-client` の `apiClient()` を使う

## テンプレート

```typescript
'use client'

import { useState } from 'react'
import { apiClient } from '@/lib/api-client'

type FormData = {
  title: string
  content: string
}

type FormErrors = Partial<Record<keyof FormData, string>>

function validate(data: FormData): FormErrors {
  const errors: FormErrors = {}

  if (!data.title.trim()) {
    errors.title = 'タイトルは必須です'
  }

  if (!data.content.trim()) {
    errors.content = '内容は必須です'
  }

  return errors
}

export function PostForm() {
  const [formData, setFormData] = useState<FormData>({
    title: '',
    content: '',
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const [loading, setLoading] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    // 入力時にそのフィールドのエラーをクリア
    if (errors[name as keyof FormData]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError(null)

    const validationErrors = validate(formData)
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      return
    }

    setLoading(true)

    try {
      const result = await apiClient('/posts', {
        method: 'POST',
        body: formData,
      })

      if (!result.success) {
        setSubmitError(result.error || '送信に失敗しました')
        return
      }

      // 成功時の処理（リダイレクト、リセット等）
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="title" className="block text-sm font-medium">
          タイトル
        </label>
        <input
          id="title"
          name="title"
          value={formData.title}
          onChange={handleChange}
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
        />
        {errors.title && (
          <p className="mt-1 text-sm text-red-600">{errors.title}</p>
        )}
      </div>

      <div>
        <label htmlFor="content" className="block text-sm font-medium">
          内容
        </label>
        <textarea
          id="content"
          name="content"
          value={formData.content}
          onChange={handleChange}
          rows={4}
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
        />
        {errors.content && (
          <p className="mt-1 text-sm text-red-600">{errors.content}</p>
        )}
      </div>

      {submitError && <p className="text-sm text-red-600">{submitError}</p>}

      <button
        type="submit"
        disabled={loading}
        className="rounded bg-primary-600 px-4 py-2 text-white hover:bg-primary-700 disabled:opacity-50"
      >
        {loading ? '送信中...' : '送信'}
      </button>
    </form>
  )
}
```

## 配置ルール

- 汎用フォーム（ログイン等）: `components/auth/` や `components/ui/`
- 機能固有フォーム: `components/<feature>/`（例: `components/posts/PostForm.tsx`）

## バリデーションパターン

| チェック       | 例                                                       |
| -------------- | -------------------------------------------------------- |
| 必須           | `if (!value.trim()) errors.field = '必須です'`           |
| 文字数制限     | `if (value.length > 100) errors.field = '100文字以内'`   |
| メール形式     | `if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))`        |
| パスワード強度 | `if (value.length < 8) errors.password = '8文字以上'`    |
| 一致確認       | `if (a !== b) errors.confirm = '一致しません'`           |
