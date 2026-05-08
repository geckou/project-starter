// 環境非依存（型・純ユーティリティ・定数）のみをルートバレルから export する。
// firebase (client SDK) や zustand に依存するモジュールは、それらに依存するアプリ
// （web / mobile）が必要に応じてサブパス経由で import する:
//   import { initFirebase } from '@geckou/shared/firebase'
//   import { useAuthStore } from '@geckou/shared/stores'
//   import { uploadFile }   from '@geckou/shared/storage'
//   import { ... }          from '@geckou/shared/firestore'
// これにより、firebase-admin だけを依存に持つ functions が
// `@geckou/shared` を import しても firebase / zustand の型解決が不要になる。

export * from './types'
export * from './utils'
export * from './theme'
export * from './i18n'
