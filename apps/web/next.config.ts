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
  // @geckou/ui-react は 0.2.0 から dist（ビルド済み）を配るので変換は要らない。
  // @geckou/shared も exports の default は dist を指すが、'use client' を含む
  // サブパス（stores / storage 等）を Next 側で正しく扱わせるため残す
  transpilePackages: ['@geckou/shared'],
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
