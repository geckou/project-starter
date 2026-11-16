#!/usr/bin/env node
// シェルスクリプト（.claude/hooks/ と scripts/）が bash 3.2（macOS の /bin/sh）でも
// 構文解析できるかを検査する。
//
// bash 3.2 は `$( … )` の中を「括弧の対応」だけで読むため、`case` のパターン末尾の
// `)` をコマンド置換の終わりと誤読して構文エラーになる（bash 4 以降は正しく読む）。
// CI は Linux（/bin/sh = dash）で走るので、この壊れ方はテストにも型チェックにも
// 引っかからないまま macOS の手元だけでフック全体が動かなくなる。
//
// 検出方法: bash 3.2 と同じ「括弧を数えるだけ」の読み方でコマンド置換の範囲を切り出し、
// その中の case について次のどちらかに当たれば、パターンの `)` で範囲が切れると判断する。
//   - case と esac の数が合わない
//   - case の中に、対応する `(` を持たない `)` がある（`(` で開いていないパターン）。
//     数だけを見ていると、`$( (case … esac) )` のようにサブシェルの括弧が帳尻を
//     合わせる形を取りこぼす（#362）
// 直し方は `case $x in (pat) …` のようにパターンを `(` で開くこと（POSIX の書き方）。

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// 検査対象のディレクトリ。引数で差し替えられる（複数可。回帰テストが使う）。
// 既定はフックと scripts/ — どちらも macOS の bash 3.2 で実行される。
// URL.pathname は空白や # をパーセントエンコードしたまま返すため、
// 既定値はパスへ戻すのに fileURLToPath を通す
const DEFAULT_DIRS = ['../.claude/hooks/', './'].map((dir) =>
  fileURLToPath(new URL(dir, import.meta.url))
)
const explicitDirs = process.argv.slice(2)
const TARGET_DIRS = explicitDirs.length > 0 ? explicitDirs : DEFAULT_DIRS

// bash 3.2 と同じ素朴な読み方でコマンド置換の中身を切り出す
function commandSubstitutions(src) {
  const regions = []
  const stack = []
  let quote = ''

  // 置換の開始。二重引用符の中でも $( … ) はシェルが評価するため、
  // 引用の状態を退避して置換の中を「引用の外」として読み直す
  const openSubstitution = (i) => {
    stack.push({
      start: i + 2,
      depth: 0,
      savedQuote: quote,
      opens: 0,
      closes: 0,
      // 開いている case ごとの「case が始まったときの括弧の深さ」
      caseDepths: [],
      // `(` で開いていないパターンの `)` を見つけた位置（無ければ -1）
      barePattern: -1,
    })
    quote = ''
  }

  // i が `$(` の位置にあるとき、それがコマンド置換の開始か。
  // `$((` は算術展開（`$(( x + 1 ))`）とサブシェルで始まる置換（`$((case … esac) )`）の
  // 両方がありうる。対応する閉じが `))` なら算術展開、そうでなければ置換として読む
  // （bash も算術として読めなければ置換として読み直す）
  const startsSubstitution = (i) => {
    if (src[i] !== '$' || src[i + 1] !== '(') return false
    if (src[i + 2] !== '(') return true

    let depth = 0
    for (let j = i + 1; j < src.length; j++) {
      if (src[j] === '(') depth++
      else if (src[j] === ')') {
        depth--
        if (depth === 0) return src[j - 1] !== ')'
      }
    }
    return false
  }

  // 区切り語を引用した heredoc（<<'EOT' / <<"EOT" / <<\EOT）の本文はシェルが
  // 解釈しない。本文に書いた `$(case … in a) …)` を失敗として数えないよう、
  // 本文を読み飛ばす（#362）。区切り語を引用しない heredoc の本文は展開されるので読む
  const pendingHeredocs = []

  const heredocAt = (i) => {
    const m = /^<<(-?)[ \t]*(?:'([^'\n]+)'|"([^"\n]+)"|\\([A-Za-z_][A-Za-z_0-9]*))/.exec(
      src.slice(i, i + 200)
    )
    if (!m) return null
    return { stripTabs: m[1] === '-', delimiter: m[2] ?? m[3] ?? m[4], length: m[0].length }
  }

  // i は heredoc の行末の改行。本文の終わり（終了行の末尾）の位置を返す。
  // 終了行が無ければ heredoc ではないので、読み飛ばさない
  const skipHeredocBodies = (i) => {
    let end = i
    for (const heredoc of pendingHeredocs.splice(0)) {
      let lineStart = end + 1
      let found = -1
      while (lineStart <= src.length) {
        let lineEnd = src.indexOf('\n', lineStart)
        if (lineEnd === -1) lineEnd = src.length
        let line = src.slice(lineStart, lineEnd)
        if (heredoc.stripTabs) line = line.replace(/^\t+/, '')
        if (line === heredoc.delimiter) {
          found = lineEnd
          break
        }
        lineStart = lineEnd + 1
      }
      if (found === -1) break
      end = found
    }
    return end
  }

  // 語の区切りで始まっているか（`lowercase` の中の `case` を拾わないため）
  const wordStart = (i) => i === 0 || !/[A-Za-z0-9_]/.test(src[i - 1])

  // コマンドの位置にあるか。`printf '%s' case` の引数の case を数えないための判定。
  // 直前の非空白が「コマンドの終わり」を表す記号か、複合コマンドの予約語なら
  // そこは新しいコマンドの位置
  const atCommandPosition = (i) => {
    let j = i - 1
    while (j >= 0 && (src[j] === ' ' || src[j] === '\t')) j--
    if (j < 0) return true
    if ('\n;&|(){'.includes(src[j])) return true
    const before = src.slice(0, j + 1)
    return /(^|[\s;&|(){])(then|do|else|elif|!)$/.test(before)
  }

  for (let i = 0; i < src.length; i++) {
    const c = src[i]

    // 単一引用符の中は展開されないので、置換の開始としては読まない
    if (quote === "'") {
      if (c === "'") quote = ''
      continue
    }

    if (quote === '"') {
      if (c === '\\') {
        i++
        continue
      }
      if (c === '"') {
        quote = ''
        continue
      }
      if (startsSubstitution(i)) {
        openSubstitution(i)
        i++
      }
      continue
    }

    if (c === '\\') {
      i++
      continue
    }

    if (c === "'" || c === '"') {
      quote = c
      continue
    }

    // コメントは行末まで読み飛ばす（本文の括弧を数えないため）。
    // 改行そのものは残す（下の heredoc の読み飛ばしが行末で動くため）
    if (c === '#' && (i === 0 || /[\s;&|(]/.test(src[i - 1]))) {
      while (i < src.length && src[i] !== '\n') i++
      i--
      continue
    }

    // 引用した区切り語の heredoc。本文は行末の次から始まるので、行の残りは読む
    if (c === '<' && src[i + 1] === '<' && src[i + 2] !== '<') {
      const heredoc = heredocAt(i)
      if (heredoc) {
        pendingHeredocs.push(heredoc)
        i += heredoc.length - 1
        continue
      }
    }

    if (c === '\n' && pendingHeredocs.length > 0) {
      i = skipHeredocBodies(i)
      continue
    }

    if (startsSubstitution(i)) {
      openSubstitution(i)
      i++
      continue
    }

    if (stack.length === 0) continue

    const top = stack[stack.length - 1]

    // case / esac は「コマンドの位置にある予約語」だけを数える。
    // case はさらに `case <語> in` の形であることまで見る。ヘッダーは
    // `case "$y"` の次の行に `in` を書く形も POSIX で有効なので、改行を跨いで探す
    if ((c === 'c' || c === 'e') && wordStart(i) && atCommandPosition(i)) {
      const rest = src.slice(
        i,
        src.indexOf('\n', i) === -1 ? undefined : src.indexOf('\n', i)
      )
      // 語と `in` の間に別のコマンドの区切りが挟まる形は case のヘッダーではない
      if (/^case[\s]+[^;()]*?\sin([\s;]|$)/.test(src.slice(i, i + 500))) {
        top.opens++
        top.caseDepths.push(top.depth)
        i += 3
        continue
      }
      if (/^esac([ \t;&|)]|$)/.test(rest)) {
        top.closes++
        top.caseDepths.pop()
        i += 3
        continue
      }
    }

    if (c === '(') top.depth++
    else if (c === ')') {
      // case の中で、case が始まってから開いた `(` が残っていないのに `)` が来た。
      // `(` で開いていないパターンの終わりで、bash 3.2 はここを括弧の閉じとして数える
      if (
        top.barePattern === -1 &&
        top.caseDepths.length > 0 &&
        top.depth === top.caseDepths[top.caseDepths.length - 1]
      ) {
        top.barePattern = i
      }

      if (top.depth === 0) {
        regions.push({
          start: top.start,
          end: i,
          opens: top.opens,
          closes: top.closes,
          barePattern: top.barePattern,
        })
        quote = top.savedQuote
        stack.pop()
      } else {
        top.depth--
      }
    }
  }

  return regions
}

function lineOf(src, index) {
  return src.slice(0, index).split('\n').length
}

const failures = []
let checked = 0

for (const dir of TARGET_DIRS) {
  // 層を外した最小構成では .claude/hooks/ が無いことがある。既定の対象が無いのは
  // 「検査するものが無い」だけなので飛ばす。引数で渡されたものが無いのは指定の誤り
  if (!existsSync(dir)) {
    if (explicitDirs.length > 0) {
      console.error(`検査対象のディレクトリがありません: ${dir}`)
      process.exit(1)
    }
    console.log(`shell compat: ${dir} が無いためスキップします`)
    continue
  }

  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith('.sh')) continue

    const path = join(dir, name)
    // 作業ディレクトリの外（回帰テストの一時ディレクトリ等）は絶対パスのまま出す
    const rel = relative(process.cwd(), path)
    const label = rel === '' || rel.startsWith('..') ? path : rel
    const src = readFileSync(path, 'utf8')
    checked++

    for (const region of commandSubstitutions(src)) {
      if (region.opens > region.closes || region.barePattern !== -1) {
        const at = region.barePattern !== -1 ? region.barePattern : region.start
        failures.push(
          `${label}:${lineOf(src, at)} コマンド置換の中の case に \`(\` で開いていないパターンがあります` +
            '（bash 3.2 がパターンの ) を置換の終わりと読みます）。' +
            'パターンを `(pat)` の形で書いてください'
        )
      }
    }
  }
}

if (failures.length > 0) {
  console.error('bash 3.2 で構文解析できない箇所があります:\n')
  for (const f of failures) console.error(`  - ${f}`)
  console.error(
    '\n直し方: case のパターンを `(` で開く（例: `case $x in (a|b) … ;; esac`）'
  )
  process.exit(1)
}

console.log(
  `shell compat: ok（${checked} ファイル。コマンド置換の中の case は全て \`(\` で開かれています）`
)
