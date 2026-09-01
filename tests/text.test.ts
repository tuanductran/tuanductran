import { describe, expect, test } from 'bun:test'

import { stripEmoji, truncateMiddle } from '../src/lib/text'

describe('stripEmoji', () => {
  test('removes emoji and collapses whitespace', () => {
    expect(stripEmoji('Hello 🌟 World  🚀')).toBe('Hello World')
  })

  test('returns empty string for null/undefined', () => {
    expect(stripEmoji(null)).toBe('')
    expect(stripEmoji(undefined)).toBe('')
  })

  test('leaves plain text untouched', () => {
    expect(stripEmoji('V1.14.0 Quieter Pages')).toBe('V1.14.0 Quieter Pages')
  })
})

describe('truncateMiddle', () => {
  test('leaves short strings untouched', () => {
    expect(truncateMiddle('short title', 41)).toBe('short title')
  })

  test('truncates long strings with a middle ellipsis', () => {
    const long = 'From Mole CLI to Model Context Protocol on Mac: What I Learned'
    const result = truncateMiddle(long, 41)
    expect(result.length).toBe(41)
    expect(result).toContain('...')
    expect(result.startsWith('From Mole CLI')).toBe(true)
  })

  test('collapses internal whitespace before measuring length', () => {
    expect(truncateMiddle('a   b   c', 41)).toBe('a b c')
  })
})
