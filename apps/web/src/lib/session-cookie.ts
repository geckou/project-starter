// セッション cookie の名前を 1 箇所に集める。
// middleware（Edge runtime）からも import するため、ここには Node の API を持ち込まない。

/**
 * セッション cookie の名前。
 *
 * `__session` は固定。Firebase Hosting は Cloud Functions / Cloud Run へ転送する
 * リクエストから `__session` 以外の cookie を落とすため、別名にすると
 * framework-backed Hosting の SSR ではログイン状態がサーバーに届かず、
 * middleware が毎回 /login へ戻す（ローカルの `next dev` では CDN を通らないので再現しない）。
 */
export const SESSION_COOKIE_NAME = '__session'
