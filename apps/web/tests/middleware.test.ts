import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { middleware } from '@/middleware'

const CREDENTIALS = 'user:pass'

function buildRequest(
  path: string,
  options: { authorization?: string; session?: boolean } = {}
) {
  const url = `https://example.web.app${path}`
  const headers = new Headers()

  if (options.authorization) headers.set('authorization', options.authorization)

  const request = new NextRequest(url, { headers })

  if (options.session) request.cookies.set('session', 'token')

  return request
}

const validAuth = `Basic ${Buffer.from(CREDENTIALS).toString('base64')}`
const wrongAuth = `Basic ${Buffer.from('wrong:cred').toString('base64')}`

describe('middleware basic auth', () => {
  describe('with BASIC_AUTH_CREDENTIALS set', () => {
    beforeEach(() => {
      process.env.BASIC_AUTH_CREDENTIALS = CREDENTIALS
    })

    afterEach(() => {
      delete process.env.BASIC_AUTH_CREDENTIALS
    })

    it('returns 401 with no-store when unauthenticated', () => {
      const response = middleware(buildRequest('/'))

      expect(response.status).toBe(401)
      expect(response.headers.get('cache-control')).toBe('private, no-store')
    })

    it('returns 401 with no-store on wrong credentials', () => {
      const response = middleware(
        buildRequest('/', { authorization: wrongAuth })
      )

      expect(response.status).toBe(401)
      expect(response.headers.get('cache-control')).toBe('private, no-store')
    })

    it('passes valid credentials but still sets no-store to block CDN caching', () => {
      const response = middleware(
        buildRequest('/', { authorization: validAuth })
      )

      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBe('private, no-store')
    })

    it('sets no-store on the login redirect for protected paths', () => {
      const response = middleware(
        buildRequest('/dashboard', { authorization: validAuth })
      )

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toContain('/login')
      expect(response.headers.get('cache-control')).toBe('private, no-store')
    })
  })

  describe('without BASIC_AUTH_CREDENTIALS (disabled)', () => {
    it('passes through without forcing no-store', () => {
      const response = middleware(buildRequest('/'))

      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBeNull()
    })
  })
})
