import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Authorization ヘッダーの Base64 部分の最大長（過大な値による例外を防ぐ）
const MAX_BASIC_AUTH_HEADER_LENGTH = 1024

// Basic 認証チェック（BASIC_AUTH_CREDENTIALS が設定されている場合のみ有効）
// production では環境変数を設定しないことで無効化する
function checkBasicAuth(request: NextRequest): NextResponse | null {
  const credentials = process.env.BASIC_AUTH_CREDENTIALS

  if (!credentials) return null

  const authHeader = request.headers.get('authorization')

  if (authHeader) {
    const basicAuthMatch = authHeader.trim().match(/^Basic\s+(\S+)$/i)
    const encoded = basicAuthMatch?.[1]

    if (encoded && encoded.length <= MAX_BASIC_AUTH_HEADER_LENGTH) {
      try {
        const decoded = atob(encoded)
        const [user, ...passwordParts] = decoded.split(':')
        const password = passwordParts.join(':')

        if (`${user}:${password}` === credentials) return null
      } catch {
        // 不正な Base64 は未認証扱い
      }
    }
  }

  return new NextResponse('Unauthorized', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Restricted"' },
  })
}

// 認証が必要なパス
const PROTECTED_PATHS = ['/dashboard']

export function middleware(request: NextRequest) {
  // Basic 認証（BASIC_AUTH_CREDENTIALS が設定されている環境のみ）
  const basicAuthResponse = checkBasicAuth(request)

  if (basicAuthResponse) return basicAuthResponse

  // ルート保護
  const { pathname } = request.nextUrl
  const isProtected = PROTECTED_PATHS.some((path) => pathname.startsWith(path))

  if (!isProtected) return NextResponse.next()

  // Cookie からセッショントークンを取得
  const session = request.cookies.get('session')

  if (!session) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|_next/data|_next/webpack-hmr|favicon.ico).*)',
  ],
}
