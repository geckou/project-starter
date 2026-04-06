import { describe, expect, it } from 'vitest'

import { DEFAULT_LOCALE, en, getTranslation, ja, locales } from '../src/i18n'

describe('i18n', () => {
  it('デフォルトロケールが ja', () => {
    expect(DEFAULT_LOCALE).toBe('ja')
  })

  it('ja と en の翻訳キーが一致する', () => {
    const jaKeys = Object.keys(ja).sort()
    const enKeys = Object.keys(en).sort()
    expect(jaKeys).toEqual(enKeys)

    for (const section of jaKeys) {
      const jaSection = ja[section as keyof typeof ja]
      const enSection = en[section as keyof typeof en]
      expect(Object.keys(jaSection).sort()).toEqual(
        Object.keys(enSection).sort()
      )
    }
  })

  it('getTranslation でネストキーから値を取得できる', () => {
    expect(getTranslation(ja, 'common.loading')).toBe('読み込み中...')
    expect(getTranslation(en, 'common.loading')).toBe('Loading...')
  })

  it('存在しないキーはキー文字列をそのまま返す', () => {
    expect(getTranslation(ja, 'nonexistent.key')).toBe('nonexistent.key')
  })

  it('locales に全ロケールが含まれる', () => {
    expect(Object.keys(locales)).toEqual(['ja', 'en'])
  })
})
