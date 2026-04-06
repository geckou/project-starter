import { describe, expect, it } from 'vitest'

import { borderRadius, colors, fontFamily } from '../src/theme'

describe('デザイントークン', () => {
  describe('colors', () => {
    it('primary カラーが 50〜950 の全段階を持つ', () => {
      const expectedKeys = [
        '50',
        '100',
        '200',
        '300',
        '400',
        '500',
        '600',
        '700',
        '800',
        '900',
        '950',
      ]
      expect(Object.keys(colors.primary)).toEqual(expectedKeys)
    })

    it('gray カラーが 50〜950 の全段階を持つ', () => {
      const expectedKeys = [
        '50',
        '100',
        '200',
        '300',
        '400',
        '500',
        '600',
        '700',
        '800',
        '900',
        '950',
      ]
      expect(Object.keys(colors.gray)).toEqual(expectedKeys)
    })

    it('すべてのカラー値が有効な HEX 形式', () => {
      const hexRegex = /^#[0-9a-f]{6}$/

      for (const shade of Object.values(colors.primary)) {
        expect(shade).toMatch(hexRegex)
      }

      for (const shade of Object.values(colors.gray)) {
        expect(shade).toMatch(hexRegex)
      }
    })
  })

  describe('fontFamily', () => {
    it('sans にフォールバックを含む', () => {
      expect(fontFamily.sans.length).toBeGreaterThan(1)
      expect(fontFamily.sans[0]).toBe('Inter')
    })
  })

  describe('borderRadius', () => {
    it('すべてのサイズが定義されている', () => {
      expect(borderRadius).toHaveProperty('sm')
      expect(borderRadius).toHaveProperty('md')
      expect(borderRadius).toHaveProperty('lg')
      expect(borderRadius).toHaveProperty('xl')
      expect(borderRadius).toHaveProperty('2xl')
    })

    it('すべての値が rem 単位', () => {
      for (const value of Object.values(borderRadius)) {
        expect(value).toMatch(/^\d+(\.\d+)?rem$/)
      }
    })

    it('サイズが昇順になっている', () => {
      const sizes = ['sm', 'md', 'lg', 'xl', '2xl'] as const
      const values = sizes.map((s) => parseFloat(borderRadius[s]))

      for (let i = 1; i < values.length; i++) {
        expect(values[i]).toBeGreaterThan(values[i - 1])
      }
    })
  })
})
