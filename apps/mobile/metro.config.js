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

module.exports = withNativeWind(config, { input: './src/global.css' })
