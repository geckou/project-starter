// 参考実装: 認証によるルート保護パターン
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// 認証が必要なパス
const PROTECTED_PATHS = ['/dashboard']

export function middleware(request: NextRequest) {
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

export const config = {
  matcher: ['/dashboard/:path*'],
}
