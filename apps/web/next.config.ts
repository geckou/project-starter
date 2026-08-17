import path from 'path'
import { fileURLToPath } from 'url'

import type { NextConfig } from 'next'

// CJS コンパイル時は import.meta.url が undefined になるためガード
const appDir =
  typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(appDir, '../../'),
  transpilePackages: ['@geckou/shared', '@geckou/ui'],
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        {
          key: 'Permissions-Policy',
          value: 'camera=(), microphone=(), geolocation=()',
        },
      ],
    },
  ],
}

export default nextConfig
