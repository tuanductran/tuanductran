import { describe, expect, test } from 'bun:test'

import { escapeTableCell, stripEmoji, truncateMiddle } from '../src/lib/text'

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

/**
 * True if `text` contains a "|" that a markdown table parser would read as
 * a bare column separator, i.e. one preceded by an even number (including
 * zero) of backslashes. An odd number of preceding backslashes means the
 * last one escapes the pipe.
 */
function hasUnescapedPipe(text: string): boolean {
  let backslashRun = 0
  for (const char of text) {
    if (char === '\\') {
      backslashRun += 1
      continue
    }
    if (char === '|' && backslashRun % 2 === 0)
      return true
    backslashRun = 0
  }
  return false
}

describe('escapeTableCell', () => {
  test('escapes a bare pipe', () => {
    expect(escapeTableCell('a | b')).toBe('a \\| b')
  })

  test('replaces newlines with spaces', () => {
    expect(escapeTableCell('line one\nline two')).toBe('line one line two')
    expect(escapeTableCell('line one\r\nline two')).toBe('line one line two')
  })

  test('escapes an existing backslash before escaping pipes, so a pre-escaped pipe in the input stays escaped in the output', () => {
    // "CVE-2020-\|-style" already contains a literal backslash-pipe.
    // Escaping "|" alone would turn "\|" into "\\|", where the doubled
    // backslash reads as one literal backslash and un-escapes the pipe
    // again -- exactly the CodeQL js/incomplete-sanitization finding.
    const input = 'a \\| b'
    const result = escapeTableCell(input)
    expect(hasUnescapedPipe(result)).toBe(false)
  })

  test('never leaves an unescaped pipe for arbitrary backslash/pipe combinations', () => {
    const cases = ['|', '\\|', '\\\\|', '\\\\\\|', 'x\\|y|z', '\\']
    for (const input of cases) {
      expect(hasUnescapedPipe(escapeTableCell(input))).toBe(false)
    }
  })
})
