import { describe, expect, test } from 'bun:test'

import { parseEntryDate, renderFeedEntries } from '../src/lib/feed'

describe('parseEntryDate', () => {
  test('extracts date from an ISO date string', () => {
    expect(parseEntryDate({ isoDate: '2026-08-16T00:00:00.000Z' })).toBe(
      '2026-08-16',
    )
  })

  test('falls back to pubDate when isoDate is missing', () => {
    expect(
      parseEntryDate({ pubDate: 'Sun, 16 Aug 2026 00:00:00 GMT' }),
    ).toBe('2026-08-16')
  })

  test('returns empty string when both fields are missing', () => {
    expect(parseEntryDate({})).toBe('')
  })

  test('returns empty string for an unparseable date', () => {
    expect(parseEntryDate({ pubDate: 'not-a-date' })).toBe('')
  })
})

describe('renderFeedEntries', () => {
  test('renders a GFM table with a header row', () => {
    const result = renderFeedEntries([
      { title: 'Post A', url: 'https://a.example/1', published: '2026-08-01' },
      { title: 'Post B', url: 'https://a.example/2', published: '2026-07-01' },
    ])
    expect(result).toContain('| Post')
    expect(result).toContain('| Published')
    expect(result).toContain('[Post A](https://a.example/1)')
    expect(result).toContain('[Post B](https://a.example/2)')
  })

  test('escapes pipe characters in post titles so the table stays valid', () => {
    const result = renderFeedEntries([
      { title: 'TS | JS: A Comparison', url: 'https://a.example/1', published: '2026-08-01' },
    ])
    expect(result).toContain('TS \\| JS: A Comparison')
  })

  test('renders a fallback message for an empty list', () => {
    expect(renderFeedEntries([])).toBe('No recent posts.')
  })
})
