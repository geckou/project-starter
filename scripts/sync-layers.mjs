#!/usr/bin/env node
// Template Sync が取り込んだ差分から、派生プロジェクトが採用していない層を外し直す。
//
//   node scripts/sync-layers.mjs --template /tmp/template-layers.json
//   node scripts/sync-layers.mjs --template /tmp/template-layers.json --target /tmp/variant --dry-run
//
// テンプレート本体は全部入りなので、同期対象のファイル（`.templatesyncignore` に
// 載っていないもの）には外した層のマーカーやステップが含まれる。`layers.json` は
// ignore されて派生側の状態が残るため、そのままマージすると
// 「マニフェストに無い層のマーカー」で check-layers.mjs が落ち、外したはずの層の
// CI ステップや Renovate 設定が復活する（#296）。
//
// 「テンプレートの layers.json にはあるが、派生の layers.json に無い層」を
// 外した層とみなし、取り込んだ差分に対して減算をやり直す。
// 層を 1 つも外していない派生では何もしない。
//
// node_modules に依存しない。yarn install なしで実行できる。

import fs from 'node:fs'
import path from 'node:path'

import {
  applyRemoval,
  loadManifest,
  pruneManifest,
  resolveRemoval,
  writeJson,
} from './lib/layers.mjs'

function parseArguments(argv) {
  const options = { target: process.cwd(), template: '', dryRun: false }

  // 値を省略すると path.resolve('') がカレントディレクトリになり、
  // --template ではディレクトリを readFileSync して分かりにくい失敗になる
  const requireValue = (flag, value) => {
    if (value === undefined || value.startsWith('-')) {
      throw new Error(`${flag} には値が必要です`)
    }

    return path.resolve(value)
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]

    if (argument === '--target') {
      index += 1
      options.target = requireValue('--target', argv[index])
    } else if (argument === '--template') {
      index += 1
      options.template = requireValue('--template', argv[index])
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

const USAGE = [
  '使い方: node scripts/sync-layers.mjs --template <テンプレートの layers.json>',
  '        [--target <ディレクトリ>] [--dry-run]',
  '',
  'Template Sync が取り込んだ差分から、派生プロジェクトが採用していない層を外し直す。',
].join('\n')

function main() {
  const options = parseArguments(process.argv.slice(2))

  if (options.help) {
    console.log(USAGE)
    return
  }

  if (!options.template) {
    console.error(USAGE)
    process.exit(1)
  }

  const root = options.target

  // 層構成を持たないプロジェクト（layers.json を消した派生）では何もしない。
  // このスクリプトは Template Sync で配られ、ワークフローから無条件に呼ばれる
  if (!fs.existsSync(path.join(root, 'layers.json'))) {
    console.log('[skip] layers.json が無いため、層の外し直しをスキップします')
    return
  }

  if (!fs.existsSync(options.template)) {
    throw new Error(
      `テンプレートの層マニフェストが見つかりません: ${options.template}`
    )
  }

  const local = loadManifest(root)
  const template = JSON.parse(fs.readFileSync(options.template, 'utf8'))

  if (!Array.isArray(template.layers) || template.layers.length === 0) {
    throw new Error('テンプレートの layers.json に layers 配列がありません')
  }

  const localNames = new Set(local.layers.map((layer) => layer.name))
  const missing = template.layers
    .map((layer) => layer.name)
    .filter((name) => !localNames.has(name))

  if (missing.length === 0) {
    console.log('[ok] 外した層はありません（全部入りの構成）')
    return
  }

  const removal = resolveRemoval(template, missing)

  console.log(`[plan] 取り込んだ差分から外し直す層: ${removal.join(', ')}`)

  const changes = applyRemoval(root, template, removal, {
    dryRun: options.dryRun,
  })

  // 残る層の定義はテンプレート側（＝今回取り込んだ最新）を正にする。
  // 派生でしか定義していない層は、テンプレートに無いのでそのまま残す
  const removed = new Set(removal)
  const templateNames = new Set(template.layers.map((layer) => layer.name))
  const layers = [
    ...template.layers.filter((layer) => !removed.has(layer.name)),
    ...local.layers.filter((layer) => !templateNames.has(layer.name)),
  ]

  changes.push(`manifest layers.json: ${removal.join(', ')} を削除`)

  if (!options.dryRun) {
    writeJson(
      path.join(root, 'layers.json'),
      pruneManifest(root, { ...template, layers })
    )
  }

  for (const change of changes) console.log(`  ${change}`)

  if (options.dryRun) {
    console.log(`[dry-run] ${changes.length} 件の変更を検出しました（未適用）`)
    return
  }

  console.log(`[done] ${changes.length} 件の変更を適用しました`)
}

try {
  main()
} catch (error) {
  console.error(
    `[error] ${error instanceof Error ? error.message : String(error)}`
  )
  process.exit(1)
}
