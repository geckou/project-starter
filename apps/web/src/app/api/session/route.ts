// 参考実装: セッション cookie の発行・破棄
// クライアント SDK でサインイン後、idToken を POST するとセッション cookie が発行される。
// middleware.ts はこの cookie の有無で保護ルートへのアクセスを判定する
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { adminAuth } from '@/lib/firebase-admin'

const SESSION_COOKIE_NAME = 'session'
const SESSION_EXPIRES_IN_MS = 1000 * 60 * 60 * 24 * 5 // 5日

export async function POST(request: Request) {
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

export async function DELETE() {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE_NAME)

  return NextResponse.json({ success: true })
}
