import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Authorization ヘッダーの Base64 部分の最大長（過大な値による例外を防ぐ）
const MAX_BASIC_AUTH_HEADER_LENGTH = 1024

// 共有 CDN に認証済み応答をキャッシュさせないためのヘッダー値
// （Firebase Hosting の framework-backed CDN による Basic 認証貫通を防ぐ）
const NO_STORE_CACHE_CONTROL = 'private, no-store'

// Basic 認証の評価結果
// - allow:        認証成功、または認証情報が一致
// - unauthorized: 認証失敗（401 を返す）
// - disabled:     BASIC_AUTH_CREDENTIALS 未設定（認証無効）
type BasicAuthResult = 'allow' | 'unauthorized' | 'disabled'

// Basic 認証を評価する純粋関数
// credentials が未設定（undefined / 空文字）なら認証無効。
// production では BASIC_AUTH_CREDENTIALS を設定しないことで無効化する
function evaluateBasicAuth(
  request: NextRequest,
  credentials: string | undefined
): BasicAuthResult {
  if (!credentials) return 'disabled'

  const authHeader = request.headers.get('authorization')

  if (authHeader) {
    const basicAuthMatch = authHeader.trim().match(/^Basic\s+(\S+)$/i)
    const encoded = basicAuthMatch?.[1]

    if (encoded && encoded.length <= MAX_BASIC_AUTH_HEADER_LENGTH) {
      try {
        const decoded = atob(encoded)
        const [user, ...passwordParts] = decoded.split(':')
        const password = passwordParts.join(':')

        if (`${user}:${password}` === credentials) return 'allow'
      } catch {
        // 不正な Base64 は未認証扱い
      }
    }
  }

  return 'unauthorized'
}

// 認証が必要なパス
const PROTECTED_PATHS = ['/dashboard']

export function middleware(request: NextRequest) {
  // Basic 認証（BASIC_AUTH_CREDENTIALS が設定されている環境のみ）
  const basicAuth = evaluateBasicAuth(
    request,
    process.env.BASIC_AUTH_CREDENTIALS
  )

  if (basicAuth === 'unauthorized') {
    return new NextResponse('Unauthorized', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Restricted"',
        // 401 を共有 CDN にキャッシュさせない
        'Cache-Control': NO_STORE_CACHE_CONTROL,
      },
    })
  }

  // Basic 認証が有効な環境では、認証済み応答を共有 CDN にキャッシュさせない
  // （キャッシュ済み 200 が未認証アクセスへ配信され Basic 認証が貫通するのを防ぐ）
  const authEnabled = basicAuth !== 'disabled'

  const withNoStore = (response: NextResponse) => {
    if (authEnabled) {
      response.headers.set('Cache-Control', NO_STORE_CACHE_CONTROL)
    }

    return response
  }

  // ルート保護
  const { pathname } = request.nextUrl
  const isProtected = PROTECTED_PATHS.some((path) => pathname.startsWith(path))

  if (!isProtected) return withNoStore(NextResponse.next())

  // Cookie の存在チェックのみ（Edge runtime では firebase-admin が使えないため）。
  // セッション Cookie の実検証（verifySessionCookie）は各保護ページのサーバーコンポーネントで行う
  const session = request.cookies.get('session')

  if (!session) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return withNoStore(NextResponse.redirect(loginUrl))
  }

  return withNoStore(NextResponse.next())
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|_next/data|_next/webpack-hmr|api/|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)',
  ],
}
