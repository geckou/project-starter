#!/usr/bin/env node
// 既存の派生プロジェクトを「参照方式」（#131）へ移行する。
//
//   node scripts/adopt-references.mjs --repo ../some-derived-project
//   node scripts/adopt-references.mjs --repo ../some-derived-project --dry-run
//
// 参照方式 = CI（reusable workflow）と依存更新（Renovate preset）の中身をコピーせず、
// テンプレート側を参照する形。手作業で移行すると、移行そのものよりも
// 「テンプレートとの設定差分」で CI が落ちる（#139）。その差分をここで機械的に埋める。
//
// やること:
//   1. .github/workflows/ci.yml を推奨形で「生成」する（既存の書き換えではない。
//      古いトリガーを引き継ぐと production への push で CI と deploy が二重実行になる）
//   2. .templatesyncignore に .github/workflows/ci.yml を追加する
//   3. renovate.json5 を生成する（apps/mobile があれば //renovate/mobile も extends）
//   4. テンプレートとの設定差分を埋める（.prettierignore の生成ファイル除外）
//   5. 第0層の設定（#132）を参照形にする。各ワークスペースの eslint.config.mjs・
//      .prettierrc.cjs（古い .prettierrc は削除する）・commitlint.config.cjs を生成し、
//      package.json の依存を @geckou/*-config に入れ替える
//   6. 人にしかできない残作業を印字する
//
// 触らないもの:
//   - package.json の resolutions（派生ごとに値が違う。.claude/docs/dependencies.md
//     「配れないもの」。自動で書き換えると派生固有のピン留めを壊す）
//   - テンプレートの既知の形と一致しない設定ファイル（派生が独自ルールを足している）。
//     差分を印字して人に渡す。--force を付けたときだけ上書きする
//   - scripts/ の配布（Template Sync の役割。届いていない構成でも CI が通ることは
//     ci.yml のフォールバックで担保済み）
//
// 冪等（2 回流しても差分が出ない）。node_modules に依存しないので yarn install なしで動く。

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { stripBlocks } from './lib/layers.mjs'

const TEMPLATE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)

const CI_WORKFLOW_PATH = '.github/workflows/ci.yml'
const TEMPLATE_SYNC_IGNORE_PATH = '.templatesyncignore'
const RENOVATE_CONFIG_PATH = 'renovate.json5'
const PRETTIER_IGNORE_PATH = '.prettierignore'

// 派生プロジェクトが持つ ci.yml の推奨形。中身はテンプレート側の reusable workflow を見る。
//
// production への push を含めないのは、deploy.yml の deploy ジョブが同じチェックを
// 実行するため（トリガーを引き継ぐと check が二重に走る。#139 の実測）。
const CI_WORKFLOW_CONTENT = `name: CI

# 中身はテンプレート側の reusable workflow を参照する（コピーしない）。
# チェック内容の修正は geckou/project-starter の 1 コミットで取り込み作業ゼロで届く。
# 詳細は .claude/docs/git-workflow.md の「CI の配布（reusable workflow）」を参照。
#
# このファイルは scripts/adopt-references.mjs が生成した推奨形。
# production への push をトリガーに含めないのは、deploy.yml が同じチェックを
# 実行するため（含めると check が二重に走る）。
on:
  pull_request:
    branches: [production, 'release/**']
    # アプリの動作に影響しない変更では回さない（Actions 分の節約）
    paths-ignore:
      - '**/*.md'
      - '.claude/docs/**'
      - '.claude/skills/**'
      - '.claude/launch.json'
      - '.vscode/**'
      - '.editorconfig'
      - 'LICENSE'

# 同じ PR に連続 push したとき、古い実行を打ち切る
concurrency:
  group: ci-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  ci:
    uses: geckou/project-starter/.github/workflows/ci.yml@v1
`

const TEMPLATE_SYNC_IGNORE_HEADER = `# Template Sync の対象外（派生プロジェクト固有にカスタマイズするファイル）
`

// テンプレートには有るが古い派生には無いことがある、生成ファイルの除外。
// 無いと prettier --check が生成物で落ちる（#139 の実測）。
const PRETTIER_IGNORE_ENTRIES = [
  {
    comment: '# FlatCompat が生成する一時ファイル',
    entry: 'apps/mobile/.eslintrc.js',
    layer: 'mobile',
  },
  {
    comment: '# expo customize が生成する型定義ファイル',
    entry: 'apps/mobile/expo-env.d.ts',
    layer: 'mobile',
  },
]

// 人にしかできない残作業（GitHub / Mend の管理画面での操作）
const MANUAL_STEPS = [
  'Renovate の GitHub App をインストールし、Mend（app.mend.io）で Silent mode を OFF / Automated PRs を ON にする（→ .claude/docs/dependencies.md）',
  'リポジトリ設定で Dependency graph と Dependabot alerts を有効化する（vulnerabilityAlerts がこれを読む）',
  'ブランチ保護の Required status check の名前を `ci / ci` に変える（reusable workflow はチェック名が「呼び出し側のジョブ ID / 呼ばれる側のジョブ ID」になる）',
  'Template Sync（.github/workflows/template-sync.yml と TEMPLATE_SYNC_TOKEN）を設定する',
  'Dependabot の設定ファイルが残っていれば削除する（Renovate と PR が二重に立つ）',
]

// 依存を入れ替えたときだけ必要になる残作業
const INSTALL_STEP =
  'yarn install を実行して yarn.lock を更新する（依存を入れ替えたため古くなっている）'

function parseArguments(argv) {
  const options = { repo: null, dryRun: false, force: false, help: false }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]

    if (argument === '--repo') {
      index += 1
      options.repo = argv[index] ?? ''
    } else if (argument === '--dry-run') {
      options.dryRun = true
    } else if (argument === '--force') {
      options.force = true
    } else if (argument === '--help' || argument === '-h') {
      options.help = true
    } else {
      throw new Error(`不明なオプションです: ${argument}`)
    }
  }

  return options
}

function usage() {
  return [
    '使い方: node scripts/adopt-references.mjs --repo <派生プロジェクトのパス> [--dry-run] [--force]',
    '',
    '  --repo      移行する派生プロジェクトのルート（必須）',
    '  --dry-run   差分を表示するだけでファイルは書かない',
    '  --force     テンプレートの既知の形と一致しない設定ファイルも上書きする',
  ].join('\n')
}

function resolveRepository(repo) {
  if (!repo) {
    throw new Error('--repo で派生プロジェクトのパスを指定してください')
  }

  const root = path.resolve(repo)

  if (!fs.existsSync(root)) {
    throw new Error(`パスがありません: ${root}`)
  }

  if (!fs.existsSync(path.join(root, '.git'))) {
    throw new Error(`git リポジトリではありません: ${root}`)
  }

  if (!fs.existsSync(path.join(root, 'package.json'))) {
    throw new Error(`package.json がありません: ${root}`)
  }

  // テンプレート自身を対象にすると、参照される側の reusable workflow を
  // 参照するだけのファイルで潰してしまう
  if (isTemplateRepository(root)) {
    throw new Error(
      `テンプレート自身は移行対象にできません（参照される側です）: ${root}`
    )
  }

  return root
}

// テンプレート自身か。ファイルの有無では判定しない（renovate/ も reusable workflow の
// 実体も Template Sync で派生へ配られるため、派生にも存在する）。
// このスクリプトを動かしているリポジトリ本体か、origin がテンプレートを指すかで見る
function isTemplateRepository(root) {
  if (root === TEMPLATE_ROOT) return true

  const config = readFileOrNull(path.join(root, '.git/config'))

  return config !== null && /geckou\/project-starter(\.git)?\s*$/m.test(config)
}

function readFileOrNull(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null
}

// 層構成は実ファイルで判定する。layers.json を持たない古い派生でも動く必要がある
function detectLayers(root) {
  return { mobile: fs.existsSync(path.join(root, 'apps/mobile')) }
}

// 望ましい内容を作り、既存と違うときだけ変更として返す
function planFile(root, relativePath, content) {
  const file = path.join(root, relativePath)
  const current = readFileOrNull(file)

  if (current === content) return null

  return {
    file: relativePath,
    action: current === null ? '作成' : '更新',
    content,
  }
}

function planCiWorkflow(root) {
  return planFile(root, CI_WORKFLOW_PATH, CI_WORKFLOW_CONTENT)
}

// ci.yml は派生側で生成する形になるため、テンプレート側の実体（reusable workflow の
// 本体）で上書きされないように Template Sync の対象から外す
function planTemplateSyncIgnore(root) {
  const current = readFileOrNull(path.join(root, TEMPLATE_SYNC_IGNORE_PATH))

  if (current !== null && hasEntry(current, CI_WORKFLOW_PATH)) return null

  const base = current === null ? TEMPLATE_SYNC_IGNORE_HEADER : current
  const separator = base.endsWith('\n') ? '' : '\n'
  const content = `${base}${separator}
# CI は reusable workflow の参照だけを持つ（テンプレート側の実体で上書きしない）
${CI_WORKFLOW_PATH}
`

  return planFile(root, TEMPLATE_SYNC_IGNORE_PATH, content)
}

// コメント行を除いて、その行そのものが含まれているか
function hasEntry(content, entry) {
  return content
    .split('\n')
    .some((line) => line.trim() === entry && !line.trim().startsWith('#'))
}

// テンプレートの renovate.json5 を単一の正とし、mobile 層が無ければマーカー範囲を落とす
function planRenovateConfig(root, layers) {
  const template = fs.readFileSync(
    path.join(TEMPLATE_ROOT, RENOVATE_CONFIG_PATH),
    'utf8'
  )
  const content = layers.mobile
    ? template
    : collapseSingleEntryExtends(stripBlocks(template, ['mobile']))

  return planFile(root, RENOVATE_CONFIG_PATH, content)
}

// Prettier は要素が 1 つで 80 桁に収まる配列を 1 行に畳む。マーカーを落とした結果
// extends が 1 要素になったときは生成時点で同じ形にしておく（派生側の
// Format Check が「生成した直後のファイル」で落ちないようにするため）。
// mobile ありのときは配列内のコメントが畳みを止めるので、そのままでよい
function collapseSingleEntryExtends(content) {
  return content.replace(
    /( *)extends: \[\n *('[^']*'),\n *\],/,
    (match, indent, entry) => {
      const collapsed = `${indent}extends: [${entry}],`

      return collapsed.length <= 80 ? collapsed : match
    }
  )
}

// テンプレートとの設定差分を埋める。生成ファイルの除外が無いと prettier --check が落ちる
function planPrettierIgnore(root, layers) {
  const current = readFileOrNull(path.join(root, PRETTIER_IGNORE_PATH))

  if (current === null) {
    // .prettierignore ごと無い構成は、テンプレートのものをそのまま置く
    // （mobile が無ければ mobile 向けの除外は落とす）
    const template = fs.readFileSync(
      path.join(TEMPLATE_ROOT, PRETTIER_IGNORE_PATH),
      'utf8'
    )
    const content = layers.mobile
      ? template
      : dropEntries(
          template,
          PRETTIER_IGNORE_ENTRIES.filter((item) => item.layer === 'mobile')
        )

    return planFile(root, PRETTIER_IGNORE_PATH, content)
  }

  const missing = PRETTIER_IGNORE_ENTRIES.filter(
    (item) => layers[item.layer] === true && !hasEntry(current, item.entry)
  )

  if (missing.length === 0) return null

  const separator = current.endsWith('\n') ? '' : '\n'
  const appended = missing
    .map((item) => `\n${item.comment}\n${item.entry}\n`)
    .join('')

  return planFile(
    root,
    PRETTIER_IGNORE_PATH,
    `${current}${separator}${appended}`
  )
}

// コメント行つきで書かれている項目を、コメントごと落とす
function dropEntries(content, items) {
  const dropped = new Set(items.map((item) => item.entry))
  const comments = new Set(items.map((item) => item.comment))

  return content
    .split('\n')
    .filter((line) => !dropped.has(line.trim()) && !comments.has(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n+$/, '\n')
}

const ESLINT_CONFIG_FILE = 'eslint.config.mjs'
const PRETTIER_CONFIG_PATH = '.prettierrc.cjs'
const LEGACY_PRETTIER_CONFIG_PATH = '.prettierrc'
const COMMITLINT_CONFIG_PATH = 'commitlint.config.cjs'

// 公開元の実体（派生では消す。消し忘れていても移行対象にはしない）
const CONFIG_PACKAGE_NAMES = new Set([
  '@geckou/eslint-config',
  '@geckou/prettier-config',
  '@geckou/commitlint-config',
])

// 生成する参照形。テンプレート側の実体（apps/web/eslint.config.mjs 等）と同じ内容を持つ。
// テンプレートから読まずに持つのは、mobile 層を外したクローンでも動くようにするため。
// 内容の一致は scripts/test-adopt-references.sh が検証する
const ESLINT_CONFIG_CONTENT = {
  base: `// 中身はテンプレート側の共有設定（@geckou/eslint-config）を参照する。コピーしない。
import geckou from '@geckou/eslint-config'

export default geckou
`,
  next: `// 中身はテンプレート側の共有設定（@geckou/eslint-config）を参照する。コピーしない。
// プロジェクト固有のルールを足す場合だけ、この配列に足す。
import next from '@geckou/eslint-config/next'

export default next
`,
  expo: `// 中身はテンプレート側の共有設定（@geckou/eslint-config）を参照する。コピーしない。
import expo from '@geckou/eslint-config/expo'

export default expo
`,
}

const COMMITLINT_CONFIG_CONTENT = `// 中身はテンプレート側の共有設定（@geckou/commitlint-config）を参照する。コピーしない。
module.exports = { extends: ['@geckou/commitlint-config'] }
`

// 参照方式より前のテンプレートが配っていた形。これと一致する（＝派生が独自ルールを
// 足していない）ときだけ生成で置き換える。一致しないものは触らず、差分を印字して人に渡す
const LEGACY_ESLINT_CONFIG_CONTENT = {
  base: `import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/', 'eslint.config.mjs'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      // フォーマット系ルールは Prettier に委譲
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_' },
      ],
      // 理由コメント付きの ts-ignore / ts-nocheck は許可
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-ignore': 'allow-with-description',
          'ts-nocheck': 'allow-with-description',
        },
      ],
    },
  }
)
`,
  next: `import { FlatCompat } from '@eslint/eslintrc'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const compat = new FlatCompat({ baseDirectory: __dirname })

export default [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'next-env.d.ts',
      'eslint.config.mjs',
      '.eslintrc.*',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript', 'prettier'),
  {
    rules: {
      // フォーマット系ルールは Prettier に委譲（eslint-config-prettier で無効化済み）
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
        },
      ],
      'import/order': [
        'warn',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
          ],
          'newlines-between': 'always',
          alphabetize: { order: 'asc' },
        },
      ],
    },
  },
]
`,
  expo: `import { FlatCompat } from '@eslint/eslintrc'
import typescriptEslint from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const compat = new FlatCompat({ baseDirectory: __dirname })

export default [
  {
    ignores: ['eslint.config.mjs', '.eslintrc.*'],
  },
  ...compat.extends('expo', 'prettier'),
  {
    plugins: {
      '@typescript-eslint': typescriptEslint,
    },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2020,
      sourceType: 'module',
    },
    rules: {
      // フォーマット系ルールは Prettier に委譲
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_' },
      ],
      'import/no-unresolved': [
        'error',
        {
          ignore: [
            '^expo-notifications$',
            '^expo-device$',
            '^@sentry/react-native$',
          ],
        },
      ],
    },
  },
]
`,
}

const LEGACY_COMMITLINT_CONFIG_CONTENT = `// コミットメッセージ規約: <type>: <description>（CLAUDE.md 参照）
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'refactor', 'style', 'docs', 'test', 'chore'],
    ],
    // 日本語の description を許可するため大文字小文字ルールは無効化
    'subject-case': [0],
  },
}
`

// 参照方式より前の .prettierrc（JSON）。tailwindStylesheet だけは派生ごとに違うので比較しない
const LEGACY_PRETTIER_CONFIG = {
  semi: false,
  singleQuote: true,
  tabWidth: 2,
  trailingComma: 'es5',
  printWidth: 80,
  plugins: ['prettier-plugin-tailwindcss'],
}

// Prettier が .prettierrc.cjs より先に読む設定ファイル。残っていると参照が効かず、
// 古いコピーが黙って使われ続ける（packages/README.md「派生プロジェクトでは」）
const PRETTIER_PRECEDING_CONFIGS = [
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.yaml',
  '.prettierrc.yml',
  '.prettierrc.json5',
  '.prettierrc.js',
  '.prettierrc.mjs',
  '.prettierrc.toml',
  'prettier.config.js',
  'prettier.config.mjs',
]

// 参照を足す先。値は packages/<ディレクトリ> から取る（テンプレートの version が正）
// 依存の入れ替えはツールごとに扱う。設定ファイルを書き換えなかったツールは
// 依存も触らない（独自の設定を残したまま実体を消すと、その設定が壊れる）
const CONFIG_PACKAGES = {
  eslint: {
    name: '@geckou/eslint-config',
    directory: 'eslint-config',
    scope: 'workspace',
  },
  prettier: {
    name: '@geckou/prettier-config',
    directory: 'prettier-config',
    scope: 'root',
  },
  commitlint: {
    name: '@geckou/commitlint-config',
    directory: 'commitlint-config',
    scope: 'root',
  },
}

// 参照方式では npm パッケージ側が持つ依存。派生が実体として持っていたら落とす
const REMOVED_DEPENDENCIES = {
  eslint: [
    '@eslint/eslintrc',
    'eslint-config-expo',
    'eslint-config-next',
    'eslint-config-prettier',
    'eslint-plugin-import',
    'typescript-eslint',
  ],
  prettier: ['prettier-plugin-tailwindcss'],
  commitlint: ['@commitlint/config-conventional'],
}
const REMOVED_DEPENDENCY_PREFIXES = { eslint: ['@typescript-eslint/'] }

function normalize(content) {
  return content.replace(/\r\n/g, '\n').trim()
}

function readJsonOrNull(file) {
  const raw = readFileOrNull(file)

  if (raw === null) return null

  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

// ワークスペースと ESLint プリセットの対応。layers.json ではなく実ファイルで判定する
// （持たない古い派生でも動かすため。detectLayers と同じ方針）
function detectWorkspaces(root) {
  const workspaces = []

  for (const group of ['apps', 'packages']) {
    const directory = path.join(root, group)

    if (!fs.existsSync(directory)) continue

    for (const name of fs.readdirSync(directory).sort()) {
      const relativePath = `${group}/${name}`
      const manifest = readJsonOrNull(
        path.join(root, relativePath, 'package.json')
      )

      if (manifest === null) continue
      if (CONFIG_PACKAGE_NAMES.has(manifest.name)) continue

      const kind = detectPresetKind(root, relativePath, {
        ...manifest.dependencies,
        ...manifest.devDependencies,
      })

      if (kind === null) continue

      workspaces.push({ path: relativePath, kind })
    }
  }

  return workspaces
}

// Next.js なら ./next、Expo なら ./expo、それ以外の TypeScript パッケージは `.`。
// ESLint を使っていないワークスペース（アセット置き場等）は対象外。
// 「使っている」は依存で判定する。eslint.config.mjs をまだ持たない構成でも生成できるように、
// 既存の設定ファイルはその補助として見る
function detectPresetKind(root, relativePath, dependencies) {
  if (dependencies.next || dependencies['eslint-config-next']) return 'next'
  if (dependencies.expo || dependencies['eslint-config-expo']) return 'expo'

  const usesEslint =
    dependencies.eslint !== undefined ||
    dependencies['typescript-eslint'] !== undefined ||
    fs.existsSync(path.join(root, relativePath, ESLINT_CONFIG_FILE))

  return usesEslint ? 'base' : null
}

// 既存が「テンプレートの既知の形」（参照形 or 移行前の形）と一致するときだけ置き換える。
// 独自ルールを足している派生を静かに壊さないため、一致しなければ差分を conflicts に積む
function planKnownFile(root, relativePath, content, knownShapes, context) {
  const current = readFileOrNull(path.join(root, relativePath))

  if (current === null) return planFile(root, relativePath, content)
  if (normalize(current) === normalize(content)) return null

  const known = [content, ...knownShapes].some(
    (shape) => normalize(shape) === normalize(current)
  )

  if (!known && !context.options.force) {
    context.conflicts.push({ file: relativePath, current, expected: content })

    return null
  }

  return planFile(root, relativePath, content)
}

function planEslintConfigs(root, workspaces, context) {
  return workspaces
    .map((workspace) =>
      planKnownFile(
        root,
        `${workspace.path}/${ESLINT_CONFIG_FILE}`,
        ESLINT_CONFIG_CONTENT[workspace.kind],
        [LEGACY_ESLINT_CONFIG_CONTENT[workspace.kind]],
        context
      )
    )
    .filter(Boolean)
}

// .prettierrc.cjs を生成し、先に読まれる .prettierrc を消す。
// 消さずに置くと参照が効かず、古いコピーが黙って使われ続ける
function planPrettierConfig(root, context) {
  const legacyPath = path.join(root, LEGACY_PRETTIER_CONFIG_PATH)
  const legacy = readJsonOrNull(legacyPath)
  const legacyRaw = readFileOrNull(legacyPath)

  if (legacyRaw !== null && !isKnownLegacyPrettierConfig(legacy)) {
    if (!context.options.force) {
      context.conflicts.push({
        file: LEGACY_PRETTIER_CONFIG_PATH,
        current: legacyRaw,
        expected: `${JSON.stringify(LEGACY_PRETTIER_CONFIG, null, 2)}\n`,
        note: '独自の設定を持つため削除しなかった（.prettierrc.cjs も生成していない）',
      })

      return []
    }
  }

  const content = buildPrettierConfig(resolveTailwindStylesheet(root, legacy))
  const changes = [
    planKnownFile(root, PRETTIER_CONFIG_PATH, content, [], context),
  ].filter(Boolean)

  // 生成できていないのに .prettierrc だけ消すと、設定そのものが無くなる
  const generated = changes.length > 0
  const alreadyReference =
    normalize(readFileOrNull(path.join(root, PRETTIER_CONFIG_PATH)) ?? '') ===
    normalize(content)

  if (legacyRaw !== null && (generated || alreadyReference)) {
    changes.push({
      file: LEGACY_PRETTIER_CONFIG_PATH,
      action: '削除',
      content: null,
    })
  }

  return changes
}

function isKnownLegacyPrettierConfig(legacy) {
  if (legacy === null || typeof legacy !== 'object') return false

  const { tailwindStylesheet: _ignored, ...rest } = legacy
  const expected = Object.entries(LEGACY_PRETTIER_CONFIG)

  // キーの順序は内容の差ではない（順序で比べると移行できる派生を取りこぼす）
  if (Object.keys(rest).length !== expected.length) return false

  return expected.every(
    ([key, value]) => JSON.stringify(rest[key]) === JSON.stringify(value)
  )
}

// tailwindStylesheet はプロジェクトの構成に依存するので、既存の値を引き継ぐ
function resolveTailwindStylesheet(root, legacy) {
  const current = readFileOrNull(path.join(root, PRETTIER_CONFIG_PATH))
  const matched = current?.match(/tailwindStylesheet:\s*'([^']*)'/)

  if (matched) return matched[1]
  if (typeof legacy?.tailwindStylesheet === 'string') {
    return legacy.tailwindStylesheet
  }

  return null
}

function buildPrettierConfig(tailwindStylesheet) {
  const header =
    '// 中身はテンプレート側の共有設定（@geckou/prettier-config）を参照する。コピーしない。'

  if (tailwindStylesheet === null) {
    return `${header}
const geckou = require('@geckou/prettier-config')

module.exports = { ...geckou }
`
  }

  return `${header}
// tailwindStylesheet だけはプロジェクトの構成に依存するのでここで足す
// （Prettier には extends が無いため spread で受ける）。
const geckou = require('@geckou/prettier-config')

module.exports = {
  ...geckou,
  tailwindStylesheet: '${tailwindStylesheet}',
}
`
}

function planCommitlintConfig(root, context) {
  return planKnownFile(
    root,
    COMMITLINT_CONFIG_PATH,
    COMMITLINT_CONFIG_CONTENT,
    [LEGACY_COMMITLINT_CONFIG_CONTENT],
    context
  )
}

// package.json は依存フィールドだけを触る。resolutions は派生ごとに値が違うので触らない
// （.claude/docs/dependencies.md「配れないもの」）
function planDependencies(root, workspaces, context) {
  const skipped = skippedGroups(workspaces, context.conflicts)
  const rootGroups = ['eslint', 'prettier', 'commitlint'].filter(
    (group) => !skipped.tools.has(group)
  )
  const changes = [planManifest(root, 'package.json', rootGroups, 'root')]

  for (const workspace of workspaces) {
    // 設定ファイルを書き換えなかったワークスペースは package.json も触らない
    if (skipped.workspaces.has(workspace.path)) continue

    // ワークスペース側は自分の設定だけを見る（別のワークスペースが手つかずでも、
    // このワークスペースの入れ替えは安全に行える）
    changes.push(
      planManifest(
        root,
        `${workspace.path}/package.json`,
        ['eslint'],
        'workspace'
      )
    )
  }

  return changes.filter(Boolean)
}

// 手を入れなかった設定ファイルから、依存も触ってはいけない範囲を割り出す。
// 独自の eslint.config.mjs を残したまま typescript-eslint を消すと lint が落ちる
function skippedGroups(workspaces, conflicts) {
  const files = new Set(conflicts.map((conflict) => conflict.file))
  const skipped = { tools: new Set(), workspaces: new Set() }

  for (const workspace of workspaces) {
    if (!files.has(`${workspace.path}/${ESLINT_CONFIG_FILE}`)) continue

    skipped.workspaces.add(workspace.path)
    // ルートの ESLint 依存は全ワークスペースが使うので、1 つでも残せば消せない
    skipped.tools.add('eslint')
  }

  if (
    files.has(LEGACY_PRETTIER_CONFIG_PATH) ||
    files.has(PRETTIER_CONFIG_PATH)
  ) {
    skipped.tools.add('prettier')
  }

  if (files.has(COMMITLINT_CONFIG_PATH)) skipped.tools.add('commitlint')

  return skipped
}

function planManifest(root, relativePath, groups, scope) {
  const manifest = readJsonOrNull(path.join(root, relativePath))

  if (manifest === null) return null

  let changed = false

  for (const field of ['dependencies', 'devDependencies']) {
    const dependencies = manifest[field]

    if (!dependencies) continue

    for (const name of Object.keys(dependencies)) {
      if (!isRemovedDependency(name, groups)) continue

      delete dependencies[name]
      changed = true
    }
  }

  const added = groups
    .map((group) => CONFIG_PACKAGES[group])
    .filter((item) => item.scope === scope)

  for (const item of added) {
    const name = item.name

    if (manifest.dependencies?.[name] || manifest.devDependencies?.[name]) {
      continue
    }

    manifest.devDependencies = sortKeys({
      ...manifest.devDependencies,
      [name]: configPackageVersion(item.directory),
    })
    changed = true
  }

  if (!changed) return null

  return {
    file: relativePath,
    action: '更新',
    content: `${JSON.stringify(manifest, null, 2)}\n`,
  }
}

function isRemovedDependency(name, groups) {
  return groups.some(
    (group) =>
      REMOVED_DEPENDENCIES[group].includes(name) ||
      (REMOVED_DEPENDENCY_PREFIXES[group] ?? []).some((prefix) =>
        name.startsWith(prefix)
      )
  )
}

function sortKeys(object) {
  return Object.fromEntries(
    Object.entries(object).sort(([left], [right]) => left.localeCompare(right))
  )
}

function configPackageVersion(directory) {
  const manifest = JSON.parse(
    fs.readFileSync(
      path.join(TEMPLATE_ROOT, 'packages', directory, 'package.json'),
      'utf8'
    )
  )

  return `^${manifest.version}`
}

// .prettierrc 以外にも先に読まれる設定が残っていることがある。消せる形か判断できないので印字する
function findPrettierPrecedingConfigs(root) {
  const found = PRETTIER_PRECEDING_CONFIGS.filter(
    (file) =>
      file !== LEGACY_PRETTIER_CONFIG_PATH &&
      fs.existsSync(path.join(root, file))
  )
  const manifest = readJsonOrNull(path.join(root, 'package.json'))

  if (manifest?.prettier !== undefined) {
    found.push('package.json の prettier キー')
  }

  return found
}

// 行単位の粗い差分。人が「独自のルールを足していたか」を見分けられれば足りる
function formatDiff(current, expected, limit = 12) {
  const currentLines = current.split('\n')
  const expectedLines = expected.split('\n')
  const lines = []

  for (
    let index = 0;
    index < Math.max(currentLines.length, expectedLines.length);
    index += 1
  ) {
    if (currentLines[index] === expectedLines[index]) continue

    if (currentLines[index] !== undefined) {
      lines.push(`- ${currentLines[index]}`)
    }
    if (expectedLines[index] !== undefined) {
      lines.push(`+ ${expectedLines[index]}`)
    }

    if (lines.length >= limit) {
      lines.push('  ...')
      break
    }
  }

  return lines
}

function main() {
  const options = parseArguments(process.argv.slice(2))

  if (options.help) {
    console.log(usage())
    return
  }

  const root = resolveRepository(options.repo)
  const layers = detectLayers(root)
  const workspaces = detectWorkspaces(root)
  const context = { options, conflicts: [] }

  console.log(`[plan] 対象: ${root}`)
  console.log(`[plan] 検出した層: mobile=${layers.mobile}`)
  console.log(
    `[plan] 検出したワークスペース: ${
      workspaces.map((item) => `${item.path}(${item.kind})`).join(', ') ||
      'なし'
    }`
  )

  const changes = [
    planCiWorkflow(root),
    planTemplateSyncIgnore(root),
    planRenovateConfig(root, layers),
    planPrettierIgnore(root, layers),
    ...planEslintConfigs(root, workspaces, context),
    ...planPrettierConfig(root, context),
    planCommitlintConfig(root, context),
    ...planDependencies(root, workspaces, context),
  ].filter(Boolean)

  if (changes.length === 0) {
    console.log('[done] 変更はありません（既に参照方式です）')
  } else {
    for (const change of changes) {
      console.log(`  ${change.action} ${change.file}`)

      if (options.dryRun) continue

      const file = path.join(root, change.file)

      if (change.action === '削除') {
        fs.rmSync(file)
        continue
      }

      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, change.content)
    }

    console.log(
      options.dryRun
        ? `[dry-run] ${changes.length} 件の変更を検出しました（未適用）`
        : `[done] ${changes.length} 件の変更を適用しました`
    )
  }

  printConflicts(context.conflicts)
  printWarnings(root)
  printManualSteps(changes)
}

// 独自ルールを持つ設定ファイルは書き換えない。何が違うかを見せて人に渡す
function printConflicts(conflicts) {
  if (conflicts.length === 0) return

  console.log('')
  console.log('手を入れなかったファイル（--force で上書きできる）:')

  for (const conflict of conflicts) {
    const reason =
      conflict.note ?? 'テンプレートの既知の形と一致しない（独自の設定がある）'

    console.log(`  ${conflict.file}: ${reason}`)

    for (const line of formatDiff(conflict.current, conflict.expected)) {
      console.log(`    ${line}`)
    }
  }

  console.log('  （上記の設定が必要とする依存は package.json に残している）')
}

function printWarnings(root) {
  const preceding = findPrettierPrecedingConfigs(root)

  if (preceding.length === 0) return

  console.log('')
  console.log('警告:')
  console.log(
    `  Prettier が .prettierrc.cjs より先に読む設定が残っている: ${preceding.join(', ')}`
  )
  console.log('  残したままだと参照が効かず、古い設定が黙って使われ続ける')
}

function printManualSteps(changes) {
  const steps = changes.some((change) => change.file.endsWith('package.json'))
    ? [...MANUAL_STEPS, INSTALL_STEP]
    : MANUAL_STEPS

  console.log('')
  console.log('残る手動作業（このスクリプトではできない）:')

  for (const step of steps) console.log(`  - ${step}`)
}

try {
  main()
} catch (error) {
  console.error(`[error] ${error.message}`)
  process.exit(1)
}
