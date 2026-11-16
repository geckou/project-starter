import type { ExpoConfig } from 'expo/config'

type Plugins = NonNullable<ExpoConfig['plugins']>

/**
 * Sentry の config plugin（ソースマップ・dSYM のアップロードをネイティブビルドに組み込む）を、
 * アップロードできるビルドにだけ入れる。
 *
 * `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` が 1 つでも欠けたまま入れると、
 * Xcode の「Bundle React Native code and images」で sentry-cli のアップロードが失敗し、
 * ビルドごと止まる。揃っていなければアップロードしないだけで、ビルドは通る。
 * 3 つは EAS の Environment Variables に登録する（→ .claude/docs/architecture.md）。
 *
 * `isInstalled` は @sentry/react-native が入っているか。任意依存なので、未インストールの
 * プロジェクトに変数だけが届いても（.env.local は全文が配られる）プラグインの解決で落とさない。
 */
export function sentryPlugins(
  env: Record<string, string | undefined>,
  isInstalled: boolean
): Plugins {
  const organization = env.SENTRY_ORG
  const project = env.SENTRY_PROJECT

  if (!isInstalled || !env.SENTRY_AUTH_TOKEN || !organization || !project) {
    return []
  }

  // organization / project は秘密ではないので props でも渡す（渡さないとプラグインが
  // 「Missing config」の警告を出す）。トークンは渡さない（環境変数から読まれる）
  return [['@sentry/react-native/expo', { organization, project }]]
}

function isSentryInstalled(): boolean {
  try {
    require.resolve('@sentry/react-native/expo')
    return true
  } catch {
    return false
  }
}

// 静的な app.json では "${VAR}" のような環境変数置換は行われないため、
// 動的設定（app.config.ts）で process.env から値を注入する。
// .env.local は `yarn env:<環境名>`（scripts/use-env.sh）がこのディレクトリにも配布する
const config: ExpoConfig = {
  name: 'Geckou App',
  slug: 'geckou-app',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'geckou',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.geckou.app',
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#ffffff',
    },
    package: 'com.geckou.app',
  },
  plugins: ['expo-router', ...sentryPlugins(process.env, isSentryInstalled())],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    // push 通知を使う場合は `eas init` 実行後に extra.eas.projectId の追記が必要
    // （src/lib/push-notifications.ts が参照する）
    firebaseApiKey: process.env.FIREBASE_API_KEY ?? '',
    firebaseAuthDomain: process.env.FIREBASE_AUTH_DOMAIN ?? '',
    firebaseProjectId: process.env.FIREBASE_PROJECT_ID ?? '',
    firebaseStorageBucket: process.env.FIREBASE_STORAGE_BUCKET ?? '',
    firebaseMessagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID ?? '',
    firebaseAppId: process.env.FIREBASE_APP_ID ?? '',
    // Sentry の environment（src/lib/sentry.ts が読む）。EAS Build が入れるビルド
    // プロファイル名（development / preview / production）。手元のビルドは local
    sentryEnvironment: process.env.EAS_BUILD_PROFILE ?? 'local',
    // layer:billing:start
    revenuecatApiKeyApple: process.env.REVENUECAT_API_KEY_APPLE ?? '',
    revenuecatApiKeyGoogle: process.env.REVENUECAT_API_KEY_GOOGLE ?? '',
    // layer:billing:end
  },
}

export default config
