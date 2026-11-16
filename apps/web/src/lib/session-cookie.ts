// セッション cookie の名前と、検証エラーの分類を 1 箇所に集める。
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

/**
 * 「トークン / cookie そのものが無効」を表す firebase-admin のエラーコード。
 *
 * auth/argument-error は形式不正・署名不正・別プロジェクトの cookie（aud 不一致）。
 * ここに無いもの（auth/internal-error、app/invalid-credential、コードの無いエラー等）は
 * サーバー側の設定か通信の問題として扱う。
 */
const INVALID_SESSION_ERROR_CODES = new Set([
  'auth/argument-error',
  'auth/id-token-expired',
  'auth/id-token-revoked',
  'auth/session-cookie-expired',
  'auth/session-cookie-revoked',
  'auth/user-disabled',
  'auth/user-not-found',
])

/**
 * verifySessionCookie / verifyIdToken の失敗が「無効なセッション」かを判定する。
 *
 * 失敗を全部「未ログイン」として扱ってはいけない。firebase-admin は認証情報や
 * プロジェクト ID が無くても initializeApp() では throw せず、検証の時点で
 * `Unable to detect a Project Id`（コード無し）や app/invalid-credential で reject する。
 * これを握って /login へ戻すと、設定漏れがログインループとして現れ、原因が追えない（#302）。
 */
export function isInvalidSessionError(error: unknown): boolean {
  if (error === null || typeof error !== 'object' || !('code' in error)) {
    return false
  }

  const { code } = error as { code: unknown }

  return typeof code === 'string' && INVALID_SESSION_ERROR_CODES.has(code)
}

/**
 * 保護ページの `.catch()` に渡す。無効なセッションなら null（呼び出し側が /login へ戻す）、
 * それ以外は原因を付けて throw する（error.tsx とサーバーログに出る）。
 */
export function nullIfInvalidSession(error: unknown): null {
  if (isInvalidSessionError(error)) return null

  throw new Error(
    'セッションを検証できませんでした。firebase-admin の認証情報かプロジェクト ID が設定されていない可能性があります（FIREBASE_SERVICE_ACCOUNT_KEY / GOOGLE_APPLICATION_CREDENTIALS / GOOGLE_CLOUD_PROJECT を確認してください）',
    { cause: error }
  )
}
