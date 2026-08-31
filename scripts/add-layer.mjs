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

const COPY_SKIP = new Set([
  '.git',
  'node_modules',
  'dist',
  '.next',
  '.turbo',
  'coverage',
])

/**
 * テンプレートを一時ディレクトリへ写し、**今回足さない層をそこで落とす**。
 *
 * ローカルに対して後から落とすと、派生プロジェクトが独自に置いたファイルまで
 * 巻き込む（core に自作の apps/mobile/ がある状態で firebase を足すと、mobile 層の
 * 定義に従って apps/mobile ごと消える）。取り込む前に手本の側を整えておけば、
 * ローカルには「足す層の内容」しか入らない。
 */
function stageSource(sourceDir, sourceManifest, remaining) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'layer-stage-'))

  fs.cpSync(sourceDir, dir, {
    recursive: true,
    filter: (from) => !COPY_SKIP.has(path.basename(from)),
  })

  if (remaining.length > 0) applyRemoval(dir, sourceManifest, remaining)

  return {
    dir,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  }
}

/** ワークスペース（apps/* と packages/*）の package.json の name を集める */
function workspacePackageNames(root) {
  const names = []

  for (const group of ['apps', 'packages']) {
    const dir = path.join(root, group)

    if (!fs.existsSync(dir)) continue

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue

      const manifest = path.join(dir, entry.name, 'package.json')

      if (!fs.existsSync(manifest)) continue

      const { name } = readJson(manifest)

      if (typeof name === 'string') names.push(name)
    }
  }

  return names
}

/**
 * テンプレートと派生プロジェクトでワークスペースのスコープが違う場合の対応表を作る。
 *
 * /init-project は内部のスコープを `@<プロジェクト名>/*` にリネームする。
 * 取り込む内容をそのまま置くと `@geckou/shared` 等が再混入して依存が解決できないため、
 * **ワークスペースの名前だけ**を置き換える（npm から取る `@geckou/billing` 等は対象外）。
 */
function detectScopeRename(stageDir, root) {
  const scopeOf = (name) => name.match(/^@([^/]+)\//)?.[1]
  const baseOf = (name) => name.replace(/^@[^/]+\//, '')

  const sourceNames = workspacePackageNames(stageDir)
  const localNames = workspacePackageNames(root)

  const sourceScope = sourceNames.map(scopeOf).find(Boolean)
  const localScope = localNames.map(scopeOf).find(Boolean)

  if (!sourceScope || !localScope || sourceScope === localScope) return null

  // テンプレート側のワークスペース名（＝内部パッケージ）だけを置き換え対象にする
  const internal = new Set(sourceNames.map(baseOf))

  return { sourceScope, localScope, internal }
}

function applyScopeRename(content, rename) {
  if (!rename || typeof content !== 'string') return content

  let renamed = content

  for (const name of rename.internal) {
    renamed = renamed
      .split(`@${rename.sourceScope}/${name}`)
      .join(`@${rename.localScope}/${name}`)
  }

  return renamed
}

/** 拡張子から、スコープの置換をかけてよいテキストかを判定する */
function isRenamableText(file) {
  return (
    /\.(json|ts|tsx|js|jsx|mjs|cjs|md|ya?ml|sh|css|rules)$/.test(file) ||
    path.basename(file).startsWith('.env')
  )
}

/** ディレクトリ・ファイルを写す。テキストはスコープを置き換えながら書く */
function copyRecursive(from, to, rename) {
  const stat = fs.statSync(from)

  if (stat.isDirectory()) {
    fs.mkdirSync(to, { recursive: true })

    for (const entry of fs.readdirSync(from)) {
      copyRecursive(path.join(from, entry), path.join(to, entry), rename)
    }

    return
  }

  fs.mkdirSync(path.dirname(to), { recursive: true })

  if (rename && isRenamableText(from)) {
    fs.writeFileSync(
      to,
      applyScopeRename(fs.readFileSync(from, 'utf8'), rename)
    )
    return
  }

  fs.copyFileSync(from, to)
}

/**
 * 層を足したファイルの内容を、ローカルの変更を保ったまま作る。
 *
 * base   = 手本から今回足す層を外したもの（＝ローカルのファイルの出自）
 * ours   = ローカルのファイル
 * theirs = 手本のファイル（今回足さない層は既に落としてある）
 *
 * の 3-way マージ。ローカルに手が入っていなければ theirs がそのまま採用される。
 */
function mergeWithLayer(localContent, sourceContent, addition, additionLayers) {
  let base = stripBlocks(sourceContent, addition)

  // 減算が置換で消していた箇所（replace）も base 側に反映しておく
  for (const layer of additionLayers) {
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
  let stage = null

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

    // ローカルに無く、今回も足さない層。手本の側から先に落としておく
    const remaining = sourceManifest.layers
      .map((layer) => layer.name)
      .filter((name) => !present.has(name) && !addition.includes(name))

    stage = stageSource(source.dir, sourceManifest, remaining)

    const rename = detectScopeRename(stage.dir, root)

    if (rename) {
      console.log(
        `[info] ワークスペースのスコープを合わせます: @${rename.sourceScope}/* → @${rename.localScope}/*`
      )
    }

    const changes = []
    const conflicts = []

    // 1. ファイル・ディレクトリ
    for (const layer of layers) {
      for (const relative of layer.files ?? []) {
        const from = path.join(stage.dir, relative)
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

        if (!options.dryRun) copyRecursive(from, to, rename)
      }
    }

    // 2. マーカーの範囲と、置換で消えていた箇所（3-way マージで戻す）
    const mergeTargets = new Set()

    for (const layer of layers) {
      for (const relative of layer.blocks ?? []) mergeTargets.add(relative)
      for (const rule of layer.replace ?? []) mergeTargets.add(rule.file)
    }

    for (const relative of [...mergeTargets].sort()) {
      const from = path.join(stage.dir, relative)

      if (!fs.existsSync(from)) {
        console.log(`[warn] テンプレートに存在しません: ${relative}`)
        continue
      }

      const to = path.join(root, relative)
      const sourceContent = applyScopeRename(
        fs.readFileSync(from, 'utf8'),
        rename
      )
      const localContent = fs.existsSync(to)
        ? fs.readFileSync(to, 'utf8')
        : null

      const { content, conflicted } = mergeWithLayer(
        localContent,
        sourceContent,
        addition,
        layers
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
      const restoreValue = (relative, keys, kind, { localKeys } = {}) => {
        const from = path.join(stage.dir, relative)
        const to = path.join(root, relative)

        if (!fs.existsSync(from) || !fs.existsSync(to)) return

        const sourceJson = readJson(from)
        const localJson = readJson(to)
        const sourceEntry = resolveJsonPath(sourceJson, keys)

        if (!sourceEntry || sourceEntry.parent[sourceEntry.key] === undefined) {
          return
        }

        const localEntry = ensureJsonPath(localJson, localKeys ?? keys)

        if (localEntry.parent[localEntry.key] !== undefined) return

        localEntry.parent[localEntry.key] = rename
          ? JSON.parse(
              applyScopeRename(
                JSON.stringify(sourceEntry.parent[sourceEntry.key]),
                rename
              )
            )
          : sourceEntry.parent[sourceEntry.key]
        restoreKeyOrder(localEntry.parent, sourceEntry.parent)

        changes.push(`${kind} ${relative}: ${keys.join('.')}`)

        if (!options.dryRun) writeJson(to, localJson)
      }

      for (const [relative, names] of Object.entries(layer.deps ?? {})) {
        for (const dependency of names) {
          const from = path.join(stage.dir, relative)

          if (!fs.existsSync(from)) continue

          const sourceJson = readJson(from)
          const field = DEPENDENCY_FIELDS.find(
            (candidate) => sourceJson[candidate]?.[dependency] !== undefined
          )

          if (!field) continue

          restoreValue(relative, [field, dependency], 'dep    ', {
            localKeys: [field, applyScopeRename(dependency, rename)],
          })
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

    // 4. マニフェストに層の定義を戻す。
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
    stage?.cleanup()
    source.cleanup()
  }
}

try {
  main()
} catch (error) {
  console.error(`[error] ${error.message}`)
  process.exit(1)
}
