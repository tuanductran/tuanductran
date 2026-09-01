import type { ReleaseEntry } from '../src/lib/github'

import { describe, expect, test } from 'bun:test'
import {
  extractCurrentStats,
  formatStats,
  normalizeReleaseTitle,
  pickLatestPerRepo,
  renderReleaseEntries,

} from '../src/lib/github'

describe('normalizeReleaseTitle', () => {
  test('strips the repo name and emoji from the release title', () => {
    expect(normalizeReleaseTitle('Kami', 'Kami V1.14.0 🎉 Quieter Pages', 'V1.14.0')).toBe(
      'V1.14.0 Quieter Pages',
    )
  })

  test('falls back to the tag name when the title is empty', () => {
    expect(normalizeReleaseTitle('Kami', '', 'V1.14.0')).toBe('V1.14.0')
  })

  test('falls back to \'Release\' when nothing is usable', () => {
    expect(normalizeReleaseTitle('Kami', null, null)).toBe('Release')
  })
})

describe('pickLatestPerRepo', () => {
  const releases: ReleaseEntry[] = [
    { repo: 'a', repoUrl: '', release: 'v2', publishedAt: '2026-08-01', url: 'u2' },
    { repo: 'a', repoUrl: '', release: 'v1', publishedAt: '2026-07-01', url: 'u1' },
    { repo: 'b', repoUrl: '', release: 'v1', publishedAt: '2026-08-15', url: 'u3' },
  ]

  test('keeps only the newest release per repo', () => {
    const result = pickLatestPerRepo(releases, 10)
    expect(result).toHaveLength(2)
    expect(result.find(r => r.repo === 'a')?.publishedAt).toBe('2026-08-01')
  })

  test('sorts newest first and respects the limit', () => {
    const result = pickLatestPerRepo(releases, 1)
    expect(result).toHaveLength(1)
    expect(result[0]?.repo).toBe('b')
  })
})

describe('renderReleaseEntries', () => {
  test('renders the repo + release bullet list', () => {
    const result = renderReleaseEntries([
      { repo: 'Kami', repoUrl: '', release: 'V1.14.0', publishedAt: '2026-08-30', url: 'https://x/1' },
    ])
    expect(result).toBe('• [Kami V1.14.0](https://x/1) - 2026-08-30')
  })
})

describe('extractCurrentStats', () => {
  test('parses comma-separated counts out of README prose', () => {
    const stats = extractCurrentStats('12,852 followers, 174,007 stars, 18,907 forks across code projects.')
    expect(stats).toEqual({ followers: 12852, stars: 174007, forks: 18907 })
  })

  test('returns zeros when the pattern is not found', () => {
    expect(extractCurrentStats('no stats here')).toEqual({
      followers: 0,
      stars: 0,
      forks: 0,
    })
  })
})

describe('formatStats', () => {
  test('formats numbers with thousands separators', () => {
    expect(formatStats({ followers: 6000, stars: 62000, forks: 10000 })).toBe(
      '6,000 followers, 62,000 stars, 10,000 forks',
    )
  })
})
