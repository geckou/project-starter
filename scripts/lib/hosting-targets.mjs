// firebase.json の hosting 宣言から、「この環境で配るターゲット」を選ぶ。
//
//   node scripts/lib/hosting-targets.mjs <環境名> [firebase.json のパス]
//
// 標準出力に空白区切りでターゲット名を出す。**何も出さない**のは
// 「ターゲット指定の無い単一 hosting」で、呼び出し側は
// firebase deploy --only hosting（ターゲット名なし）を実行する。
//
// 分けて持っているのは、選び方だけを回帰テストできるようにするため
// （scripts/test-deploy-targets.sh）。deploy.sh 本体は firebase CLI と
// 実プロジェクトが無いと流せない。

import { readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// hosting の宣言（単一 or 配列）から、宣言されているターゲット名を並べる。
// firebase.json は target（.firebaserc の hosting ターゲット）か site（サイト ID）の
// どちらかで場所を指す。どちらも無い宣言は「ターゲット指定なし」として空で表す
export function declaredTargets(hosting) {
  if (!hosting) return []

  const entries = Array.isArray(hosting) ? hosting : [hosting]

  return entries
    .map((entry) => entry?.target || entry?.site || '')
    .filter(Boolean)
}

// 配るターゲットを決める。
//
// 既定は「ターゲット名 = 環境名」。1 つの Firebase プロジェクトに develop /
// staging / production の 3 サイトを相乗りさせる構成（→ .claude/docs/git-workflow.md）
// では firebase.json に 3 ターゲットが並ぶため、全部に配ると staging のビルドが
// production のサイトにも出る（#323）。
//
// 環境名と無関係なターゲット名を使う構成（web / admin のような分け方）では
// 絞り込めないので、従来どおり全ターゲットに配る。明示したいときは
// DEPLOY_HOSTING_TARGETS で指定する。
export function selectHostingTargets(hosting, env, explicit) {
  const declared = declaredTargets(hosting)

  // 明示指定を先に見る。ターゲット未宣言の firebase.json でも、指定が黙って
  // 捨てられるのではなく「宣言に無い」と分かるようにする
  if (explicit) {
    const requested = explicit
      .split(/[\s,]+/)
      .map((name) => name.trim())
      .filter(Boolean)

    if (requested.length === 0) {
      throw new Error(
        'DEPLOY_HOSTING_TARGETS が空です（指定するか、変数ごと外してください）'
      )
    }

    const unknown = requested.filter((name) => !declared.includes(name))

    if (unknown.length > 0) {
      throw new Error(
        `DEPLOY_HOSTING_TARGETS に firebase.json の hosting に無いターゲットがあります: ${unknown.join(', ')}\n` +
          `  firebase.json のターゲット: ${declared.join(', ')}`
      )
    }

    return { targets: requested, warnings: [] }
  }

  if (declared.length === 0) return { targets: [], warnings: [] }

  if (declared.includes(env)) return { targets: [env], warnings: [] }

  const warnings =
    declared.length > 1
      ? [
          `hosting のターゲットに "${env}" が無いため、${declared.length} ターゲット全部に配ります: ${declared.join(', ')}`,
          '  環境ごとにサイトを分けている構成では、ターゲット名を環境名（develop / staging / production）に',
          '  合わせるか、DEPLOY_HOSTING_TARGETS で配る先を明示してください。',
        ]
      : []

  return { targets: declared, warnings }
}

// 直接実行されたときだけ CLI として振る舞う（import しても走らせない）
const invokedDirectly =
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))

if (invokedDirectly) {
  const env = process.argv[2] || ''
  const manifest = process.argv[3] || 'firebase.json'

  try {
    const { hosting } = JSON.parse(readFileSync(manifest, 'utf8'))
    const { targets, warnings } = selectHostingTargets(
      hosting,
      env,
      process.env.DEPLOY_HOSTING_TARGETS
    )

    for (const warning of warnings) console.error(`[warn] ${warning}`)

    process.stdout.write(targets.join(' '))
  } catch (error) {
    console.error(`[error] ${error.message}`)
    process.exit(1)
  }
}
