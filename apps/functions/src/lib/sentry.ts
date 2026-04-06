// @ts-nocheck -- @sentry/node をインストール後にこの行を削除
import * as Sentry from '@sentry/node'

export function initSentry() {
  const dsn = process.env.SENTRY_DSN
  if (!dsn) return

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'production',
    tracesSampleRate: 0.1,
  })
}

export { Sentry }
