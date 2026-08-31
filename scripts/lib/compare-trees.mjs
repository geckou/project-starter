#!/usr/bin/env node
// 2つのディレクトリの中身を比較する（層の減算 → 加算が元に戻るかの検証用）。
//
//   node scripts/lib/compare-trees.mjs <ディレクトリA> <ディレクトリB>
//
// 一致していれば "IDENTICAL" を出力して 0、違えば差分を並べて 1 で終了する。
//
// JSON だけは構造で比べる。減算・加算は JSON を JSON.stringify で書き戻すため、
// Prettier が短い配列を1行にまとめる整形との差が出るが、内容は変わらないため
// （どちらの操作も最後に yarn format を促している）。
//
// node_modules に依存しない。

import fs from 'node:fs'
import path from 'node:path'

const SKIP = new Set([
  '.git',
  'node_modules',
  'dist',
  '.next',
  '.turbo',
  'coverage',
])

function listFiles(root, base = '') {
  const files = []

  for (const entry of fs.readdirSync(path.join(root, base), {
    withFileTypes: true,
  })) {
    if (SKIP.has(entry.name)) continue

    const next = base === '' ? entry.name : `${base}/${entry.name}`

    if (entry.isDirectory()) {
      files.push(...listFiles(root, next))
    } else if (entry.isFile()) {
      files.push(next)
    }
  }

  return files
}

const [left, right] = process.argv.slice(2)

if (!left || !right) {
  console.error(
    '使い方: node scripts/lib/compare-trees.mjs <ディレクトリA> <ディレクトリB>'
  )
  process.exit(2)
}

const leftFiles = new Set(listFiles(left))
const rightFiles = new Set(listFiles(right))
const differences = []

for (const file of leftFiles) {
  if (!rightFiles.has(file)) differences.push(`欠落: ${file}`)
}

for (const file of rightFiles) {
  if (!leftFiles.has(file)) differences.push(`余分: ${file}`)
}

for (const file of leftFiles) {
  if (!rightFiles.has(file)) continue

  const a = fs.readFileSync(path.join(left, file))
  const b = fs.readFileSync(path.join(right, file))

  if (a.equals(b)) continue

  if (file.endsWith('.json')) {
    try {
      const parsedA = JSON.stringify(JSON.parse(a.toString('utf8')))
      const parsedB = JSON.stringify(JSON.parse(b.toString('utf8')))

      if (parsedA === parsedB) continue
    } catch {
      // JSON として読めないなら内容の違いとして報告する
    }
  }

  differences.push(`内容が違う: ${file}`)
}

if (differences.length > 0) {
  for (const difference of differences) console.error(difference)
  process.exit(1)
}

console.log('IDENTICAL')
