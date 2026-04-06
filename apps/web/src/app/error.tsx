'use client'

import { useEffect } from 'react'

// Sentry インストール後に有効化:
// import { Sentry } from '@/lib/sentry'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
    // Sentry インストール後に有効化:
    // Sentry.captureException(error)
  }, [error])

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h2 className="text-xl font-bold">エラーが発生しました</h2>
      <p className="text-gray-500">{error.message}</p>
      <button
        onClick={() => reset()}
        className="bg-primary-600 hover:bg-primary-700 rounded px-4 py-2 text-white"
      >
        再試行
      </button>
    </main>
  )
}
