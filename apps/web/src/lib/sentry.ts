// @ts-nocheck -- @sentry/nextjs をインストール後にこの行を削除
import * as Sentry from '@sentry/nextjs'

export function initSentry() {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return

  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
  })
}

export { Sentry }
