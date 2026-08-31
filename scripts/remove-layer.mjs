#!/usr/bin/env node
// 層マニフェスト（layers.json）に従って opt-in 層をリポジトリから取り除く（減算）。
//
//   node scripts/remove-layer.mjs mobile billing
//   node scripts/remove-layer.mjs --target /tmp/variant firebase
//   node scripts/remove-layer.mjs --dry-run functions
//
// 外した層に依存する層（layers.json の requires）も一緒に外れる。
// 加算（/add-* での配線）より減算を先に作っているのは、全部入りが動いている
// 現状を「既知の正解」として層の境界を検証できるため（#105）。
//
// node_modules に依存しない。yarn install なしで実行できる。

import path from 'node:path'

import {
  applyRemoval,
  loadManifest,
  pruneManifest,
  resolveRemoval,
  writeJson,
} from './lib/layers.mjs'

function parseArguments(argv) {
  const options = { target: process.cwd(), dryRun: false, layers: [] }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]

    if (argument === '--target') {
      index += 1
      options.target = path.resolve(argv[index] ?? '')
    } else if (argument === '--dry-run') {
      options.dryRun = true
    } else if (argument === '--help' || argument === '-h') {
      options.help = true
    } else if (argument.startsWith('-')) {
      throw new Error(`不明なオプションです: ${argument}`)
    } else {
      options.layers.push(argument)
    }
  }

  return options
}

function usage(manifest) {
  const removable = manifest.layers
    .filter((layer) => layer.removable !== false)
    .map((layer) => `  ${layer.name.padEnd(10)} ${layer.title}`)
    .join('\n')

  return [
    '使い方: node scripts/remove-layer.mjs [--target <ディレクトリ>] [--dry-run] <層> [<層>...]',
    '',
    '外せる層:',
    removable,
  ].join('\n')
}

function main() {
  const options = parseArguments(process.argv.slice(2))
  const root = options.target
  const manifest = loadManifest(root)

  if (options.help || options.layers.length === 0) {
    console.log(usage(manifest))
    process.exit(options.help ? 0 : 1)
  }

  const removal = resolveRemoval(manifest, options.layers)
  const cascaded = removal.filter((name) => !options.layers.includes(name))

  if (cascaded.length > 0) {
    console.log(
      `[info] 依存する層も一緒に外します: ${cascaded.join(', ')}（layers.json の requires）`
    )
  }

  console.log(`[plan] 外す層: ${removal.join(', ')}`)

  const changes = applyRemoval(root, manifest, removal, {
    dryRun: options.dryRun,
  })

  // 4. マニフェストを実態に合わせる。
  // 外した層の定義を落とし、残った層の定義からも実在しなくなった項目を落とす。
  // 層の交点（billing の RevenueCat は mobile 側のファイルを指す）があるため、
  // 外した層を消すだけでは残った層の定義がずれ、check-layers.mjs が落ちる
  const remaining = manifest.layers.filter(
    (layer) => !removal.includes(layer.name)
  )

  changes.push(`manifest layers.json: ${removal.join(', ')} を削除`)

  if (!options.dryRun) {
    writeJson(
      path.join(root, 'layers.json'),
      pruneManifest(root, { ...manifest, layers: remaining })
    )
  }

  for (const change of changes) console.log(`  ${change}`)

  if (options.dryRun) {
    console.log(`[dry-run] ${changes.length} 件の変更を検出しました（未適用）`)
    return
  }

  console.log(`[done] ${changes.length} 件の変更を適用しました`)
  console.log(
    '  → yarn install（--frozen-lockfile なし）で yarn.lock を作り直すこと'
  )
  console.log(
    '  → yarn format で整形すること（範囲を削った跡の空行や、書き換えた JSON の体裁を Prettier に揃える）'
  )
}

try {
  main()
} catch (error) {
  console.error(`[error] ${error.message}`)
  process.exit(1)
}
