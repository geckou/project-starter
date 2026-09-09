// ルート package.json の workspaces を展開して、このリポジトリのワークスペース名を集める。
//
//   node scripts/lib/workspace-names.mjs [リポジトリのルート]
//
// 標準出力に 1 行 1 名で出す。
//
// **スコープ前置き（@geckou/ 等）で判定してはいけない。** npm へ公開している
// パッケージ（@geckou/ui-react / @geckou/billing 等）まで巻き込み、registry から
// 取り直せなくなる（#198）。派生でスコープをリネームしても壊れないようにするためにも、
// 実在する name の集合で判定する。
//
// 分けて持っているのは、scripts/deploy.sh が Cloud Build 向けに落とす依存と、
// scripts/test-deploy-install.sh が検査する形を**同じ規則**にするため。
// 2 か所に書くと、片方だけが実際のデプロイとずれる。

import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))

// 展開するのは 'apps/*' のような末尾 1 段のワイルドカードと、直接指定のパス。
// yarn の workspaces で使われるのはこの 2 つだけ
function workspaceDirectories(root) {
  const manifest = readJson(join(root, 'package.json'))
  const patterns = Array.isArray(manifest.workspaces)
    ? manifest.workspaces
    : (manifest.workspaces?.packages ?? [])

  const directories = new Set()

  for (const pattern of patterns) {
    if (!pattern.includes('*')) {
      directories.add(join(root, pattern))
      continue
    }

    const base = join(root, pattern.slice(0, pattern.indexOf('*')))
    if (!existsSync(base)) continue

    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (entry.isDirectory()) directories.add(join(base, entry.name))
    }
  }

  return directories
}

export function workspaceNames(root = '.') {
  const names = new Set()

  for (const directory of workspaceDirectories(root)) {
    const manifest = join(directory, 'package.json')
    if (!existsSync(manifest)) continue

    const { name } = readJson(manifest)
    if (name) names.add(name)
  }

  return names
}

// このリポジトリのワークスペースへの依存だけを落とす（引数のオブジェクトは変更しない）
export function withoutWorkspaceDependencies(dependencies, names) {
  const kept = {}

  for (const [dep, range] of Object.entries(dependencies ?? {})) {
    if (!names.has(dep)) kept[dep] = range
  }

  return kept
}

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  for (const name of workspaceNames(process.argv[2] ?? '.')) {
    console.log(name)
  }
}
