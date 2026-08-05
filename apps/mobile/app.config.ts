import type { ExpoConfig } from 'expo/config'

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
  plugins: ['expo-router'],
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
    revenuecatApiKeyApple: process.env.REVENUECAT_API_KEY_APPLE ?? '',
    revenuecatApiKeyGoogle: process.env.REVENUECAT_API_KEY_GOOGLE ?? '',
  },
}

export default config
