'use client'

// Firebase クライアント SDK のラッパーは @geckou/firebase-client に移管した
// （geckou/kit で管理・npm 配布）。既存の @geckou/shared/firebase からの
// import を壊さないよう、ここから re-export する。
export { initFirebase } from '@geckou/firebase-client'
