#!/usr/bin/env node
// 層マニフェスト（layers.json）に従って opt-in 層をリポジトリへ足す（加算）。
//
//   node scripts/add-layer.mjs billing
//   node scripts/add-layer.mjs mobile --from ../project-starter
//   node scripts/add-layer.mjs functions --dry-run
//
// 層の実体（ファイル・マーカーの範囲・依存・設定）はテンプレートから取り寄せる。
// --from を省略した場合は layers.json の source（リポジトリと ref）を shallow clone する。
//
// 減算の逆操作にあたる。両方向を同じマニフェストから駆動しているため、
// 「外して足すと元に戻る」ことを回帰テスト（scripts/test-layers.sh）で検証できる。
//
// このスクリプトが担当するのは**機械的な配線だけ**。アカウント作成・キーの発行・
// プロダクト固有の実装（権利変化フック等）は /add-<層名> スキルが案内する（#105 決定1）。
//
// node_modules に依存しない。yarn install なしで実行できる。

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  DEPENDENCY_FIELDS,
  applyRemoval,
  ensureJsonPath,
  layerByName,
  loadManifest,
  pruneManifest,
  readJson,
  resolveAddition,
  resolveJsonPath,
  restoreKeyOrder,
  stripBlocks,
  writeJson,
} from './lib/layers.mjs'

function parseArguments(argv) {
  const options = { target: process.cwd(), dryRun: false, layers: [] }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]

    if (argument === '--target') {
      index += 1
      options.target = path.resolve(argv[index] ?? '')
    } else if (argument === '--from') {
      index += 1
      options.from = path.resolve(argv[index] ?? '')
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

function usage() {
  return [
    '使い方: node scripts/add-layer.mjs [--from <テンプレートのパス>] [--target <ディレクトリ>] [--dry-run] <層> [<層>...]',
    '',
    '層の実体はテンプレートから取り寄せる。--from を省略すると layers.json の',
    'source（リポジトリと ref）を shallow clone して使う。',
  ].join('\n')
}

/** テンプレートを用意する。返り値の cleanup は clone した場合のみ実体を消す */
function prepareSource(root, options) {
  if (options.from) {
    if (!fs.existsSync(path.join(options.from, 'layers.json'))) {
      throw new Error(
        `--from に層マニフェストがありません: ${path.join(options.from, 'layers.json')}`
      )
    }

    return { dir: options.from, cleanup: () => {} }
  }

  const manifest = loadManifest(root)
  const source = manifest.source

  if (!source?.repository) {
    throw new Error(
      'layers.json に source.repository がありません。--from でテンプレートのパスを渡してください'
    )
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'layer-source-'))
  const ref = source.ref ?? 'production'

  console.log(`[info] テンプレートを取得します: ${source.repository} (${ref})`)

  try {
    execFileSync(
      'git',
      ['clone', '--depth', '1', '--branch', ref, source.repository, dir],
      { stdio: ['ignore', 'ignore', 'pipe'] }
    )
  } catch (error) {
    fs.rmSync(dir, { recursive: true, force: true })

    throw new Error(
      `テンプレートの取得に失敗しました: ${error.stderr?.toString().trim() ?? error.message}`
    )
  }

  return {
    dir,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  }
}

function copyRecursive(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.cpSync(from, to, { recursive: true })
}

/**
 * 層を足したファイルの内容を、ローカルの変更を保ったまま作る。
 *
 * base   = テンプレートから「ローカルに無い層」を全て外したもの（＝ローカルの出自）
 * ours   = ローカルのファイル
 * theirs = テンプレートのファイル
 *
 * の 3-way マージ。ローカルに手が入っていなければ theirs がそのまま採用される。
 * theirs には今回足さない層の内容も混ざるが、最後に applyRemoval で落とす。
 */
function mergeWithLayer(localContent, sourceContent, absent, absentLayers) {
  let base = stripBlocks(sourceContent, absent)

  // 減算が置換で消していた箇所（replace）も base 側に反映しておく
  for (const layer of absentLayers) {
    for (const rule of layer.replace ?? []) {
      base = base.split(rule.find).join(rule.with)
    }
  }

  if (localContent === null)
    return { content: sourceContent, conflicted: false }
  if (localContent === base)
    return { content: sourceContent, conflicted: false }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'layer-merge-'))

  try {
    const ours = path.join(dir, 'ours')
    const baseFile = path.join(dir, 'base')
    const theirs = path.join(dir, 'theirs')

    fs.writeFileSync(ours, localContent)
    fs.writeFileSync(baseFile, base)
    fs.writeFileSync(theirs, sourceContent)

    try {
      const merged = execFileSync(
        'git',
        ['merge-file', '-p', '--diff3', ours, baseFile, theirs],
        { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
      )

      return { content: merged, conflicted: false }
    } catch (error) {
      // 終了コード > 0 はコンフリクト数。マーカー入りの内容は stdout に出る
      if (typeof error.stdout === 'string' && error.stdout.length > 0) {
        return { content: error.stdout, conflicted: true }
      }

      throw error
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * 既にある層の定義に、テンプレート側の定義を足し戻す。
 * 減算が層の交点で削った項目（billing が持つ mobile 側のファイル等）を補うため。
 * 派生プロジェクトが独自に足した項目は消さない。
 */
function mergeLayerDefinition(local, source) {
  const merged = { ...source, ...local }

  for (const key of ['files', 'blocks', 'env']) {
    if (!source[key] && !local[key]) continue

    merged[key] = [...new Set([...(source[key] ?? []), ...(local[key] ?? [])])]
  }

  for (const key of ['deps', 'scripts', 'json']) {
    if (!source[key] && !local[key]) continue

    const combined = { ...source[key] }

    for (const [file, values] of Object.entries(local[key] ?? {})) {
      combined[file] = combined[file]
        ? [
            ...new Set(
              [...combined[file], ...values].map((value) =>
                JSON.stringify(value)
              )
            ),
          ].map((value) => JSON.parse(value))
        : values
    }

    merged[key] = combined
  }

  if (source.replace || local.replace) {
    const seen = new Set()

    merged.replace = [
      ...(source.replace ?? []),
      ...(local.replace ?? []),
    ].filter((rule) => {
      const key = JSON.stringify(rule)

      if (seen.has(key)) return false

      seen.add(key)

      return true
    })
  }

  return merged
}

function main() {
  const options = parseArguments(process.argv.slice(2))

  if (options.help || options.layers.length === 0) {
    console.log(usage())
    process.exit(options.help ? 0 : 1)
  }

  const root = options.target
  const source = prepareSource(root, options)

  try {
    const sourceManifest = loadManifest(source.dir)
    const localManifest = loadManifest(root)
    const present = new Set(localManifest.layers.map((layer) => layer.name))

    const requested = resolveAddition(sourceManifest, options.layers)
    const addition = requested.filter((name) => !present.has(name))
    const already = requested.filter((name) => present.has(name))

    if (already.length > 0) {
      console.log(`[info] 既にある層は飛ばします: ${already.join(', ')}`)
    }

    if (addition.length === 0) {
      console.log('[done] 足す層はありません')
      return
    }

    const pulled = addition.filter((name) => !options.layers.includes(name))

    if (pulled.length > 0) {
      console.log(
        `[info] 前提になる層も一緒に足します: ${pulled.join(', ')}（layers.json の requires）`
      )
    }

    console.log(`[plan] 足す層: ${addition.join(', ')}`)

    const layers = addition.map((name) => layerByName(sourceManifest, name))

    // ローカルに無い層（今回足すものを含む）。base の計算に使う
    const absent = sourceManifest.layers
      .map((layer) => layer.name)
      .filter((name) => !present.has(name))
    const absentLayers = absent.map((name) => layerByName(sourceManifest, name))

    // 今回足さない層。テンプレートから紛れ込んだ分を最後に落とす
    const remaining = absent.filter((name) => !addition.includes(name))
    const changes = []
    const conflicts = []

    // 1. ファイル・ディレクトリ
    for (const layer of layers) {
      for (const relative of layer.files ?? []) {
        const from = path.join(source.dir, relative)
        const to = path.join(root, relative)

        if (!fs.existsSync(from)) {
          console.log(`[warn] テンプレートに存在しません: ${relative}`)
          continue
        }

        if (fs.existsSync(to)) {
          // 派生プロジェクトが独自に作ったものを上書きしない
          console.log(`[skip] 既にあるため上書きしません: ${relative}`)
          continue
        }

        changes.push(`create  ${relative}`)

        if (!options.dryRun) copyRecursive(from, to)
      }
    }

    // 2. マーカーの範囲と、置換で消えていた箇所（3-way マージで戻す）
    const mergeTargets = new Set()

    for (const layer of layers) {
      for (const relative of layer.blocks ?? []) mergeTargets.add(relative)
      for (const rule of layer.replace ?? []) mergeTargets.add(rule.file)
    }

    for (const relative of [...mergeTargets].sort()) {
      const from = path.join(source.dir, relative)

      if (!fs.existsSync(from)) {
        console.log(`[warn] テンプレートに存在しません: ${relative}`)
        continue
      }

      const to = path.join(root, relative)
      const sourceContent = fs.readFileSync(from, 'utf8')
      const localContent = fs.existsSync(to)
        ? fs.readFileSync(to, 'utf8')
        : null

      const { content, conflicted } = mergeWithLayer(
        localContent,
        sourceContent,
        absent,
        absentLayers
      )

      if (content === localContent) continue

      changes.push(`${conflicted ? 'conflict' : 'merge   '} ${relative}`)

      if (conflicted) conflicts.push(relative)

      if (!options.dryRun) {
        fs.mkdirSync(path.dirname(to), { recursive: true })
        fs.writeFileSync(to, content)
      }
    }

    // 3. 依存・スクリプト・設定のキー（テンプレートの値をそのまま戻す）
    for (const layer of layers) {
      const restoreValue = (relative, keys, kind) => {
        const from = path.join(source.dir, relative)
        const to = path.join(root, relative)

        if (!fs.existsSync(from) || !fs.existsSync(to)) return

        const sourceJson = readJson(from)
        const localJson = readJson(to)
        const sourceEntry = resolveJsonPath(sourceJson, keys)

        if (!sourceEntry || sourceEntry.parent[sourceEntry.key] === undefined) {
          return
        }

        const localEntry = ensureJsonPath(localJson, keys)

        if (localEntry.parent[localEntry.key] !== undefined) return

        localEntry.parent[localEntry.key] = sourceEntry.parent[sourceEntry.key]
        restoreKeyOrder(localEntry.parent, sourceEntry.parent)

        changes.push(`${kind} ${relative}: ${keys.join('.')}`)

        if (!options.dryRun) writeJson(to, localJson)
      }

      for (const [relative, names] of Object.entries(layer.deps ?? {})) {
        for (const dependency of names) {
          const from = path.join(source.dir, relative)

          if (!fs.existsSync(from)) continue

          const sourceJson = readJson(from)
          const field = DEPENDENCY_FIELDS.find(
            (candidate) => sourceJson[candidate]?.[dependency] !== undefined
          )

          if (!field) continue

          restoreValue(relative, [field, dependency], 'dep    ')
        }
      }

      for (const [relative, names] of Object.entries(layer.scripts ?? {})) {
        for (const script of names) {
          restoreValue(relative, ['scripts', script], 'script ')
        }
      }

      for (const [relative, keyPaths] of Object.entries(layer.json ?? {})) {
        for (const keys of keyPaths) restoreValue(relative, keys, 'json   ')
      }
    }

    // 4. まだ足していない層の内容を落とす。
    // テンプレートから持ち込んだファイル（apps/functions/package.json の課金依存、
    // api.ts の課金ルート等）には、今回足さない層の内容も混ざっている
    if (remaining.length > 0 && !options.dryRun) {
      const cleaned = applyRemoval(root, sourceManifest, remaining)

      if (cleaned.length > 0) {
        changes.push(
          `clean   まだ足していない層を除去: ${remaining.join(', ')}`
        )
      }
    }

    // 5. マニフェストに層の定義を戻す。
    // 足した層はテンプレートの定義をそのまま入れ、既にある層は
    // 層の交点（billing の RevenueCat 等）で削られていた項目をテンプレートから補う。
    // 最後に実態へ合わせて刈り込む
    if (!options.dryRun) {
      const merged = sourceManifest.layers
        .filter(
          (layer) => present.has(layer.name) || addition.includes(layer.name)
        )
        .map((layer) => {
          const local = layerByName(localManifest, layer.name)

          return local ? mergeLayerDefinition(local, layer) : layer
        })

      writeJson(
        path.join(root, 'layers.json'),
        pruneManifest(root, { ...localManifest, layers: merged })
      )
    }

    changes.push(`manifest layers.json: ${addition.join(', ')} を追加`)

    for (const change of changes) console.log(`  ${change}`)

    if (options.dryRun) {
      console.log(
        `[dry-run] ${changes.length} 件の変更を検出しました（未適用）`
      )
      return
    }

    console.log(`[done] ${changes.length} 件の変更を適用しました`)

    if (conflicts.length > 0) {
      console.log('')
      console.log(
        '[warn] 次のファイルはローカルの変更と衝突しました。マージマーカーを解消してください:'
      )

      for (const relative of conflicts) console.log(`  - ${relative}`)
    }

    console.log('')
    console.log('  → yarn install で依存を入れ、yarn format で整形すること')
    console.log(
      '  → 環境変数・外部サービスの設定など、判断が要る手順は /add-<層名> スキルを参照'
    )
  } finally {
    source.cleanup()
  }
}

try {
  main()
} catch (error) {
  console.error(`[error] ${error.message}`)
  process.exit(1)
}
