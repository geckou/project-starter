const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')
const path = require('path')

const projectRoot = __dirname
const monorepoRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

// monorepo のルートから node_modules を解決
config.watchFolders = [monorepoRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
]

// package.json の "exports" フィールドを Metro に honor させる。
// これにより @geckou/shared の conditional exports（types→src / default→dist）
// が tsconfig の paths を介さず一貫した解決経路で扱われる。
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
