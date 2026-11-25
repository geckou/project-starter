import { initializeApp } from 'firebase-admin/app'

import { api } from './api'

initializeApp()

// 関数は「環境別」か「全環境共通」のどちらかに必ず分類する（#408）。
// 分類は ../function-environments.json にも書く — deploy.sh / deploy.yml はそれを読んで
// `firebase deploy --only functions:<名前>` の対象を決める。ここと一致していることは
// tests/function-environments.test.ts が検査する（宣言漏れの関数が配られない事故を防ぐ）。
// → .claude/docs/git-workflow.md「Functions は環境別と全環境共通に分けて配る」

// --- 環境別 ---
// 環境ごとに 1 つずつ配る（HTTP API のように、クライアントが環境ごとの URL を選ぶもの）。
// Firestore / Storage / Auth のトリガーはここに入れない — データは全環境で 1 つなので、
// 3 環境ぶんが同じ書き込みで全部発火する（→ 全環境共通に置く）。
// develop / staging は `<環境名>-<名前>`、production は `<名前>` のままで配る。
// production の名前を変えないのは、配信済みのクライアントが持つ URL を壊さないため
const perEnvironment = {
  api,
}

// --- 全環境共通 ---
// production のデプロイでだけ配る（Firestore / Storage / Auth のトリガー、スケジュール実行など）
// export { dailyCleanup } from './scheduled'
// export { onUserCreate } from './triggers'

// production
export { api }

// develop / staging（グループ。デプロイ後の名前は develop-api / staging-api）
export const develop = perEnvironment
export const staging = perEnvironment
