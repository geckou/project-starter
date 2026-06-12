/**
 * 日付を YYYY-MM-DD 形式にフォーマット（ローカルタイムゾーン基準）。
 * toISOString() は UTC 基準のため、JST では朝9時前に前日となるバグの元になる
 */
export function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

/**
 * sleep ユーティリティ
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
