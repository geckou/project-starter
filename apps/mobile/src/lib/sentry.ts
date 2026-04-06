// @ts-nocheck -- @sentry/react-native をインストール後にこの行を削除
import * as Sentry from '@sentry/react-native'

export function initSentry() {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN
  if (!dsn) return

  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
  })
}

export { Sentry }
