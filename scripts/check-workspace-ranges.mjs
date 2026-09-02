// リポジトリ内のパッケージ（packages/*）の version が、それを参照する
// ワークスペースの依存レンジを満たしているかを検査する。
//
//   node scripts/check-workspace-ranges.mjs
//
// 満たしていないと、yarn はローカルのパッケージではなく **npm 上の旧版を
// ダウンロードして使う**。lint も type-check も通ってしまい、
// yarn.lock に tarball の行が増えるのが唯一の手がかりになる
// （geckou/project-starter#159。minor を上げるたびに踏む）。
//
// node_modules に依存しない。semver そのものではなく、このリポジトリで
// 実際に使うレンジ表記だけを判定する（判定できない表記は素通しして警告する）。
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)
const WORKSPACE_GLOBS = ['apps', 'packages']
const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
]

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))

// apps/* と packages/* の package.json を集める
const collectWorkspaces = () =>
  WORKSPACE_GLOBS.flatMap((group) => {
    const dir = path.join(REPO_ROOT, group)

    if (!existsSync(dir)) {
      return []
    }

    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(dir, entry.name, 'package.json'))
      .filter((file) => existsSync(file))
      .map((file) => ({ file, json: readJson(file) }))
  })

// 全体一致で見る。前方一致にすると `>=1.2.0 <2.0.0` のような複合レンジから
// 先頭の 1.2.0 だけを拾って「判定できた」ことにしてしまう
const parseVersion = (value) => {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value.trim())

  return match ? match.slice(1, 4).map(Number) : null
}

// このリポジトリで使うレンジ表記だけを判定する。
// 判定できない場合は null を返し、呼び出し側で素通しする
const satisfies = (version, range) => {
  const trimmed = range.trim()

  if (
    trimmed === '*' ||
    trimmed === 'latest' ||
    trimmed.startsWith('workspace:')
  ) {
    return true
  }

  const parsed = parseVersion(version)

  if (!parsed) {
    return null
  }

  const [major, minor, patch] = parsed
  const bound = parseVersion(trimmed.replace(/^[\^~>=]+\s*/, ''))

  if (!bound) {
    return null
  }

  const [boundMajor, boundMinor, boundPatch] = bound
  const notLower =
    major > boundMajor ||
    (major === boundMajor &&
      (minor > boundMinor || (minor === boundMinor && patch >= boundPatch)))

  // ^0.2.0 は 0.2.x のみ（0 系は minor が major の役割を持つ）
  if (trimmed.startsWith('^')) {
    if (boundMajor === 0) {
      return major === 0 && minor === boundMinor && notLower
    }

    return major === boundMajor && notLower
  }

  if (trimmed.startsWith('~')) {
    return major === boundMajor && minor === boundMinor && notLower
  }

  if (trimmed.startsWith('>=')) {
    return notLower
  }

  if (/^\d/.test(trimmed)) {
    return trimmed === version
  }

  return null
}

const workspaces = collectWorkspaces()

// name -> { version, file }。private でも参照はされうるので全部入れる
const local = new Map(
  workspaces
    .filter(({ json }) => json.name && json.version)
    .map(({ file, json }) => [json.name, { version: json.version, file }])
)

const problems = []
const unknown = []

for (const { file, json } of workspaces) {
  for (const field of DEPENDENCY_FIELDS) {
    for (const [name, range] of Object.entries(json[field] ?? {})) {
      const target = local.get(name)

      if (!target || typeof range !== 'string') {
        continue
      }

      const result = satisfies(target.version, range)

      if (result === null) {
        unknown.push({ file, field, name, range })
        continue
      }

      if (!result) {
        problems.push({ file, field, name, range, version: target.version })
      }
    }
  }
}

const relative = (file) => path.relative(REPO_ROOT, file)

for (const { file, field, name, range } of unknown) {
  console.warn(
    `[warn] レンジを判定できません: ${relative(file)} の ${field}.${name} = ${range}`
  )
}

if (problems.length === 0) {
  console.log(
    `[ok] ${workspaces.length} ワークスペースの参照レンジはローカルの version を満たしています`
  )
  process.exit(0)
}

console.error(
  'ワークスペースの参照レンジがローカルの version を満たしていません。'
)
console.error(
  'このままだと yarn が npm 上の旧版を落としてきて、ローカルの変更が使われません。'
)
console.error('')

for (const { file, field, name, range, version } of problems) {
  console.error(`  ${relative(file)}`)
  console.error(`    ${field}.${name}: "${range}" → "^${version}"`)
}

console.error('')
console.error('上記を書き換えてから yarn install を実行してください。')
process.exit(1)
