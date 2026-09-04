/**
 * ログイン後の戻り先（?redirect=）をサイト内パスだけに絞る（open redirect 防止）。
 *
 * 「/ 始まりかつ // 始まりでない」だけでは足りない。WHATWG URL パーサは
 * http(s) のような特殊スキームで `\` を `/` と同一視するため、`/\evil.com` は
 * `https://evil.com/` に解決される。Next の router.push は解決結果が外部なら
 * location.href への遷移に切り替えるので、ログイン直後に攻撃者サイトへ飛ぶ。
 */
export function sanitizeRedirect(redirect: string | null): string {
  if (!redirect) return '/'
  if (!redirect.startsWith('/')) return '/'
  // 2 文字目が / でも \ でもプロトコル相対として解決されうる
  if (redirect.startsWith('//') || redirect.startsWith('/\\')) return '/'
  if (redirect.includes('\\')) return '/'

  return redirect
}
