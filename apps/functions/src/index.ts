import { initializeApp } from 'firebase-admin/app'

initializeApp()

// --- HTTP 関数 ---
export { api } from './api'

// --- スケジュール関数 ---
// export { dailyCleanup } from './scheduled';

// --- Firestore トリガー ---
// export { onUserCreate } from './triggers';
