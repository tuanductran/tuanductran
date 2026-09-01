import { describe, expect, test } from 'bun:test'

import { replaceChunk, stripEmoji, truncateMiddle } from '../src/lib/text'

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

describe('replaceChunk', () => {
  const template = 'before <!-- x starts --><!-- x ends --> after'

  test('replaces block content, wrapped on new lines by default', () => {
    const result = replaceChunk(template, 'x', 'hello')
    expect(result).toBe(
      'before <!-- x starts -->\nhello\n<!-- x ends --> after',
    )
  })

  test('replaces block content inline when inline=true', () => {
    const result = replaceChunk(template, 'x', 'hello', true)
    expect(result).toBe('before <!-- x starts -->hello<!-- x ends --> after')
  })

  test('is idempotent across repeated runs', () => {
    const once = replaceChunk(template, 'x', 'first')
    const twice = replaceChunk(once, 'x', 'second')
    expect(twice).toContain('second')
    expect(twice).not.toContain('first')
  })

  test('leaves other markers alone', () => {
    const multi
      = '<!-- a starts --><!-- a ends --><!-- b starts -->keep<!-- b ends -->'
    const result = replaceChunk(multi, 'a', 'changed')
    expect(result).toContain('changed')
    expect(result).toContain('keep')
  })
})
