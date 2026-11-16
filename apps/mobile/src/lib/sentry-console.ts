// console.error を Sentry へ転送する。
//
// Sentry に自動で届くのは未処理の例外だけで、catch して console.error で握ったエラーは
// 届かない。画面や hook をその書き方で増やすと、運用中のエラーがほぼ見えなくなる。
//
// @sentry/core の captureConsoleIntegration と同じ判定（引数に Error があれば
// captureException、無ければ captureMessage）を自前で持つ。captureConsoleIntegration は
// @sentry/react-native から再エクスポートされておらず、推移的依存の @sentry/core を
// 直接 import すると、版がずれたときに黙って効かなくなるため。
//
// react-native にも Sentry にも依存させない（vitest で検証できるようにするため）。

export type ConsoleErrorSink = {
  captureException: (
    error: unknown,
    context?: { extra?: Record<string, unknown> }
  ) => unknown
  captureMessage: (message: string, level?: 'error') => unknown
}

type ConsoleLike = {
  error: (...args: unknown[]) => void
}

/**
 * console.error の引数を 1 つの文字列にする。
 *
 * `String()` ではなく JSON にする。`String()` はプロトタイプの無いオブジェクト
 * （`Object.create(null)`）で throw する。呼び出し元は catch 節の中にいることが多く、
 * そこで throw すると握ったはずの例外の代わりに別の例外が抜けていく。
 */
export function formatConsoleArguments(args: unknown[]): string {
  return args.map(formatConsoleArgument).join(' ')
}

function formatConsoleArgument(arg: unknown): string {
  if (typeof arg === 'string') return arg

  if (arg instanceof Error) return `${arg.name}: ${arg.message}`

  try {
    // 関数・symbol・undefined は JSON.stringify が undefined を返す
    return JSON.stringify(arg) ?? typeof arg
  } catch {
    // 循環参照・BigInt・throw する toJSON
    return '[文字列化できない値]'
  }
}

/**
 * `target.error` を包み、呼ばれるたびに `sink` へ転送する。戻り値は元に戻す関数。
 *
 * 元の console.error は必ず先に呼ぶ。転送の失敗は握りつぶす（ログ出力のせいで
 * 呼び出し元を落とさない）。
 */
export function forwardConsoleError(
  target: ConsoleLike,
  sink: ConsoleErrorSink
): () => void {
  const original = target.error
  // Sentry 自身が転送中に console.error を呼ぶと無限に再入するため、転送中は素通しにする
  let isForwarding = false

  const wrapped = (...args: unknown[]) => {
    original.apply(target, args)

    if (isForwarding) return

    isForwarding = true

    try {
      const message = formatConsoleArguments(args)
      const error = args.find((arg) => arg instanceof Error)

      if (error) {
        // Error 以外の引数（「〜に失敗しました」等の前置き）も一緒に残す
        sink.captureException(error, { extra: { arguments: message } })
      } else {
        sink.captureMessage(message, 'error')
      }
    } catch {
      // 転送に失敗しても、呼び出し元の処理は続ける
    } finally {
      isForwarding = false
    }
  }

  target.error = wrapped

  return () => {
    // 後から別の誰かが包み直していたら触らない
    if (target.error === wrapped) target.error = original
  }
}
