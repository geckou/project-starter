const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')
const path = require('path')

const projectRoot = __dirname
const monorepoRoot = path.resolve(projectRoot, '../..')

// @sentry/react-native が入っていれば getSentryExpoConfig を使う。getDefaultConfig の
// ままだとバンドルに Debug ID が埋まらず、アップロードしたソースマップがイベントに
// 紐づかない（スタックが圧縮後のコードを指す）。任意依存なので、未インストールなら
// 従来どおり getDefaultConfig にフォールバックする
function loadGetConfig() {
  try {
    return require('@sentry/react-native/metro').getSentryExpoConfig
  } catch (error) {
    // パッケージが無い場合だけフォールバックする。入っているのに読み込みで
    // 落ちた場合は握らない（黙って Debug ID 無しのビルドになるため）
    // （message の 2 行目以降は Require stack なので、先頭だけを見る。パッケージの
    // 内側の require が失敗した場合もスタックにはパッケージ名が出る）
    if (
      error.code === 'MODULE_NOT_FOUND' &&
      error.message.startsWith(
        "Cannot find module '@sentry/react-native/metro'"
      )
    ) {
      return getDefaultConfig
    }

    throw error
  }
}

const config = loadGetConfig()(projectRoot)

// monorepo のルートから node_modules を解決
config.watchFolders = [monorepoRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
]

// package.json の "exports" フィールドを Metro に honor させる。
// これにより @geckou/shared の conditional exports（types→src / import→dist/esm /
// default→dist）が tsconfig の paths を介さず一貫した解決経路で扱われる。
// Metro の既定の条件名には import が入るので、掴むのは ESM 側（dist/esm）。
// これが無いと firebase SDK が二重インスタンスになる（→ .claude/docs/architecture.md）。
config.resolver.unstable_enablePackageExports = true

// nohoist により mobile は react@18 をローカルに持つが、ルートには web 用の
// react@19 や shared の依存（zustand, firebase）がホイストされている。
// shared 経由の import がルート側の別インスタンスに解決されると
// React の二重ロードや Firebase インスタンス不一致が起きるため、
// 以下のパッケージは常に mobile を起点に解決させる
const PINNED_PACKAGES = [
  'react',
  'react-dom',
  'react-native',
  'firebase',
  'zustand',
]

const defaultResolveRequest = config.resolver.resolveRequest

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = defaultResolveRequest ?? context.resolveRequest
  const pinned = PINNED_PACKAGES.find(
    (pkg) => moduleName === pkg || moduleName.startsWith(`${pkg}/`)
  )

  if (pinned) {
    return resolve(
      { ...context, originModulePath: path.join(projectRoot, 'index.js') },
      moduleName,
      platform
    )
  }

  return resolve(context, moduleName, platform)
}

module.exports = withNativeWind(config, { input: './src/global.css' })
