#!/usr/bin/env node
// フックのシェルスクリプトが bash 3.2（macOS の /bin/sh）でも構文解析できるかを検査する。
//
// bash 3.2 は `$( … )` の中を「括弧の対応」だけで読むため、`case` のパターン末尾の
// `)` をコマンド置換の終わりと誤読して構文エラーになる（bash 4 以降は正しく読む）。
// CI は Linux（/bin/sh = dash）で走るので、この壊れ方はテストにも型チェックにも
// 引っかからないまま macOS の手元だけでフック全体が動かなくなる。
//
// 検出方法: bash 3.2 と同じ「括弧を数えるだけ」の読み方でコマンド置換の範囲を切り出し、
// その中で case と esac の数が合わなければ、パターンの `)` で範囲が切れたと判断する。
// 直し方は `case $x in (pat) …` のようにパターンを `(` で開くこと（POSIX の書き方）。

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// 検査対象のディレクトリ。引数で差し替えられる（回帰テストが使う）。
// URL.pathname は空白や # をパーセントエンコードしたまま返すため、
// 既定値はパスへ戻すのに fileURLToPath を通す
const HOOK_DIR =
  process.argv[2] ??
  fileURLToPath(new URL('../.claude/hooks/', import.meta.url))

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
    })
    quote = ''
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
      if (c === '$' && src[i + 1] === '(' && src[i + 2] !== '(') {
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

    // コメントは行末まで読み飛ばす（本文の括弧を数えないため）
    if (c === '#' && (i === 0 || /[\s;&|(]/.test(src[i - 1]))) {
      while (i < src.length && src[i] !== '\n') i++
      continue
    }

    if (c === '$' && src[i + 1] === '(' && src[i + 2] !== '(') {
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
        i += 3
        continue
      }
      if (/^esac([ \t;&|)]|$)/.test(rest)) {
        top.closes++
        i += 3
        continue
      }
    }

    if (c === '(') top.depth++
    else if (c === ')') {
      if (top.depth === 0) {
        regions.push({
          start: top.start,
          end: i,
          opens: top.opens,
          closes: top.closes,
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

for (const name of readdirSync(HOOK_DIR).sort()) {
  if (!name.endsWith('.sh')) continue

  const path = join(HOOK_DIR, name)
  const src = readFileSync(path, 'utf8')

  for (const region of commandSubstitutions(src)) {
    if (region.opens > region.closes) {
      failures.push(
        `${name}:${lineOf(src, region.start)} コマンド置換の中の case が閉じていません` +
          '（bash 3.2 がパターンの ) を置換の終わりと読んでいます）。' +
          'パターンを `(pat)` の形で書いてください'
      )
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
  'shell compat: ok（コマンド置換の中の case は全て `(` で開かれています）'
)
