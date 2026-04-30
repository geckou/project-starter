// 参考実装: Basic 認証 + ルート保護パターン
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// 認証が必要なパス
const PROTECTED_PATHS = ['/dashboard']

// Authorization ヘッダーの Base64 部分の最大長（過大な値による例外を防ぐ）
const MAX_BASIC_AUTH_HEADER_LENGTH = 1024

// Basic 認証チェック
// BASIC_AUTH_USER と BASIC_AUTH_PASSWORD が設定されている環境（develop / staging）でのみ有効
// production では env を未設定にすることで自動的に無効化される
function handleBasicAuth(request: NextRequest): NextResponse | null {
  const user = process.env.BASIC_AUTH_USER
  const password = process.env.BASIC_AUTH_PASSWORD

  if (!user || !password) return null

  const authorization = request.headers.get('authorization')

  if (authorization) {
    const [scheme, encoded] = authorization.split(' ')
    if (
      scheme === 'Basic' &&
      encoded &&
      encoded.length <= MAX_BASIC_AUTH_HEADER_LENGTH
    ) {
      try {
        const decoded = atob(encoded)
        const [u, ...pParts] = decoded.split(':')
        const p = pParts.join(':')

        if (u === user && p === password) return null
      } catch {
        // 不正な Base64 は未認証扱い
      }
    }
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Restricted"',
    },
  })
}

export function middleware(request: NextRequest) {
  // Basic 認証チェック（develop / staging 環境のみ）
  const basicAuthResponse = handleBasicAuth(request)
  if (basicAuthResponse) return basicAuthResponse

  const { pathname } = request.nextUrl

  // 保護されたパスかチェック
  const isProtected = PROTECTED_PATHS.some((path) => pathname.startsWith(path))

  if (!isProtected) return NextResponse.next()

  // Cookie からセッショントークンを取得
  // ※ Firebase Auth のトークンは通常クライアントで管理するため、
  //   実プロジェクトではセッション Cookie を使うか、
  //   クライアントコンポーネントで onAuthStateChanged を使う
  const session = request.cookies.get('session')

  if (!session) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

// Basic 認証は全パス対象にする必要があるため matcher を広く取る。
// production では env 未設定 → handleBasicAuth が即 null を返すので影響軽微。
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
