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

import { declaredTargets } from './hosting-targets.mjs'

// 本番側ほど後ろ。同じプロジェクトを共有する環境のうち「誰が既定で配るか」を決めるのに使う
export const ENVIRONMENT_ORDER = ['develop', 'staging', 'production']

// Firebase プロジェクト単位でしか存在せず、環境ごとに分けようがないターゲット。
//
// hosting はここに入らない。**サイトを分ければ環境ごとに持てる**ためで、
// 分けていない相乗り構成では話が別になる（→ selectDefaultTargets）
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

  // 順序の分かる環境名が 1 つも無い（全て -1）ときは、誰が本番側か決められない
  if (topRank < 0) return false

  // エイリアスも ENVIRONMENT_ORDER も重複しないため、topRank の環境はちょうど 1 つ
  return rank(env) === topRank
}

// 相乗り構成で hosting も外すかどうか。
//
// firebase.json の hosting に target / site の宣言が無い = サイトが 1 つしかない構成では、
// develop も production も**同じサイト**を指す。そこへ `deploy.sh develop` が配ると
// 本番のサイトが develop のビルドで上書きされる（#323 と同じ壊れ方）。
// サイトを分けてあれば hosting-targets.mjs が環境名で絞り込むので、ここでは外さない
export function hostingSplitByEnvironment(hosting) {
  return declaredTargets(hosting).length > 0
}

// hosting を省略した場合は「サイトは分かれている」とみなし、hosting を外さない
export function selectDefaultTargets(candidates, projects, env, hosting) {
  const sharedWith = sharingEnvironments(projects, env)

  if (sharedWith.length === 0 || ownsProjectScopedTargets(projects, env)) {
    return { targets: candidates, dropped: [], sharedWith }
  }

  // 相乗り構成で、サイトも分けていない場合は hosting も配れない
  const dropHosting =
    hosting !== undefined && !hostingSplitByEnvironment(hosting)

  const shouldDrop = (target) =>
    isProjectScoped(target) ||
    (dropHosting && target.split(':')[0] === 'hosting')

  const dropped = candidates.filter(shouldDrop)
  const targets = candidates.filter((target) => !shouldDrop(target))

  return { targets, dropped, sharedWith, droppedHosting: dropHosting }
}

function sharedProjectLine(projects, env, sharedWith) {
  return (
    `${env} は ${sharedWith.join(' / ')} と同じ Firebase プロジェクト` +
    `（${projects[env]}）を指しています。`
  )
}

export function defaultTargetWarnings(
  projects,
  env,
  dropped,
  sharedWith,
  droppedHosting
) {
  if (dropped.length === 0) return []

  const lines = [sharedProjectLine(projects, env, sharedWith)]
  const scoped = dropped.filter(isProjectScoped)

  if (scoped.length > 0) {
    lines.push(
      `  環境で分けられない ${scoped.join(' / ')} は既定のデプロイ対象から外しました。`,
      `  この環境から配るなら明示してください: bash scripts/deploy.sh ${env} --only ${scoped.join(',')}`
    )
  }

  // hosting は「明示すれば配れる」とは案内しない。サイトが 1 つしか無い構成で
  // 配ると、他の環境のサイト（= 本番）をこの環境のビルドで上書きするため
  if (droppedHosting) {
    lines.push(
      '  hosting は配れないため外しました: firebase.json の hosting に target / site の宣言が無く、',
      `  ${env} と ${sharedWith.join(' / ')} が同じサイトを指すためです。`,
      '  配るには環境ごとに Hosting サイトを分けてください',
      '  （→ .claude/docs/git-workflow.md「Hosting のターゲットは環境名に合わせる」）。'
    )
  }

  return lines
}

// 明示指定（--only）は止めない。ただし相乗り構成では、それが他の環境にも
// 同じものを配る操作であることを知らせる
export function explicitTargetWarnings(projects, env, targets, hosting) {
  const sharedWith = sharingEnvironments(projects, env)

  if (sharedWith.length === 0) return []

  const scoped = targets.filter(isProjectScoped)
  const lines = []

  if (scoped.length > 0) {
    lines.push(
      `  --only に含まれる ${scoped.join(' / ')} は ${sharedWith.join(' / ')} にも同じものが配られます。`
    )
  }

  // サイトを分けていない相乗り構成での --only hosting は、他の環境のサイト
  // （= 本番）をこの環境のビルドで上書きする
  if (
    targets.some((target) => target.split(':')[0] === 'hosting') &&
    hosting !== undefined &&
    !hostingSplitByEnvironment(hosting)
  ) {
    lines.push(
      `  --only の hosting は ${sharedWith.join(' / ')} と同じサイトへ配ります`,
      '  （firebase.json の hosting に target / site の宣言が無く、サイトが 1 つしかありません）。'
    )
  }

  if (lines.length === 0) return []

  return [sharedProjectLine(projects, env, sharedWith), ...lines]
}

export function readProjects(manifestPath) {
  return JSON.parse(readFileSync(manifestPath, 'utf8')).projects || {}
}

// firebase.json の hosting 宣言。読めなければ undefined を返す
// （「分かれているか分からない」＝ hosting を外さない側に倒す）
function readHosting(manifestPath) {
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8')).hosting ?? null
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
  const [env = '', rawTargets = '', manifest = '.firebaserc', hostingManifest] =
    args.filter((arg) => arg !== '--explicit')
  const targets = parseTargets(rawTargets)

  // firebase.json は .firebaserc の隣にある（テストが別ディレクトリへ置くため、
  // 既定は .firebaserc のパスから導く）
  const firebaseJson =
    hostingManifest ?? manifest.replace(/\.firebaserc$/, 'firebase.json')

  let projects
  let failure

  try {
    projects = readProjects(manifest)
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }

  // process.exit() は書き込みが終わる前にプロセスを落としうる（パイプへの
  // 書き込みは非同期）。stdout に出したあとは自然終了させる
  if (failure !== undefined) {
    // .firebaserc が読めないこと自体は firebase CLI が落とす。
    // ここで止めると「デプロイ対象の絞り込み」と無関係な理由でデプロイが死ぬので、
    // 絞り込まずに素通しする（判断材料が無い、と明示したうえで）
    console.error(
      `[warn] ${manifest} を読めなかったため、デプロイ対象を絞り込めませんでした: ${failure}`
    )
    process.stdout.write(targets.join(','))
  } else if (explicit) {
    for (const line of explicitTargetWarnings(
      projects,
      env,
      targets,
      readHosting(firebaseJson)
    )) {
      console.error(`[warn] ${line}`)
    }
    process.stdout.write(targets.join(','))
  } else {
    const hosting = readHosting(firebaseJson)
    const selected = selectDefaultTargets(targets, projects, env, hosting)

    for (const line of defaultTargetWarnings(
      projects,
      env,
      selected.dropped,
      selected.sharedWith,
      selected.droppedHosting
    )) {
      console.error(`[warn] ${line}`)
    }

    process.stdout.write(selected.targets.join(','))
  }
}
