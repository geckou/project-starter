#!/usr/bin/env node
// 層マニフェスト（layers.json）とリポジトリの実態が一致しているか検査する。
//
//   node scripts/check-layers.mjs
//
// マニフェストはファイルを移動・削除した瞬間に嘘になる（型チェックにもテストにも
// 引っかからない）ため、check-docs.sh と同じ考え方で機械的に検出する。
//
// 検査するもの:
//   1. 層の定義（requires の解決・一直線の依存・重複名）
//   2. files に挙げたパスが実在するか
//   3. マーカーの層名が宣言済みで、対応が取れているか
//   4. blocks に挙げたファイルに、その層のマーカーが実在するか（逆も）
//   5. deps / scripts / json のキーが実在するか
//   6. replace の find が実在するか
//   7. env に挙げたキーが .env.example の当該層のマーカー内に（全ての代入行が）あるか
//
// node_modules に依存しない。yarn install なしで実行できる。

import fs from 'node:fs'
import path from 'node:path'

import {
  DEPENDENCY_FIELDS,
  SELF_DOCUMENTING,
  envKeyPlacement,
  findBlocks,
  isTextFile,
  listFiles,
  loadManifest,
  markerLayers,
  readJson,
  resolveJsonPath,
} from './lib/layers.mjs'

const root = path.resolve(path.dirname(process.argv[1]), '..')
const errors = []

function fail(message) {
  errors.push(message)
}

// 層マニフェストを持たないプロジェクト（層の構成をやめた派生プロジェクト等）では
// 検査するものが無い。落とさずに抜ける
if (!fs.existsSync(path.join(root, 'layers.json'))) {
  console.log(
    '[skip] layers.json が無いため層マニフェストの検査をスキップします'
  )
  process.exit(0)
}

const manifest = loadManifest(root)
const names = manifest.layers.map((layer) => layer.name)

// --- 1. 層の定義 ---
if (new Set(names).size !== names.length) fail('層名が重複しています')

const base = manifest.layers.filter((layer) => layer.requires === null)

if (base.length !== 1)
  fail('requires: null の層（core）はちょうど1つであること')

for (const layer of manifest.layers) {
  if (layer.requires !== null && !names.includes(layer.requires)) {
    fail(`${layer.name}.requires が未定義の層を指しています: ${layer.requires}`)
  }

  if (layer.requires === layer.name)
    fail(`${layer.name} が自分自身を requires しています`)

  if (!layer.title || !layer.summary) {
    fail(`${layer.name} に title / summary がありません`)
  }
}

// --- 2. files の実在 ---
for (const layer of manifest.layers) {
  for (const relative of layer.files ?? []) {
    if (!fs.existsSync(path.join(root, relative))) {
      fail(`${layer.name}.files が存在しません: ${relative}`)
    }
  }
}

// --- 3-4. マーカー ---
const markersByLayer = new Map(names.map((name) => [name, new Set()]))

for (const relative of listFiles(root)) {
  if (!isTextFile(relative)) continue

  // マーカーの構文そのものを説明しているファイルは検査対象にしない
  if (SELF_DOCUMENTING.has(relative)) continue

  const content = fs.readFileSync(path.join(root, relative), 'utf8')

  if (!content.includes('layer:')) continue

  let blocks

  try {
    blocks = findBlocks(content)
  } catch (error) {
    fail(
      `${relative}: ${error instanceof Error ? error.message : String(error)}`
    )
    continue
  }

  for (const block of blocks) {
    for (const name of markerLayers(block.spec)) {
      if (!markersByLayer.has(name)) {
        fail(`${relative}: 未定義の層のマーカーです: layer:${block.spec}`)
        continue
      }

      markersByLayer.get(name).add(relative)
    }
  }
}

for (const layer of manifest.layers) {
  const declared = new Set(layer.blocks ?? [])
  const actual = markersByLayer.get(layer.name)

  for (const relative of declared) {
    if (!actual.has(relative)) {
      fail(
        `${layer.name}.blocks に挙がっているがマーカーがありません: ${relative}`
      )
    }
  }

  for (const relative of actual) {
    if (!declared.has(relative)) {
      fail(
        `layer:${layer.name} のマーカーが ${layer.name}.blocks に未登録です: ${relative}`
      )
    }
  }
}

// --- 5. deps / scripts / json ---
for (const layer of manifest.layers) {
  for (const [relative, dependencies] of Object.entries(layer.deps ?? {})) {
    const target = path.join(root, relative)

    if (!fs.existsSync(target)) {
      fail(`${layer.name}.deps の package.json が存在しません: ${relative}`)
      continue
    }

    const json = readJson(target)

    for (const dependency of dependencies) {
      // 減算が落とす対象と同じフィールドを見る（optionalDependencies を含む）
      const found = DEPENDENCY_FIELDS.some(
        (field) => json[field]?.[dependency] !== undefined
      )

      if (!found) {
        fail(
          `${layer.name}.deps に無い依存が挙がっています: ${relative} の ${dependency}`
        )
      }
    }
  }

  for (const [relative, scripts] of Object.entries(layer.scripts ?? {})) {
    const target = path.join(root, relative)

    if (!fs.existsSync(target)) {
      fail(`${layer.name}.scripts の package.json が存在しません: ${relative}`)
      continue
    }

    const json = readJson(target)

    for (const script of scripts) {
      if (json.scripts?.[script] === undefined) {
        fail(
          `${layer.name}.scripts に無いスクリプトが挙がっています: ${relative} の ${script}`
        )
      }
    }
  }

  for (const [relative, keyPaths] of Object.entries(layer.json ?? {})) {
    const target = path.join(root, relative)

    if (!fs.existsSync(target)) {
      fail(`${layer.name}.json の対象ファイルが存在しません: ${relative}`)
      continue
    }

    const json = readJson(target)

    for (const keys of keyPaths) {
      const resolved = resolveJsonPath(json, keys)

      if (!resolved || resolved.parent[resolved.key] === undefined) {
        fail(
          `${layer.name}.json に無いキーが挙がっています: ${relative} の ${keys.join('.')}`
        )
      }
    }
  }

  // --- 6. replace ---
  for (const rule of layer.replace ?? []) {
    const target = path.join(root, rule.file)

    if (!fs.existsSync(target)) {
      fail(`${layer.name}.replace の対象ファイルが存在しません: ${rule.file}`)
      continue
    }

    if (!fs.readFileSync(target, 'utf8').includes(rule.find)) {
      fail(`${layer.name}.replace の find が見つかりません: ${rule.file}`)
    }
  }
}

// --- 7. env ---
// .env* は Template Sync の対象外なので、派生が .env.example を消して layers.json だけ
// 残している状態はあり得る。無条件に読むと、ここまでに集めた指摘を 1 つも出さずに
// 生の ENOENT で落ちる（#313）。pruneManifest も同じファイルの不在を許容している
const envExamplePath = path.join(root, '.env.example')
const envExample = fs.existsSync(envExamplePath)
  ? fs.readFileSync(envExamplePath, 'utf8')
  : null

// マーカーが壊れていると範囲が決まらない（3-4 で報告済み）ので、env の検査だけ飛ばす
let envCheckable = envExample !== null

if (envExample === null) {
  // env を宣言している層が無ければ検査するものが無い。あれば、宣言が実態と合っていない
  for (const layer of manifest.layers) {
    if ((layer.env ?? []).length === 0) continue

    fail(
      `${layer.name}.env が挙がっていますが .env.example がありません` +
        '（.env.example を戻すか、layers.json の env を外してください）'
    )
  }
} else {
  try {
    findBlocks(envExample)
  } catch {
    envCheckable = false
  }
}

for (const layer of envCheckable ? manifest.layers : []) {
  for (const key of layer.env ?? []) {
    // 判定は全ての代入行を見る。どれか 1 行が範囲内にあるだけで通すと、同じキーを
    // マーカーの外にも書いた状態を見逃し、減算しても外側の行が残る（#311）
    const placement = envKeyPlacement(envExample, layer, key)

    if (placement === 'missing') {
      fail(`${layer.name}.env のキーが .env.example にありません: ${key}`)
      continue
    }

    if (placement === 'ok') continue

    // core は層のマーカーを持たない（マーカー外＝core）
    if (layer.requires === null) {
      fail(`core.env のキーが層のマーカー内にあります: ${key}`)
      continue
    }

    fail(
      `${layer.name}.env のキーが layer:${layer.name} のマーカーの外にあります` +
        `（全ての代入行をマーカー内に置くこと）: ${key}`
    )
  }
}

// --- ワークスペースの公開区分 ---------------------------------------------
// add-layer.mjs / adopt-references.mjs は「`private: true` でないワークスペースは
// npm へ公開するもの」と見なし、スコープ書き換えの対象から外す。新しく足した
// ワークスペースで private を書き忘れると、黙って書き換え漏れになる（型チェックにも
// テストにも引っかからない）。どちらのつもりなのかを必ず宣言させる。
for (const group of ['apps', 'packages']) {
  const dir = path.join(root, group)

  if (!fs.existsSync(dir)) continue

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue

    const file = path.join(dir, entry.name, 'package.json')

    if (!fs.existsSync(file)) continue

    const workspace = JSON.parse(fs.readFileSync(file, 'utf8'))

    if (workspace.private === true || workspace.publishConfig !== undefined) {
      continue
    }

    fail(
      `${group}/${entry.name}/package.json に private も publishConfig もありません。` +
        'ワークスペース内部のものなら `"private": true`、npm へ公開するなら ' +
        'publishConfig を書いてください（スコープ書き換えの対象がこれで決まります）'
    )
  }
}

if (errors.length > 0) {
  console.error('[error] 層マニフェストとリポジトリの実態が一致していません:')

  for (const message of errors) console.error(`  - ${message}`)

  console.error('')
  console.error(
    '  layers.json を実態に合わせて更新してください（.claude/docs/layers.md 参照）'
  )
  process.exit(1)
}

console.log(`[ok] 層マニフェストは実態と一致しています（${names.length} 層）`)
