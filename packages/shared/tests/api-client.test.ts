import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createApiClient } from '../src/api-client'

const fetchMock = vi.fn()

/** fetch の戻り値。実装は json() ではなく text() を呼ぶ */
function respond(status: number, text: string) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
  }
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

function client(getIdToken?: () => Promise<string | null>) {
  return createApiClient({ baseUrl: 'https://api.example.com', getIdToken })
}

function headersOf(call: number) {
  return fetchMock.mock.calls[call][1].headers as Record<string, string>
}

describe('createApiClient: 応答の解釈', () => {
  it('正常系は JSON を data に入れて success: true を返す', async () => {
    fetchMock.mockResolvedValue(respond(200, JSON.stringify({ value: 1 })))

    expect(await client()('/me')).toEqual({
      success: true,
      data: { value: 1 },
    })
  })

  it('空ボディの正常系は data 無しで success: true を返す', async () => {
    fetchMock.mockResolvedValue(respond(204, ''))

    expect(await client()('/me')).toEqual({ success: true, data: undefined })
  })

  it('エラー応答の error フィールドをそのまま返す', async () => {
    fetchMock.mockResolvedValue(
      respond(400, JSON.stringify({ error: 'invalid body' }))
    )

    expect(await client()('/me')).toEqual({
      success: false,
      error: 'invalid body',
    })
  })

  // 回帰: Express の未定義ルートは HTML を返す。response.json() を先に呼ぶと
  // そこで throw し、HTTP ステータスの情報が消える
  it('JSON でないエラー応答は HTTP ステータスを返す', async () => {
    fetchMock.mockResolvedValue(
      respond(404, '<!DOCTYPE html><html><body>Cannot GET /me</body></html>')
    )

    expect(await client()('/me')).toEqual({
      success: false,
      error: 'HTTP 404',
    })
  })

  it('通信そのものが失敗したら例外のメッセージを返す', async () => {
    fetchMock.mockRejectedValue(new Error('Failed to fetch'))

    expect(await client()('/me')).toEqual({
      success: false,
      error: 'Failed to fetch',
    })
  })
})

describe('createApiClient: リクエストの組み立て', () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue(respond(200, '{}'))
  })

  it('baseUrl と path を連結して呼ぶ', async () => {
    await client()('/me')

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.com/me')
  })

  it('トークンが取れれば Authorization を付ける', async () => {
    await client(async () => 'id-token')('/me')

    expect(headersOf(0)['Authorization']).toBe('Bearer id-token')
  })

  it('未ログイン（null）なら Authorization を付けない', async () => {
    await client(async () => null)('/me')

    expect(headersOf(0)['Authorization']).toBeUndefined()
  })

  it('authenticated: false ならトークンを取りにいかない', async () => {
    const getIdToken = vi.fn(async () => 'id-token')

    await client(getIdToken)('/health', { authenticated: false })

    expect(getIdToken).not.toHaveBeenCalled()
    expect(headersOf(0)['Authorization']).toBeUndefined()
  })

  it('body を JSON 文字列にして送る', async () => {
    await client()('/items', { method: 'POST', body: { name: 'x' } })

    expect(fetchMock.mock.calls[0][1].method).toBe('POST')
    expect(fetchMock.mock.calls[0][1].body).toBe('{"name":"x"}')
  })

  it('body が無ければ undefined を渡す', async () => {
    await client()('/me')

    expect(fetchMock.mock.calls[0][1].body).toBeUndefined()
  })

  // 回帰: 真偽で落としていたため、false / 0 / '' が「渡されなかった」扱いになっていた
  it('falsy な body も JSON として送る', async () => {
    await client()('/flags', { method: 'POST', body: false })

    expect(fetchMock.mock.calls[0][1].body).toBe('false')
  })

  // 回帰: トークン取得を try の外に置くと、ここで例外が飛んで
  // 呼び出し側が前提にしている ApiResponse にならない
  it('トークンの取得に失敗してもエラーを ApiResponse で返す', async () => {
    const failing = async () => {
      throw new Error('token refresh failed')
    }

    expect(await client(failing)('/me')).toEqual({
      success: false,
      error: 'token refresh failed',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
