import Constants from 'expo-constants'
import type { ComponentType } from 'react'

import { forwardConsoleError } from './sentry-console'

// @sentry/react-native は任意依存（入れるまでこのファイルは何もしない）。
// 型は `import type` ではなく import() 型で取り、未インストールの間は下の抑制で any に落とす。
// インストール後は抑制が無くても通る。
// @ts-ignore -- @sentry/react-native をインストール後にこの行を削除
type SentryModule = typeof import('@sentry/react-native')

// 静的 import にしない。ルートレイアウトがこのファイルを読むので、静的 import だと
// パッケージを入れていないプロジェクトのバンドルが解決エラーで落ちる。
// try の中の require は Metro が任意依存として扱い、解決できなければ実行時の throw になる
// （@expo/metro-config が allowOptionalDependencies を有効にしている）。
function loadSentry(): SentryModule | null {
  try {
    return require('@sentry/react-native') as SentryModule
  } catch {
    return null
  }
}

/** 未インストールなら null */
export const Sentry = loadSentry()

let isInitialized = false

/**
 * Sentry を初期化する。ルートレイアウトのモジュール先頭で 1 回だけ呼ぶ
 * （`wrapWithSentry` より先に呼ぶ必要がある）。
 *
 * パッケージが未インストール、または `EXPO_PUBLIC_SENTRY_DSN` が未設定なら何もしない。
 */
export function initSentry() {
  if (isInitialized || !Sentry) return

  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN

  if (!dsn) return

  Sentry.init({
    dsn,
    // 渡さないと配布ビルドが全て production になり、preview / staging と本番を
    // 区別できない。値は app.config.ts が EAS のビルドプロファイル名から入れる
    environment: Constants.expoConfig?.extra?.sentryEnvironment ?? 'local',
    tracesSampleRate: 0.1,
  })

  isInitialized = true

  // 開発中は転送しない（React の開発時警告まで送ってしまうため）
  if (!__DEV__) forwardConsoleError(console, Sentry)
}

/**
 * ルートレイアウトを `Sentry.wrap` で包む（タップのパンくずと画面の計測が付く）。
 *
 * 初期化していないときは包まずにそのまま返す。包むと「wrap が init より先に
 * 呼ばれた」という警告が出るため。
 *
 * `Sentry.wrap` は描画中の例外を拾わない。拾いたい場合は `Sentry.ErrorBoundary` を別に置く。
 */
export function wrapWithSentry<Props extends Record<string, unknown>>(
  component: ComponentType<Props>
): ComponentType<Props> {
  if (!isInitialized || !Sentry) return component

  return Sentry.wrap(component)
}
