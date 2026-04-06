import type { Metadata } from 'next'

import { AuthProvider } from '@/components/auth/AuthProvider'
import {
  GoogleTagManager,
  GoogleTagManagerNoscript,
} from '@/components/GoogleTagManager'
import '@/styles/globals.css'

export const metadata: Metadata = {
  title: 'Geckou App',
  description: 'Built by 合同会社Geckou',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <head>
        <GoogleTagManager />
      </head>
      <body>
        <GoogleTagManagerNoscript />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
