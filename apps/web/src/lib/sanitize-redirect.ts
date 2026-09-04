/**
 * ログイン後の戻り先（?redirect=）をサイト内パスだけに絞る（open redirect 防止）。
 *
 * 拒否リストではなく許可リストで判定する。WHATWG URL パーサは
 * http(s) のような特殊スキームで `\` を `/` と同一視し、さらに解析の前に
 * ASCII の TAB / LF / CR を取り除くため、`/\evil.com` も TAB 入りの
 * `/<TAB>/evil.com` も `https://evil.com/` に解決される
 * （`?redirect=/%09/evil.com` で到達できる）。Next の router.push は解決結果が
 * 外部なら location.href への遷移に切り替えるので、素通しするとログイン直後に
 * 攻撃者サイトへ飛ぶ。
 */

/** `/` で始まり、2 文字目が `/` でも `\` でもなく、`\` を含まないパス */
const SITE_PATH = /^\/(?![/\\])[^\\]*$/

/** 制御文字を含むか（正規表現に直接書くと no-control-regex に当たる） */
function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0
    if (code <= 0x1f || code === 0x7f) return true
  }

  return false
}

export function sanitizeRedirect(redirect: string | null): string {
  if (!redirect) return '/'
  if (!SITE_PATH.test(redirect)) return '/'
  if (hasControlCharacter(redirect)) return '/'

  return redirect
}
