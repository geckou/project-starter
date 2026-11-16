import '../global.css'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'

import { initSentry, wrapWithSentry } from '@/lib/sentry'

// wrapWithSentry より先に呼ぶ。DSN 未設定・パッケージ未インストールなら何もしない
initSentry()

function RootLayout() {
  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      />
      <StatusBar style="auto" />
    </>
  )
}

export default wrapWithSentry(RootLayout)
