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

import fs from 'node:fs'
import path from 'node:path'

import {
  isTextFile,
  layerByName,
  listFiles,
  loadManifest,
  pruneManifest,
  readJson,
  resolveJsonPath,
  resolveRemoval,
  stripBlocks,
  writeJson,
} from './lib/layers.mjs'

const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
]

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
  const changes = []

  if (cascaded.length > 0) {
    console.log(
      `[info] 依存する層も一緒に外します: ${cascaded.join(', ')}（layers.json の requires）`
    )
  }

  console.log(`[plan] 外す層: ${removal.join(', ')}`)

  // 1. ファイル・ディレクトリの削除
  for (const name of removal) {
    for (const relative of layerByName(manifest, name).files ?? []) {
      const target = path.join(root, relative)

      if (!fs.existsSync(target)) continue

      changes.push(`delete  ${relative}`)

      if (!options.dryRun) fs.rmSync(target, { recursive: true, force: true })
    }
  }

  // 2. マーカーで囲まれた範囲の削除
  for (const relative of listFiles(root)) {
    if (!isTextFile(relative)) continue

    const target = path.join(root, relative)

    if (!fs.existsSync(target)) continue

    const before = fs.readFileSync(target, 'utf8')

    if (!before.includes('layer:')) continue

    const after = stripBlocks(before, removal)

    if (after === before) continue

    changes.push(`strip   ${relative}`)

    if (!options.dryRun) fs.writeFileSync(target, after)
  }

  // 3. package.json の依存・スクリプトと、設定ファイルのキー
  for (const name of removal) {
    const layer = layerByName(manifest, name)

    for (const [relative, names] of Object.entries(layer.deps ?? {})) {
      const target = path.join(root, relative)

      // 依存を持つワークスペースごと消えている場合がある（billing の apps/functions 等）
      if (!fs.existsSync(target)) continue

      const json = readJson(target)
      let changed = false

      for (const dependency of names) {
        for (const field of DEPENDENCY_FIELDS) {
          if (json[field]?.[dependency] === undefined) continue

          delete json[field][dependency]
          changed = true
          changes.push(`dep     ${relative}: ${dependency}`)
        }
      }

      if (changed && !options.dryRun) writeJson(target, json)
    }

    for (const [relative, names] of Object.entries(layer.scripts ?? {})) {
      const target = path.join(root, relative)

      if (!fs.existsSync(target)) continue

      const json = readJson(target)
      let changed = false

      for (const script of names) {
        if (json.scripts?.[script] === undefined) continue

        delete json.scripts[script]
        changed = true
        changes.push(`script  ${relative}: ${script}`)
      }

      if (changed && !options.dryRun) writeJson(target, json)
    }

    for (const [relative, keyPaths] of Object.entries(layer.json ?? {})) {
      const target = path.join(root, relative)

      if (!fs.existsSync(target)) continue

      const json = readJson(target)
      let changed = false

      for (const keys of keyPaths) {
        const resolved = resolveJsonPath(json, keys)

        if (!resolved || resolved.parent[resolved.key] === undefined) continue

        delete resolved.parent[resolved.key]
        changed = true
        changes.push(`json    ${relative}: ${keys.join('.')}`)
      }

      if (changed && !options.dryRun) writeJson(target, json)
    }

    for (const rule of layer.replace ?? []) {
      const target = path.join(root, rule.file)

      if (!fs.existsSync(target)) continue

      const before = fs.readFileSync(target, 'utf8')

      if (!before.includes(rule.find)) continue

      changes.push(`replace ${rule.file}`)

      if (!options.dryRun) {
        fs.writeFileSync(target, before.split(rule.find).join(rule.with))
      }
    }
  }

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
