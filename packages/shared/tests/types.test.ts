import { describe, expect, it } from 'vitest'

import type {
  ApiResponse,
  Subscription,
  SubscriptionStatus,
  User,
} from '../src/types'

describe('型定義の整合性', () => {
  it('User 型がすべての必須フィールドを持つ', () => {
    const user: User = {
      id: 'user-1',
      displayName: 'テストユーザー',
      email: 'test@example.com',
      createdAt: new Date(),
    }

    expect(user.id).toBe('user-1')
    expect(user.displayName).toBe('テストユーザー')
    expect(user.email).toBe('test@example.com')
    expect(user.createdAt).toBeInstanceOf(Date)
    expect(user.subscription).toBeUndefined()
  })

  it('User に Subscription をオプションで付与できる', () => {
    const user: User = {
      id: 'user-2',
      displayName: 'Pro ユーザー',
      email: 'pro@example.com',
      createdAt: new Date(),
      subscription: {
        status: 'active',
        updatedAt: new Date(),
      },
    }

    expect(user.subscription?.status).toBe('active')
  })

  it('SubscriptionStatus は3種類のみ', () => {
    const statuses: SubscriptionStatus[] = ['active', 'cancelled', 'expired']
    expect(statuses).toHaveLength(3)
  })

  it('Subscription のオプショナルフィールドが省略可能', () => {
    const subscription: Subscription = {
      status: 'active',
    }

    expect(subscription.updatedAt).toBeUndefined()
    expect(subscription.cancelledAt).toBeUndefined()
    expect(subscription.expiredAt).toBeUndefined()
  })

  it('ApiResponse が成功レスポンスを表現できる', () => {
    const response: ApiResponse<{ name: string }> = {
      success: true,
      data: { name: 'test' },
    }

    expect(response.success).toBe(true)
    expect(response.data?.name).toBe('test')
    expect(response.error).toBeUndefined()
  })

  it('ApiResponse がエラーレスポンスを表現できる', () => {
    const response: ApiResponse<never> = {
      success: false,
      error: 'Not found',
    }

    expect(response.success).toBe(false)
    expect(response.error).toBe('Not found')
    expect(response.data).toBeUndefined()
  })
})
