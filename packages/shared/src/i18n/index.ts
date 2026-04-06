import { en } from './locales/en'
import { ja } from './locales/ja'

export type Locale = 'ja' | 'en'

export type Translations = typeof ja

export const DEFAULT_LOCALE: Locale = 'ja'

export const locales: Record<Locale, Translations> = {
  ja,
  en,
}

/**
 * ネストされたキーからテキストを取得
 * 例: getTranslation(ja, 'common.loading') → '読み込み中...'
 */
export function getTranslation(
  translations: Translations,
  key: string
): string {
  const keys = key.split('.')
  let result: unknown = translations

  for (const k of keys) {
    if (result && typeof result === 'object' && k in result) {
      result = (result as Record<string, unknown>)[k]
    } else {
      return key
    }
  }

  return typeof result === 'string' ? result : key
}

export { ja, en }
