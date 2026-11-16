import { describe, expect, it, vi } from 'vitest'

import {
  forwardConsoleError,
  formatConsoleArguments,
} from '../src/lib/sentry-console'

function createSink() {
  return {
    captureException: vi.fn(),
    captureMessage: vi.fn(),
  }
}

function createConsole() {
  const original = vi.fn()

  return {
    target: { error: original as (...args: unknown[]) => void },
    original,
  }
}

describe('formatConsoleArguments', () => {
  it('文字列はそのまま、それ以外は JSON にして空白でつなぐ', () => {
    expect(formatConsoleArguments(['取得に失敗', { id: 1 }, 42, null])).toBe(
      '取得に失敗 {"id":1} 42 null'
    )
  })

  it('Error は name と message にする', () => {
    expect(formatConsoleArguments([new TypeError('boom')])).toBe(
      'TypeError: boom'
    )
  })

  it('プロトタイプの無いオブジェクトで throw しない', () => {
    const bare = Object.assign(Object.create(null), { code: 'E1' })

    // 前提の確認: String() はこの値で throw する
    expect(() => String(bare)).toThrow()
    expect(formatConsoleArguments([bare])).toBe('{"code":"E1"}')
  })

  it('JSON にできない値でも throw しない', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular

    expect(formatConsoleArguments([circular, 10n])).toBe(
      '[文字列化できない値] [文字列化できない値]'
    )
    expect(formatConsoleArguments([undefined, () => {}])).toBe(
      'undefined function'
    )
  })
})

describe('forwardConsoleError', () => {
  it('引数に Error があれば captureException で送る', () => {
    const sink = createSink()
    const { target, original } = createConsole()
    const error = new Error('boom')

    forwardConsoleError(target, sink)
    target.error('保存に失敗', error)

    expect(sink.captureException).toHaveBeenCalledWith(error, {
      extra: { arguments: '保存に失敗 Error: boom' },
    })
    expect(sink.captureMessage).not.toHaveBeenCalled()
    expect(original).toHaveBeenCalledWith('保存に失敗', error)
  })

  it('Error が無ければ captureMessage で error レベルとして送る', () => {
    const sink = createSink()
    const { target, original } = createConsole()

    forwardConsoleError(target, sink)
    target.error('EAS projectId が設定されていません', { step: 2 })

    expect(sink.captureMessage).toHaveBeenCalledWith(
      'EAS projectId が設定されていません {"step":2}',
      'error'
    )
    expect(sink.captureException).not.toHaveBeenCalled()
    expect(original).toHaveBeenCalledTimes(1)
  })

  it('転送が throw しても呼び出し元へ例外を出さない', () => {
    const sink = createSink()
    const { target, original } = createConsole()

    sink.captureMessage.mockImplementation(() => {
      throw new Error('transport down')
    })
    forwardConsoleError(target, sink)

    expect(() => target.error('x')).not.toThrow()
    expect(original).toHaveBeenCalledWith('x')

    // 失敗の後も転送は続く（再入ガードが立ったままにならない）
    target.error('y')
    expect(sink.captureMessage).toHaveBeenCalledTimes(2)
  })

  it('転送中に呼ばれた console.error は再転送しない', () => {
    const sink = createSink()
    const { target, original } = createConsole()

    sink.captureMessage.mockImplementation(() => {
      target.error('Sentry の内部ログ')
    })
    forwardConsoleError(target, sink)
    target.error('外側')

    expect(sink.captureMessage).toHaveBeenCalledTimes(1)
    expect(original).toHaveBeenCalledTimes(2)
  })

  it('戻り値の関数で元に戻せる', () => {
    const sink = createSink()
    const { target, original } = createConsole()

    const restore = forwardConsoleError(target, sink)
    restore()
    target.error('x')

    expect(target.error).toBe(original)
    expect(sink.captureMessage).not.toHaveBeenCalled()
  })
})
