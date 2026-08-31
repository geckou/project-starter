// 層マニフェスト（layers.json）を読むための共通処理。
// remove-layer.mjs（減算）と check-layers.mjs（検証）の両方から使う。
//
// node_modules に依存しない（Node 22 の標準 API のみ）。yarn install なしで動く。

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

/** マーカーの構文: <コメント記号> layer:<層名>[,<層名>...]:start | :end */
export const MARKER_PATTERN = /layer:([a-zA-Z0-9,_-]+):(start|end)/

/** テキストとして走査しないディレクトリ */
const SKIP_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  '.next',
  '.expo',
  '.turbo',
  'dist',
  'coverage',
  'out',
])

/** マーカーを含みうるファイルの拡張子。拡張子なしのファイルは対象外 */
const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.yml',
  '.yaml',
  '.sh',
  '.md',
  '.rules',
  '.css',
  '.example',
])

export function loadManifest(root) {
  const manifestPath = path.join(root, 'layers.json')

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`層マニフェストが見つかりません: ${manifestPath}`)
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))

  if (!Array.isArray(manifest.layers) || manifest.layers.length === 0) {
    throw new Error('layers.json に layers 配列がありません')
  }

  return manifest
}

export function layerByName(manifest, name) {
  return manifest.layers.find((layer) => layer.name === name)
}

/**
 * 外す層の集合を求める。
 * 層は一直線の依存関係なので、外した層に依存する層（子孫）も一緒に外れる。
 */
export function resolveRemoval(manifest, names) {
  const removal = new Set()

  const addWithDependents = (name) => {
    if (removal.has(name)) return

    const layer = layerByName(manifest, name)

    if (!layer) {
      throw new Error(`未定義の層です: ${name}`)
    }

    if (layer.removable === false) {
      throw new Error(`${name} は外せない層です（core は常に残る）`)
    }

    removal.add(name)

    for (const candidate of manifest.layers) {
      if (candidate.requires === name) addWithDependents(candidate.name)
    }
  }

  for (const name of names) addWithDependents(name)

  // 宣言順（core に近い層から）に並べ替える
  return manifest.layers
    .filter((layer) => removal.has(layer.name))
    .map((layer) => layer.name)
}

/** マーカー行の層指定（"billing,mobile"）を配列にする */
export function markerLayers(spec) {
  return spec.split(',').map((name) => name.trim())
}

/** 走査対象のファイル一覧。git 管理下ならそれを使い、無ければ再帰的に集める */
export function listFiles(root) {
  try {
    const tracked = execFileSync('git', ['-C', root, 'ls-files', '-z'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })

    const files = tracked.split('\0').filter((file) => file !== '')

    if (files.length > 0) {
      return files.filter((file) => fs.existsSync(path.join(root, file)))
    }
  } catch {
    // git が無い / git 管理下でない場合はディレクトリ走査にフォールバックする
  }

  const files = []

  const walk = (relative) => {
    const absolute = path.join(root, relative)

    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue

      const next = relative === '' ? entry.name : `${relative}/${entry.name}`

      if (entry.isDirectory()) {
        walk(next)
      } else if (entry.isFile()) {
        files.push(next)
      }
    }
  }

  walk('')

  return files
}

export function isTextFile(file) {
  const base = path.basename(file)

  if (base === '.env.example') return true

  return TEXT_EXTENSIONS.has(path.extname(file))
}

/**
 * マーカーで囲まれた範囲を数え上げる。
 * 返り値は { spec, startLine, endLine } の配列（マーカー行自体を含む範囲）。
 */
export function findBlocks(content) {
  const lines = content.split('\n')
  const blocks = []
  const open = []

  lines.forEach((line, index) => {
    const match = line.match(MARKER_PATTERN)

    if (!match) return

    const [, spec, kind] = match

    if (kind === 'start') {
      open.push({ spec, startLine: index })
      return
    }

    const last = open.pop()

    if (!last || last.spec !== spec) {
      throw new Error(
        `マーカーの対応が取れません（${index + 1} 行目の layer:${spec}:end）`
      )
    }

    blocks.push({ spec, startLine: last.startLine, endLine: index })
  })

  if (open.length > 0) {
    const unclosed = open[0]

    throw new Error(
      `閉じていないマーカーがあります（${unclosed.startLine + 1} 行目の layer:${unclosed.spec}:start）`
    )
  }

  return blocks
}

/** 継ぎ目の重複として落としてよい行か（空行と、コメント記号だけの行） */
function isSeamBlank(line) {
  return ['', '#', '//'].includes(line.trim())
}

/**
 * removal に含まれる層のマーカー範囲を削除する。
 * 削除対象の範囲に入れ子になっている他層のマーカーも、範囲ごと消える。
 */
export function stripBlocks(content, removal) {
  const removed = new Set(removal)
  const lines = content.split('\n')
  const kept = []

  let dropUntil = null
  let justDropped = false

  for (const line of lines) {
    const match = line.match(MARKER_PATTERN)

    if (dropUntil !== null) {
      if (match && match[2] === 'end' && match[1] === dropUntil) {
        dropUntil = null
        justDropped = true
      }

      continue
    }

    if (match && match[2] === 'start') {
      const layers = markerLayers(match[1])

      // 列挙されたいずれかの層が外れるなら、この範囲は消える
      if (layers.some((name) => removed.has(name))) {
        dropUntil = match[1]
        continue
      }
    }

    // 削除した範囲の前後がどちらも空行（コメント記号だけの行を含む）だと、
    // 同じ行が2つ続いて残る。継ぎ目にできた余分な1行だけを落とす
    const previous = kept[kept.length - 1]

    if (
      justDropped &&
      previous !== undefined &&
      isSeamBlank(line) &&
      previous.trim() === line.trim()
    ) {
      continue
    }

    justDropped = false
    kept.push(line)
  }

  // 先頭の範囲を消した場合に残る、ファイル冒頭の空行を落とす
  while (kept.length > 0 && kept[0].trim() === '') kept.shift()

  return kept.join('\n')
}

/**
 * 残った層の定義から、減算で実態と合わなくなった項目を落とす。
 *
 * 層の交点（billing の RevenueCat が mobile 側のファイルを指す等）があるため、
 * 「外した層の定義を消す」だけでは残った層の定義が実態とずれる。
 * 検証と同じ判定で、実在しなくなった項目だけを落とす。
 */
export function pruneManifest(root, manifest) {
  const exists = (relative) => fs.existsSync(path.join(root, relative))

  const readIfExists = (relative) =>
    exists(relative) ? fs.readFileSync(path.join(root, relative), 'utf8') : null

  const hasMarker = (relative, name) => {
    const content = readIfExists(relative)

    if (content === null) return false

    return findBlocks(content).some((block) =>
      markerLayers(block.spec).includes(name)
    )
  }

  const envExample = readIfExists('.env.example') ?? ''

  const layers = manifest.layers.map((layer) => {
    const pruned = { ...layer }

    if (layer.files) pruned.files = layer.files.filter(exists)

    if (layer.blocks) {
      pruned.blocks = layer.blocks.filter((file) => hasMarker(file, layer.name))
    }

    for (const field of ['deps', 'scripts', 'json']) {
      if (!layer[field]) continue

      pruned[field] = Object.fromEntries(
        Object.entries(layer[field]).filter(([file]) => exists(file))
      )
    }

    if (layer.replace) {
      pruned.replace = layer.replace.filter((rule) => {
        const content = readIfExists(rule.file)

        return content !== null && content.includes(rule.find)
      })
    }

    if (layer.env) {
      pruned.env = layer.env.filter((key) =>
        new RegExp(`^#?\\s*${key}=`, 'm').test(envExample)
      )
    }

    return pruned
  })

  return { ...manifest, layers }
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

export function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

/** ["exports", "./billing"] のようなキー列を辿って親オブジェクトと末尾キーを返す */
export function resolveJsonPath(value, keys) {
  let parent = value

  for (const key of keys.slice(0, -1)) {
    if (parent === undefined || parent === null) return null

    parent = parent[key]
  }

  if (parent === undefined || parent === null) return null

  return { parent, key: keys[keys.length - 1] }
}
