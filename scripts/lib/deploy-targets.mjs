// .firebaserc の projects から「この環境で既定で配るデプロイターゲット」を決める。
//
//   node scripts/lib/deploy-targets.mjs <環境名> <候補ターゲット（カンマ区切り）> [.firebaserc のパス]
//   node scripts/lib/deploy-targets.mjs <環境名> <ターゲット> [パス] --explicit  # 警告だけ出して素通しする
//
// 標準出力に配るターゲットをカンマ区切りで出し、警告は標準エラーへ出す。
//
// **1 つの Firebase プロジェクトに環境を相乗りさせる構成**（`.firebaserc` の projects で
// develop / staging / production が同じプロジェクト ID を指し、Hosting サイトだけ分ける。
// → .claude/docs/git-workflow.md）では、`functions` / `firestore` / `storage` は環境で
// 分かれない。既定のまま配ると `deploy.sh develop` が本番の関数とルールを
// `--force` で上書きする（#358）。そこで**同じプロジェクトを共有する環境のうち、
// いちばん本番側の環境だけ**が既定でそれらを配り、他の環境では既定から外す。
//
// 分けて持っているのは、選び方だけを回帰テストできるようにするため
// （scripts/test-deploy-targets.sh）。deploy.sh 本体は firebase CLI と
// 実プロジェクトが無いと流せない。

import { readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// 本番側ほど後ろ。同じプロジェクトを共有する環境のうち「誰が既定で配るか」を決めるのに使う
export const ENVIRONMENT_ORDER = ['develop', 'staging', 'production']

// Firebase プロジェクト単位でしか存在せず、Hosting のように環境ごとのサイトへ
// 分けられないターゲット
export const PROJECT_SCOPED_TARGETS = ['functions', 'firestore', 'storage']

// "functions:api" のような個別指定も functions として扱う
export function isProjectScoped(target) {
  return PROJECT_SCOPED_TARGETS.includes(target.split(':')[0])
}

export function parseTargets(value) {
  return (value || '')
    .split(',')
    .map((target) => target.trim())
    .filter(Boolean)
}

// .firebaserc の projects から環境エイリアスを取り出す。
// `default` は「エイリアスを省いたときの向き先」であって環境ではないため除く
function environmentEntries(projects) {
  return Object.entries(projects || {}).filter(([alias]) => alias !== 'default')
}

// 同じ Firebase プロジェクト ID を指している**他の**環境
export function sharingEnvironments(projects, env) {
  const entries = environmentEntries(projects)
  const projectId = entries.find(([alias]) => alias === env)?.[1]

  if (!projectId) return []

  return entries
    .filter(([alias, id]) => alias !== env && id === projectId)
    .map(([alias]) => alias)
}

// 相乗り構成で、この環境がプロジェクト単位のターゲットを既定で配る側かどうか。
//
// 共有している環境のうち、ENVIRONMENT_ORDER で最も本番側の 1 つだけが true になる。
// 順序の分からない環境名しか無い場合は誰も配らない（安全側に倒す）
export function ownsProjectScopedTargets(projects, env) {
  const shared = sharingEnvironments(projects, env)

  if (shared.length === 0) return true

  const group = [env, ...shared]
  const rank = (alias) => ENVIRONMENT_ORDER.indexOf(alias)
  const topRank = Math.max(...group.map(rank))

  if (topRank < 0) return false

  return (
    group.filter((alias) => rank(alias) === topRank).length === 1 &&
    rank(env) === topRank
  )
}

// $1: 候補ターゲット（配列）、$2: .firebaserc の projects、$3: 環境名
export function selectDefaultTargets(candidates, projects, env) {
  const sharedWith = sharingEnvironments(projects, env)

  if (sharedWith.length === 0 || ownsProjectScopedTargets(projects, env)) {
    return { targets: candidates, dropped: [], sharedWith }
  }

  const dropped = candidates.filter(isProjectScoped)
  const targets = candidates.filter((target) => !isProjectScoped(target))

  return { targets, dropped, sharedWith }
}

function sharedProjectLine(projects, env, sharedWith) {
  return (
    `${env} は ${sharedWith.join(' / ')} と同じ Firebase プロジェクト` +
    `（${projects[env]}）を指しています。`
  )
}

export function defaultTargetWarnings(projects, env, dropped, sharedWith) {
  if (dropped.length === 0) return []

  return [
    sharedProjectLine(projects, env, sharedWith),
    `  環境で分けられない ${dropped.join(' / ')} は既定のデプロイ対象から外しました。`,
    `  この環境から配るなら明示してください: bash scripts/deploy.sh ${env} --only ${dropped.join(',')}`,
  ]
}

// 明示指定（--only）は止めない。ただし相乗り構成では、それが他の環境にも
// 同じものを配る操作であることを知らせる
export function explicitTargetWarnings(projects, env, targets) {
  const sharedWith = sharingEnvironments(projects, env)
  const scoped = targets.filter(isProjectScoped)

  if (sharedWith.length === 0 || scoped.length === 0) return []

  return [
    sharedProjectLine(projects, env, sharedWith),
    `  --only に含まれる ${scoped.join(' / ')} は ${sharedWith.join(' / ')} にも同じものが配られます。`,
  ]
}

export function readProjects(manifestPath) {
  return JSON.parse(readFileSync(manifestPath, 'utf8')).projects || {}
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))

if (invokedDirectly) {
  const args = process.argv.slice(2)
  const explicit = args.includes('--explicit')
  const [env = '', rawTargets = '', manifest = '.firebaserc'] = args.filter(
    (arg) => arg !== '--explicit'
  )
  const targets = parseTargets(rawTargets)

  let projects

  try {
    projects = readProjects(manifest)
  } catch (error) {
    // .firebaserc が読めないこと自体は firebase CLI が落とす。
    // ここで止めると「デプロイ対象の絞り込み」と無関係な理由でデプロイが死ぬので、
    // 絞り込まずに素通しする（判断材料が無い、と明示したうえで）
    console.error(
      `[warn] ${manifest} を読めなかったため、デプロイ対象を絞り込めませんでした: ` +
        `${error instanceof Error ? error.message : String(error)}`
    )
    process.stdout.write(targets.join(','))
    process.exit(0)
  }

  if (explicit) {
    for (const line of explicitTargetWarnings(projects, env, targets)) {
      console.error(`[warn] ${line}`)
    }
    process.stdout.write(targets.join(','))
    process.exit(0)
  }

  const selected = selectDefaultTargets(targets, projects, env)

  for (const line of defaultTargetWarnings(
    projects,
    env,
    selected.dropped,
    selected.sharedWith
  )) {
    console.error(`[warn] ${line}`)
  }

  process.stdout.write(selected.targets.join(','))
}
