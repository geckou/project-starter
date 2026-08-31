import { createRequireAuth } from '@geckou/firebase-server'
import { getAuth } from 'firebase-admin/auth'
import type { Request } from 'express'

export type AuthenticatedRequest = Request & { uid: string }

/**
 * Firebase Auth の ID トークンを検証する Express ミドルウェア。
 * 実装は @geckou/firebase-server（geckou/kit）にあり、ここは firebase-admin の
 * Auth を注入するだけ。ゲッター渡しなので initializeApp() より先に評価されても安全。
 * 検証に成功すると req.uid に uid が入る
 */
export const requireAuth = createRequireAuth(getAuth)
