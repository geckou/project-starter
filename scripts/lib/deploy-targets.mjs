// 「この環境で配るデプロイターゲット」を決める。
//
//   node scripts/lib/deploy-targets.mjs <環境名> <候補ターゲット（カンマ区切り）> [リポジトリのルート]
//   node scripts/lib/deploy-targets.mjs <環境名> <ターゲット> [ルート] --explicit  # 明示指定（--only）
//
// 標準出力に配るターゲットをカンマ区切りで出し、警告は標準エラーへ出す。
//
// **このテンプレートは 1 つの Firebase プロジェクトに develop / staging / production を
// 相乗りさせる構成だけを持つ**（→ .claude/docs/git-workflow.md「Firebase プロジェクトは
// 1 つに相乗りさせる」）。プロジェクト単位でしか存在しないものは、環境ごとに次のように扱う。
//
//   functions  関数ごとに「環境別」か「全環境共通」かを apps/functions/function-environments.json で
//              宣言する。環境別の関数は develop / staging では `<環境名>-<名前>`（グループ）、
//              production では `<名前>` のまま配る。全環境共通の関数は production だけが配る。
//              `firebase deploy --only functions:<名前>` で指定しなかった関数は前の版のまま
//              残るので、本番の関数は production へのデプロイまで変わらない（#408）
//   firestore / storage  環境で分けられない。production だけが既定で配る
//   hosting   環境ごとにサイトを分ける。この環境名のターゲットが firebase.json に無ければ、
//             production 以外では配らない（配る先が本番のサイトになるため。#323）
//
// 分けて持っているのは、選び方だけを回帰テストできるようにするため
// （scripts/test-deploy-targets.sh）。deploy.sh 本体は firebase CLI と
// 実プロジェクトが無いと流せない。

import { readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { declaredTargets } from './hosting-targets.mjs'

// 本番環境。プロジェクト単位のターゲット（ルール）と全環境共通の関数は、ここからだけ配る
export const PRODUCTION_ENVIRONMENT = 'production'

// 環境別の関数をグループ（<環境名>-<名前>）で持つ環境。
// apps/functions/src/index.ts のグループ名と一致させる（apps/functions/tests が検査する）
export const GROUPED_ENVIRONMENTS = ['develop', 'staging']

// 関数の環境宣言。apps/functions/src/index.ts の export と一致していることを
// apps/functions/tests/function-environments.test.ts が検査する
export const FUNCTION_MANIFEST_PATH =
  'apps/functions/function-environments.json'

// Firebase プロジェクト単位でしか存在せず、環境ごとに分けようがないターゲット
export const PROJECT_SCOPED_TARGETS = ['firestore', 'storage']

function kindOf(target) {
  return target.split(':')[0]
}

export function parseTargets(value) {
  return (value || '')
    .split(',')
    .map((target) => target.trim())
    .filter(Boolean)
}

// 宣言の形を検査して { perEnvironment, shared } を返す。
// 形が崩れている宣言で配ると、関数を取りこぼすか余計に配るので止める
export function normalizeManifest(manifest) {
  const names = (key) => {
    const value = manifest?.[key]

    if (
      !Array.isArray(value) ||
      !value.every((name) => typeof name === 'string')
    ) {
      throw new Error(
        `${FUNCTION_MANIFEST_PATH} の ${key} は関数名の配列にしてください`
      )
    }

    return value
  }

  const perEnvironment = names('perEnvironment')
  const shared = names('shared')
  const all = [...perEnvironment, ...shared]

  // 重複や環境名と同じ関数名は `--only functions:<名前>` を曖昧にする
  // （production から functions:develop を指定すると develop のグループごと配られる）
  const duplicated = all.filter((name, index) => all.indexOf(name) !== index)
  const reserved = all.filter(
    (name) =>
      name === PRODUCTION_ENVIRONMENT || GROUPED_ENVIRONMENTS.includes(name)
  )

  if (duplicated.length > 0 || reserved.length > 0) {
    throw new Error(
      `${FUNCTION_MANIFEST_PATH} に重複した名前か環境名と同じ名前があります: ${[...new Set([...duplicated, ...reserved])].join(', ')}`
    )
  }

  return { perEnvironment, shared }
}

// functions を、この環境で配る `functions:<名前>` の並びに展開する。
// manifest が undefined（宣言ファイルが無い）なら、production だけが従来どおり全部を配る
export function functionTargets(env, manifest) {
  if (manifest === undefined) {
    return env === PRODUCTION_ENVIRONMENT
      ? { targets: ['functions'], reason: undefined }
      : { targets: [], reason: 'no-manifest' }
  }

  if (env === PRODUCTION_ENVIRONMENT) {
    const names = [...manifest.perEnvironment, ...manifest.shared]

    return {
      targets: names.map((name) => `functions:${name}`),
      reason: names.length === 0 ? 'empty' : undefined,
    }
  }

  if (!GROUPED_ENVIRONMENTS.includes(env)) {
    return { targets: [], reason: 'unknown-environment' }
  }

  return manifest.perEnvironment.length === 0
    ? { targets: [], reason: 'empty' }
    : { targets: [`functions:${env}`], reason: undefined }
}

// この環境に配ってよい Hosting の宣言があるかどうか。
//
// 基準は「**この環境名のターゲット（target / site）が firebase.json にあること**」。
// hosting-targets.mjs が環境名で絞り込める形と同じで、それ以外は配る先が
// 他の環境（= 本番）と同じサイトになる:
//
//   - 宣言が無い / 単一（{ "source": "apps/web" } や { "site": "app" }）→ 全環境が同じサイト
//   - 複数あるが環境名が無い（staging と production だけ、web / admin のような役割分割）
//     → hosting-targets.mjs は絞り込めず全ターゲットに配る
//
// そこへ `deploy.sh develop` が配ると本番サイトが develop のビルドで上書きされる
// （#323 と同じ壊れ方）。DEPLOY_HOSTING_TARGETS で配る先を明示している場合は、
// 選んだのが人なのでそちらを尊重する
export function hostingSplitForEnvironment(
  hosting,
  env,
  explicitHostingTargets
) {
  if (explicitHostingTargets && explicitHostingTargets.trim() !== '')
    return true

  return declaredTargets(hosting).includes(env)
}

// 既定（--only なし、または CI が差分から選んだ候補）のターゲットを決める。
//
// hosting を省略した場合（firebase.json を読めなかった場合）は判断材料が無いので
// hosting を外さない
export function selectDefaultTargets(
  candidates,
  env,
  { manifest, hosting, explicitHostingTargets } = {}
) {
  const production = env === PRODUCTION_ENVIRONMENT
  const targets = []
  const dropped = []
  let functionsReason

  for (const target of candidates) {
    const kind = kindOf(target)

    if (target === 'functions') {
      const expanded = functionTargets(env, manifest)

      targets.push(...expanded.targets)
      functionsReason = expanded.reason

      if (expanded.targets.length === 0) dropped.push(target)
    } else if (PROJECT_SCOPED_TARGETS.includes(kind) && !production) {
      dropped.push(target)
    } else if (
      kind === 'hosting' &&
      !production &&
      hosting !== undefined &&
      !hostingSplitForEnvironment(hosting, env, explicitHostingTargets)
    ) {
      dropped.push(target)
    } else {
      targets.push(target)
    }
  }

  return { targets, dropped, functionsReason }
}

function functionsReasonLines(env, reason) {
  switch (reason) {
    case 'no-manifest':
      return [
        `${FUNCTION_MANIFEST_PATH} が無いため、${env} の関数を配れません。`,
        '  関数ごとに「環境別」か「全環境共通」かを宣言してください',
        '  （→ .claude/docs/git-workflow.md「Functions は環境別と全環境共通に分けて配る」）。',
      ]
    case 'unknown-environment':
      return [
        `${env} は関数のグループを持つ環境（${GROUPED_ENVIRONMENTS.join(' / ')}）ではないため、関数を配りません。`,
      ]
    case 'empty':
      return [`${FUNCTION_MANIFEST_PATH} に、${env} で配る関数がありません。`]
    default:
      return []
  }
}

export function defaultTargetWarnings(env, dropped, functionsReason) {
  if (dropped.length === 0) return []

  const lines = []
  const scoped = dropped.filter((target) =>
    PROJECT_SCOPED_TARGETS.includes(kindOf(target))
  )

  if (dropped.includes('functions')) {
    lines.push(...functionsReasonLines(env, functionsReason))
  }

  if (scoped.length > 0) {
    lines.push(
      `${scoped.join(' / ')} は環境で分けられない（全環境で 1 つ）ため、${env} の既定のデプロイ対象から外しました。`,
      `  ${PRODUCTION_ENVIRONMENT} へのデプロイで配られます。この環境から配るなら明示してください:`,
      `  bash scripts/deploy.sh ${env} --only ${scoped.join(',')}`
    )
  }

  // hosting は「明示すれば配れる」とは案内しない。サイトが 1 つしか無い構成で
  // 配ると、他の環境のサイト（= 本番）をこの環境のビルドで上書きするため
  if (dropped.some((target) => kindOf(target) === 'hosting')) {
    lines.push(
      `hosting も外しました: firebase.json の hosting に "${env}" のターゲット（target / site）が無く、`,
      '  配る先が他の環境と同じサイトになるためです。',
      `  配るには "${env}" という名前の Hosting ターゲットを用意してください`,
      '  （→ .claude/docs/git-workflow.md「Hosting のターゲットは環境名に合わせる」）。'
    )
  }

  return lines
}

// 明示指定（--only）を解決する。
//
// `functions` だけは**素通しせず、既定と同じく環境のぶんへ展開する。** staging から
// `firebase deploy --only functions` を実行すると、本番の関数まで staging の env で
// 上書きされる。`functions:<名前>` の個別指定は、選んだのが人なので止めない
export function resolveExplicitTargets(targets, env, { manifest } = {}) {
  const resolved = []
  let functionsReason

  for (const target of targets) {
    if (target === 'functions') {
      const expanded = functionTargets(env, manifest)

      resolved.push(...expanded.targets)
      functionsReason = expanded.reason
    } else {
      resolved.push(target)
    }
  }

  return { targets: resolved, functionsReason }
}

// 明示指定は止めない。ただし、他の環境にも同じものが配られる操作であることを知らせる
export function explicitTargetWarnings(
  env,
  requested,
  resolved,
  { hosting, explicitHostingTargets, functionsReason } = {}
) {
  const lines = []

  if (requested.includes('functions') && functionsReason !== undefined) {
    lines.push(...functionsReasonLines(env, functionsReason))
  }

  if (env === PRODUCTION_ENVIRONMENT) return lines

  const scoped = resolved.filter((target) =>
    PROJECT_SCOPED_TARGETS.includes(kindOf(target))
  )

  if (scoped.length > 0) {
    lines.push(
      `--only に含まれる ${scoped.join(' / ')} は環境で分かれません。全環境（本番を含む）に同じものが配られます。`
    )
  }

  // 自分のグループ（functions:<環境名> / functions:<環境名>-xxx）以外の関数は、
  // 他の環境（多くは本番）の関数を、この環境の env で上書きする
  const foreignFunctions = resolved.filter((target) => {
    if (kindOf(target) !== 'functions') return false

    const name = target.slice('functions:'.length)

    return (
      name !== env && !name.startsWith(`${env}-`) && !name.startsWith(`${env}.`)
    )
  })

  if (foreignFunctions.length > 0) {
    lines.push(
      `--only に含まれる ${foreignFunctions.join(' / ')} は ${env} のグループの外の関数です。`,
      `  ${env} の env で上書きされます（本番の関数なら、本番が ${env} の設定で動きます）。`
    )
  }

  // サイトを分けていない構成での --only hosting は、他の環境のサイト
  // （= 本番）をこの環境のビルドで上書きする
  if (
    resolved.some((target) => kindOf(target) === 'hosting') &&
    hosting !== undefined &&
    !hostingSplitForEnvironment(hosting, env, explicitHostingTargets)
  ) {
    lines.push(
      '--only の hosting は他の環境と同じサイトへ配ります',
      `  （firebase.json の hosting に "${env}" のターゲットがありません）。`
    )
  }

  return lines
}

// 関数の環境宣言。ファイルが無い（functions 層を持たない、宣言を足す前の派生）なら undefined
export function readManifest(path) {
  let raw

  try {
    raw = readFileSync(path, 'utf8')
  } catch (error) {
    if (error && error.code === 'ENOENT') return undefined
    throw error
  }

  return normalizeManifest(JSON.parse(raw))
}

// firebase.json の hosting 宣言。読めない場合と、hosting を持たない構成
// （functions だけの派生など）はどちらも undefined を返す。
// どちらも「hosting の配り先を判断する材料が無い」ケースで、hosting は外さない
function readHosting(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8')).hosting ?? undefined
  } catch {
    return undefined
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))

if (invokedDirectly) {
  const args = process.argv.slice(2)
  const explicit = args.includes('--explicit')
  const [env = '', rawTargets = '', root = '.'] = args.filter(
    (arg) => arg !== '--explicit'
  )
  const targets = parseTargets(rawTargets)
  const hosting = readHosting(join(root, 'firebase.json'))
  const explicitHostingTargets = process.env.DEPLOY_HOSTING_TARGETS

  let manifest

  try {
    manifest = readManifest(join(root, FUNCTION_MANIFEST_PATH))
  } catch (error) {
    // 宣言が壊れているまま配ると、関数を取りこぼすか本番へ余計に配る。
    // 絞り込みに失敗したら素通しせず止める
    console.error(
      `[error] ${FUNCTION_MANIFEST_PATH} を読めませんでした: ${error instanceof Error ? error.message : String(error)}`
    )
    process.exit(1)
  }

  // process.exit() は書き込みが終わる前にプロセスを落としうる（パイプへの
  // 書き込みは非同期）。stdout に出したあとは自然終了させる
  if (explicit) {
    const resolved = resolveExplicitTargets(targets, env, { manifest })

    for (const line of explicitTargetWarnings(env, targets, resolved.targets, {
      hosting,
      explicitHostingTargets,
      functionsReason: resolved.functionsReason,
    })) {
      console.error(`[warn] ${line}`)
    }

    process.stdout.write(resolved.targets.join(','))
  } else {
    const selected = selectDefaultTargets(targets, env, {
      manifest,
      hosting,
      explicitHostingTargets,
    })

    for (const line of defaultTargetWarnings(
      env,
      selected.dropped,
      selected.functionsReason
    )) {
      console.error(`[warn] ${line}`)
    }

    process.stdout.write(selected.targets.join(','))
  }
}
