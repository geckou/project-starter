import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

// initializeApp は認証情報を探しに行くため、テストでは呼ばない
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }))

// 関数の環境宣言（function-environments.json）と index.ts の export が一致しているか。
//
// deploy.sh / deploy.yml は宣言ファイルだけを読んで `--only functions:<名前>` を組み立てる。
// index.ts にだけ足した関数はどの環境のデプロイにも載らず、宣言にだけある名前は
// firebase deploy が「一致する関数が無い」で落ちる。どちらも配ってみるまで分からないので、ここで止める
const GROUPED_ENVIRONMENTS = ['develop', 'staging']

type Manifest = { perEnvironment: string[]; shared: string[] }

const manifest = JSON.parse(
  readFileSync(join(__dirname, '..', 'function-environments.json'), 'utf8')
) as Manifest

// Cloud Functions の関数オブジェクトは __endpoint を持つ（firebase-functions がデプロイ時に読む）
function isCloudFunction(value: unknown): boolean {
  return (
    (typeof value === 'function' || typeof value === 'object') &&
    value !== null &&
    '__endpoint' in value
  )
}

describe('function-environments.json', () => {
  it('perEnvironment と shared は関数名の配列', () => {
    expect(Array.isArray(manifest.perEnvironment)).toBe(true)
    expect(Array.isArray(manifest.shared)).toBe(true)
  })

  it('同じ名前を両方に書かない・重複させない', () => {
    const names = [...manifest.perEnvironment, ...manifest.shared]

    expect(new Set(names).size).toBe(names.length)
  })

  it('環境名を関数名に使わない（functions:<環境名> の指定が衝突する）', () => {
    const names = [...manifest.perEnvironment, ...manifest.shared]

    for (const env of [...GROUPED_ENVIRONMENTS, 'production']) {
      expect(names).not.toContain(env)
    }
  })
})

describe('index.ts の export', async () => {
  const exported = (await import('../src/index')) as Record<string, unknown>

  it('全ての export がどちらかに分類されている', () => {
    const declared = new Set([
      ...manifest.perEnvironment,
      ...manifest.shared,
      ...GROUPED_ENVIRONMENTS,
    ])
    const undeclared = Object.keys(exported).filter(
      (name) => !declared.has(name)
    )

    expect(undeclared).toEqual([])
  })

  it('宣言した関数が production の名前のまま export されている', () => {
    for (const name of [...manifest.perEnvironment, ...manifest.shared]) {
      expect(isCloudFunction(exported[name]), name).toBe(true)
    }
  })

  it.each(GROUPED_ENVIRONMENTS)(
    '%s のグループは環境別の関数をちょうど持つ',
    (env) => {
      const group = exported[env] as Record<string, unknown> | undefined

      expect(group).toBeTypeOf('object')
      expect(Object.keys(group ?? {}).sort()).toEqual(
        [...manifest.perEnvironment].sort()
      )

      // 中身は production と同じ関数（コードは 1 つ、env だけがデプロイごとに変わる）
      for (const name of manifest.perEnvironment) {
        expect(group?.[name]).toBe(exported[name])
      }
    }
  )
})
