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
//   5. 人にしかできない残作業を印字する
//
// 触らないもの:
//   - package.json の resolutions（派生ごとに値が違う。.claude/docs/dependencies.md
//     「配れないもの」。自動で書き換えると派生固有のピン留めを壊す）
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

function parseArguments(argv) {
  const options = { repo: null, dryRun: false, help: false }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]

    if (argument === '--repo') {
      index += 1
      options.repo = argv[index] ?? ''
    } else if (argument === '--dry-run') {
      options.dryRun = true
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
    '使い方: node scripts/adopt-references.mjs --repo <派生プロジェクトのパス> [--dry-run]',
    '',
    '  --repo      移行する派生プロジェクトのルート（必須）',
    '  --dry-run   差分を表示するだけでファイルは書かない',
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
  if (root === TEMPLATE_ROOT || fs.existsSync(path.join(root, 'renovate/'))) {
    throw new Error(
      `テンプレート自身は移行対象にできません（参照される側です）: ${root}`
    )
  }

  return root
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

function main() {
  const options = parseArguments(process.argv.slice(2))

  if (options.help) {
    console.log(usage())
    return
  }

  const root = resolveRepository(options.repo)
  const layers = detectLayers(root)

  console.log(`[plan] 対象: ${root}`)
  console.log(`[plan] 検出した層: mobile=${layers.mobile}`)

  const changes = [
    planCiWorkflow(root),
    planTemplateSyncIgnore(root),
    planRenovateConfig(root, layers),
    planPrettierIgnore(root, layers),
  ].filter(Boolean)

  if (changes.length === 0) {
    console.log('[done] 変更はありません（既に参照方式です）')
  } else {
    for (const change of changes) {
      console.log(`  ${change.action} ${change.file}`)

      if (!options.dryRun) {
        const file = path.join(root, change.file)

        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, change.content)
      }
    }

    console.log(
      options.dryRun
        ? `[dry-run] ${changes.length} 件の変更を検出しました（未適用）`
        : `[done] ${changes.length} 件の変更を適用しました`
    )
  }

  console.log('')
  console.log('残る手動作業（このスクリプトではできない）:')

  for (const step of MANUAL_STEPS) console.log(`  - ${step}`)
}

try {
  main()
} catch (error) {
  console.error(`[error] ${error.message}`)
  process.exit(1)
}
