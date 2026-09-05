// 参考実装: セッション cookie の発行・破棄
// クライアント SDK でサインイン後、idToken を POST するとセッション cookie が発行される。
// middleware.ts はこの cookie の有無で保護ルートへのアクセスを判定する
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { adminAuth } from '@/lib/firebase-admin'

const SESSION_COOKIE_NAME = 'session'
const SESSION_EXPIRES_IN_MS = 1000 * 60 * 60 * 24 * 5 // 5日

/**
 * ID トークンを session cookie に交換できる猶予（Firebase の公式手順に合わせて 5 分）。
 *
 * 見ないと、有効期限 1 時間の ID トークンが 1 つ漏れただけで、5 日有効な cookie へ
 * 格上げできてしまう（ログイン直後以外の XSS でも成立する）。
 */
const MAX_AUTH_AGE_SECONDS = 5 * 60

/**
 * クロスサイトからの呼び出しを弾く（ログイン CSRF = セッション固定への対策）。
 *
 * Next.js の Server Actions には Origin 検査があるが、Route Handler には無い。
 * 攻撃者サイトから enctype="text/plain" のフォームで攻撃者自身の idToken を
 * top-level POST させると、被害者のブラウザに攻撃者アカウントの cookie が発行される
 * （sameSite: 'lax' はトップレベルナビゲーションの Set-Cookie を受け付ける）。
 *
 * ヘッダーが 1 つも無いのはブラウザ以外からの呼び出し（curl・テスト）なので通す。
 */
function isSameSite(request: Request): boolean {
  const fetchSite = request.headers.get('sec-fetch-site')

  if (fetchSite) {
    return fetchSite === 'same-origin' || fetchSite === 'none'
  }

  // Sec-Fetch-Site を送らない古いブラウザ向け。POST には Origin が必ず付く
  const origin = request.headers.get('origin')

  if (!origin) return true

  try {
    return new URL(origin).host === new URL(request.url).host
  } catch {
    return false
  }
}

/** text/plain フォームによる JSON 偽装を弾く */
function isJsonRequest(request: Request): boolean {
  const contentType = request.headers.get('content-type') ?? ''

  return contentType.split(';')[0].trim().toLowerCase() === 'application/json'
}

export async function POST(request: Request) {
  if (!isSameSite(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!isJsonRequest(request)) {
    return NextResponse.json(
      { error: 'Content-Type must be application/json' },
      { status: 400 }
    )
  }

  let idToken: unknown

  try {
    const body = await request.json()
    idToken = body.idToken
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (typeof idToken !== 'string' || idToken === '') {
    return NextResponse.json({ error: 'idToken is required' }, { status: 400 })
  }

  try {
    // 直近のサインインでのみ cookie を発行する（checkRevoked も同時に見る）
    const decoded = await adminAuth.verifyIdToken(idToken, true)

    if (Date.now() / 1000 - decoded.auth_time > MAX_AUTH_AGE_SECONDS) {
      return NextResponse.json(
        { error: 'Recent sign-in required' },
        { status: 401 }
      )
    }

    const sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn: SESSION_EXPIRES_IN_MS,
    })

    const cookieStore = await cookies()
    cookieStore.set(SESSION_COOKIE_NAME, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_EXPIRES_IN_MS / 1000,
      path: '/',
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Invalid idToken' }, { status: 401 })
  }
}

export async function DELETE(request: Request) {
  if (!isSameSite(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value

  // リフレッシュトークンを失効させる。cookie を消すだけだと、漏れた cookie が
  // 最長 5 日そのまま使える（保護ページは verifySessionCookie(cookie, true) で
  // 失効を見ているため、revoke すれば即座に無効になる）。
  //
  // **これはそのユーザーの全リフレッシュトークンを失効させる。** mobile が同じ
  // Firebase Auth ユーザーを使う構成では、Web のログアウトで mobile も切れる。
  // Firebase に「この session cookie だけを失効させる」API が無いための判断で、
  // 奪われた cookie を無効化できることを優先している。
  // 不都合なら revokeRefreshTokens を外す（→ .claude/docs/architecture.md
  // 「サインアウトは全デバイスのセッションを失効させる」）
  if (sessionCookie) {
    try {
      const decoded = await adminAuth.verifySessionCookie(sessionCookie)
      await adminAuth.revokeRefreshTokens(decoded.sub)
    } catch {
      // 既に無効な cookie。サインアウト自体は成功として扱う
    }
  }

  cookieStore.delete(SESSION_COOKIE_NAME)

  return NextResponse.json({ success: true })
}
