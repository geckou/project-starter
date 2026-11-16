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
// 残る層の定義は**派生の layers.json を土台**にする。テンプレートの定義からは、
// 派生に無い項目のうち「取り込んだあとのツリーに実在するもの」だけを足す（#386）。
// 判定の中身は adoptTemplateItems を参照。
//
// node_modules に依存しない。yarn install なしで実行できる。

import fs from 'node:fs'
import path from 'node:path'

import {
  DEPENDENCY_FIELDS,
  applyRemoval,
  envKeyPlacement,
  findBlocks,
  layerByName,
  loadManifest,
  markerLayers,
  pruneManifest,
  readJson,
  requireFlagValue,
  resolveJsonPath,
  resolveRemoval,
  writeJson,
} from './lib/layers.mjs'

/** 層の定義のうち、項目の一覧を持つキー。これ以外はスカラーとして扱う */
const LIST_FIELDS = ['files', 'blocks', 'env']
const FILE_KEYED_FIELDS = ['deps', 'scripts', 'json']
const ITEM_FIELDS = new Set([...LIST_FIELDS, ...FILE_KEYED_FIELDS, 'replace'])

/**
 * 派生の層の定義（local）を土台に、テンプレートの定義（source）で増えた項目を足す。
 *
 * 以前は残る層の定義をテンプレートのもので丸ごと差し替えていたため、派生が足した
 * env / files / blocks、`removable: false`、外した json のキーが同期のたびに
 * テンプレートの値へ戻り、check-layers.mjs が落ちていた（#386）。
 *
 * - スカラー（title / requires / removable / summary / notes 等）は**派生を正**にする。
 *   派生の定義に無いキーだけテンプレートから補う
 * - 項目の一覧は和集合。ただしテンプレート側にしか無い項目は、**check-layers.mjs が
 *   受け付ける状態で実在するものだけ**を足す
 *     files   … パスが実在する
 *     blocks  … そのファイルにこの層のマーカーがある
 *     env     … .env.example にあり、全ての代入行がこの層の範囲にある
 *     deps / scripts / json … 対象の JSON にその依存・スクリプト・キーがある
 *     replace … 対象ファイルに find がある
 *
 * 「テンプレートが新しく足した項目」と「派生が意図して外した項目」は、基準になる
 * 過去のマニフェストが無いので区別できない。実在で判定するのはそのためで、
 * 派生が実体ごと外した項目（firebase.json から消したキー等）は戻らず、実体が
 * 届いている項目（同期で入ってきた新しいファイル等）は入る。`.env*` や `apps/` の
 * ように同期されないものは、派生が実体を足した時点で次の同期から載る。
 *
 * 派生の別の層が既に持っている項目も足さない（派生が層をまたいで移した項目を
 * 2 つの層に載せないため。blocks は 1 ファイルに複数の層のマーカーが入るので対象外）。
 *
 * 派生側の項目で実在しなくなったものは、このあとの pruneManifest が落とす
 * （remove-layer.mjs と同じ判定）。
 */
function adoptTemplateItems(root, manifest, local, source) {
  const adopted = []
  const merged = { ...local }

  const exists = (relative) => fs.existsSync(path.join(root, relative))
  const read = (relative) =>
    exists(relative) ? fs.readFileSync(path.join(root, relative), 'utf8') : null
  const json = (relative) =>
    exists(relative) ? readJson(path.join(root, relative)) : null
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  const others = manifest.layers.filter((layer) => layer.name !== local.name)

  for (const [key, value] of Object.entries(source)) {
    if (!ITEM_FIELDS.has(key) && !(key in merged)) merged[key] = value
  }

  const envExample = read('.env.example')

  const acceptable = {
    files: (relative) => exists(relative),
    blocks: (relative) => {
      const content = read(relative)

      return (
        content !== null &&
        findBlocks(content).some((block) =>
          markerLayers(block.spec).includes(local.name)
        )
      )
    },
    env: (key) =>
      envExample !== null && envKeyPlacement(envExample, local, key) === 'ok',
    deps: (dependency, relative) =>
      DEPENDENCY_FIELDS.some(
        (field) => json(relative)?.[field]?.[dependency] !== undefined
      ),
    scripts: (script, relative) =>
      json(relative)?.scripts?.[script] !== undefined,
    json: (keys, relative) => {
      const target = json(relative)
      const resolved = target === null ? null : resolveJsonPath(target, keys)

      return Boolean(resolved) && resolved.parent[resolved.key] !== undefined
    },
  }

  for (const field of LIST_FIELDS) {
    const additions = (source[field] ?? []).filter(
      (item) =>
        !(local[field] ?? []).includes(item) &&
        // blocks は層ごとにマーカーを持つので、他の層に載っていても別物
        (field === 'blocks' ||
          !others.some((layer) => (layer[field] ?? []).includes(item))) &&
        acceptable[field](item)
    )

    if (additions.length === 0) continue

    merged[field] = [...(local[field] ?? []), ...additions]
    adopted.push(...additions.map((item) => `${field}: ${item}`))
  }

  for (const field of FILE_KEYED_FIELDS) {
    for (const [relative, items] of Object.entries(source[field] ?? {})) {
      const additions = items.filter(
        (item) =>
          !(local[field]?.[relative] ?? []).some((own) => same(own, item)) &&
          !others.some((layer) =>
            (layer[field]?.[relative] ?? []).some((own) => same(own, item))
          ) &&
          acceptable[field](item, relative)
      )

      if (additions.length === 0) continue

      merged[field] = {
        ...merged[field],
        [relative]: [...(merged[field]?.[relative] ?? []), ...additions],
      }
      adopted.push(
        ...additions.map(
          (item) => `${field}: ${relative} の ${[item].flat().join('.')}`
        )
      )
    }
  }

  const additions = (source.replace ?? []).filter((rule) => {
    const claimed = manifest.layers.some((layer) =>
      (layer.replace ?? []).some(
        (own) => own.file === rule.file && own.find === rule.find
      )
    )

    return !claimed && (read(rule.file) ?? '').includes(rule.find)
  })

  if (additions.length > 0) {
    merged.replace = [...(local.replace ?? []), ...additions]
    adopted.push(...additions.map((rule) => `replace: ${rule.file}`))
  }

  return { layer: merged, adopted }
}

function parseArguments(argv) {
  const options = { target: process.cwd(), template: '', dryRun: false }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]

    if (argument === '--target') {
      index += 1
      options.target = requireFlagValue('--target', argv[index])
    } else if (argument === '--template') {
      index += 1
      options.template = requireFlagValue('--template', argv[index])
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

  // 外した層が無くても、ここで終わらせない。layers.json は同期対象外なので、
  // テンプレートが既存の層に足した項目（新しいファイル・マーカー）は下の取り込みでしか
  // 派生の定義に入らない。入らないと、同期されたファイルのマーカーが「未登録」として
  // check-layers.mjs に検出され、全部入りの派生だけ同期 PR が赤くなる
  const changes = []

  if (missing.length === 0) {
    console.log('[ok] 外した層はありません（全部入りの構成）')
  } else {
    const removal = resolveRemoval(template, missing)

    console.log(`[plan] 取り込んだ差分から外し直す層: ${removal.join(', ')}`)

    changes.push(
      ...applyRemoval(root, template, removal, { dryRun: options.dryRun })
    )
    changes.push(`manifest layers.json: ${removal.join(', ')} を削除`)
  }

  if (!options.dryRun) {
    // 残る層の定義は派生側を土台にし、テンプレートで増えた項目のうち実在するものだけを
    // 足す（#386）。減算を適用したあとのツリーで判定するので、dry-run では行わない。
    // 派生でしか定義していない層は、テンプレートに無いのでそのまま残る
    const layers = local.layers.map((layer) => {
      const source = layerByName(template, layer.name)

      if (!source) return layer

      const result = adoptTemplateItems(root, local, layer, source)

      for (const item of result.adopted) {
        changes.push(`manifest layers.json: ${layer.name}.${item} を追加`)
      }

      return result.layer
    })

    // layers 以外（source.repository / source.ref / markers / $comment）も
    // 派生プロジェクト側を正にする。テンプレートのものを被せると、派生が自分の
    // scaffold 元を指すよう書き換えた source が毎回巻き戻り、以後 add-layer が
    // 誤ったリポジトリを clone する（#356）
    //
    // 変更が無いときは書かない（整形だけの差分を同期 PR に混ぜない）
    if (changes.length > 0) {
      writeJson(
        path.join(root, 'layers.json'),
        pruneManifest(root, { ...local, layers })
      )
    }
  }

  if (changes.length === 0) return

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
