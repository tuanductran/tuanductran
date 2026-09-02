import type { Octokit } from '@octokit/rest'
import type { OwnerRepo, ReleaseEntry } from '../src/lib/github'

import { describe, expect, mock, test } from 'bun:test'
import {
  fetchGithubStats,
  fetchOwnerRepos,
  fetchReleases,
  formatStats,
  normalizeReleaseTitle,
  pickLatestPerRepo,
  pickTopRepos,
  renderReleaseEntries,
  renderTopRepos,

} from '../src/lib/github'

/**
 * A minimal Octokit stand-in: only the handful of methods `fetchReleases`
 * and `fetchGithubStats` actually call. `paginate` here just calls the
 * given endpoint once and returns its `data` — good enough since none of
 * these tests exercise real multi-page responses.
 */
function createFakeOctokit(overrides: {
  listForUser?: (params: any) => Promise<{ data: any[] }>
  listReleases?: (params: any) => Promise<{ data: any[] }>
  get?: (params: any) => Promise<{ data: any }>
  getByUsername?: (params: any) => Promise<{ data: any }>
} = {}): Octokit {
  const repos = {
    listForUser: overrides.listForUser ?? (async () => ({ data: [] })),
    listReleases: overrides.listReleases ?? (async () => ({ data: [] })),
    get: overrides.get ?? (async () => ({ data: {} })),
  }
  const users = {
    getByUsername: overrides.getByUsername ?? (async () => ({ data: { followers: 0 } })),
  }
  return {
    repos,
    users,
    paginate: async (fn: (params: any) => Promise<{ data: any[] }>, params: any) => {
      const { data } = await fn(params)
      return data
    },
  } as unknown as Octokit
}

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
  test('renders a GFM table with a header row', () => {
    const result = renderReleaseEntries([
      { repo: 'Kami', repoUrl: '', release: 'V1.14.0', publishedAt: '2026-08-30', url: 'https://x/1' },
    ])
    expect(result).toContain('| Release')
    expect(result).toContain('| Published')
    expect(result).toContain('[Kami V1.14.0](https://x/1)')
    expect(result).toContain('2026-08-30')
  })

  test('escapes pipe characters in release titles so the table stays valid', () => {
    const result = renderReleaseEntries([
      { repo: 'Kami', repoUrl: '', release: 'v1 | breaking change', publishedAt: '2026-08-30', url: 'https://x/1' },
    ])
    // one row = header separator line + one data line; a stray unescaped
    // "|" would add an extra column and break every row's cell count.
    const dataLine = result.split('\n').find(line => line.includes('breaking change'))
    expect(dataLine).toContain('\\|')
  })

  test('renders a fallback message for an empty list', () => {
    expect(renderReleaseEntries([])).toBe('No recent releases.')
  })
})

function repo(name: string, extra: Record<string, unknown> = {}) {
  return ({
    name,
    owner: { login: 'tuanductran' },
    html_url: `https://github.com/tuanductran/${name}`,
    fork: false,
    private: false,
    stargazers_count: 0,
    forks_count: 0,
    ...extra,
  }) as OwnerRepo
}

describe('fetchOwnerRepos', () => {
  test('paginates the given username\'s repo list', async () => {
    const octokit = createFakeOctokit({
      listForUser: async ({ username }) => ({ data: [repo(`${username}-repo`)] }),
    })

    const repos = await fetchOwnerRepos(octokit, 'tuanductran')
    expect(repos).toHaveLength(1)
    expect(repos[0]?.name).toBe('tuanductran-repo')
  })

  test('propagates a failure listing the owner\'s repos, instead of silently returning none', async () => {
    const octokit = createFakeOctokit({
      listForUser: async () => {
        throw new Error('403 Resource not accessible by integration')
      },
    })

    await expect(fetchOwnerRepos(octokit, 'tuanductran')).rejects.toThrow(
      '403 Resource not accessible by integration',
    )
  })
})

describe('fetchReleases', () => {
  const release = (extra: Record<string, unknown> = {}) => ({
    name: 'v1.0.0',
    tag_name: 'v1.0.0',
    html_url: 'https://github.com/tuanductran/x/releases/tag/v1.0.0',
    prerelease: false,
    published_at: '2026-08-01T00:00:00Z',
    ...extra,
  })

  test('fetches releases for owned, public, non-fork repos', async () => {
    const octokit = createFakeOctokit({
      listReleases: async ({ repo: name }) => ({
        data: name === 'a' ? [release()] : [],
      }),
    })

    const releases = await fetchReleases(octokit, [repo('a'), repo('b')])
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({ repo: 'a', publishedAt: '2026-08-01' })
  })

  test('skips forked and private repos', async () => {
    const octokit = createFakeOctokit({
      listReleases: async () => ({ data: [release()] }),
    })

    const releases = await fetchReleases(octokit, [
      repo('fork', { fork: true }),
      repo('secret', { private: true }),
    ])
    expect(releases).toHaveLength(0)
  })

  test('skips prereleases, "nightly" tags, and releases with no publish date', async () => {
    const octokit = createFakeOctokit({
      listReleases: async () => ({
        data: [
          release({ prerelease: true }),
          release({ tag_name: 'nightly' }),
          release({ published_at: null }),
          release({ name: 'v2.0.0', tag_name: 'v2.0.0' }),
        ],
      }),
    })

    const releases = await fetchReleases(octokit, [repo('a')])
    expect(releases).toHaveLength(1)
    expect(releases[0]?.release).toBe('v2.0.0')
  })

  test('a single repo\'s failing listReleases call is logged and skipped, not fatal', async () => {
    const errorSpy = mock(() => {})
    const originalError = console.error
    console.error = errorSpy

    try {
      const octokit = createFakeOctokit({
        listReleases: async ({ repo: name }) => {
          if (name === 'broken')
            throw new Error('boom')
          return { data: [release()] }
        },
      })

      const releases = await fetchReleases(octokit, [repo('broken'), repo('a')])
      expect(releases).toHaveLength(1)
      expect(releases[0]?.repo).toBe('a')
      expect(errorSpy).toHaveBeenCalled()
    }
    finally {
      console.error = originalError
    }
  })
})

describe('fetchGithubStats', () => {
  test('sums stars/forks across non-fork repos and reads the follower count', async () => {
    const octokit = createFakeOctokit({
      getByUsername: async () => ({ data: { followers: 594 } }),
    })

    const repos = [
      repo('a', { stargazers_count: 10, forks_count: 2 }),
      repo('fork', { fork: true, stargazers_count: 999, forks_count: 999 }),
      repo('b', { stargazers_count: 5, forks_count: 1 }),
    ]

    expect(await fetchGithubStats(octokit, 'tuanductran', repos)).toEqual({
      followers: 594,
      stars: 15,
      forks: 3,
    })
  })

  test('adds extraRepos into the totals and tolerates one failing to fetch', async () => {
    const errorSpy = mock(() => {})
    const originalError = console.error
    console.error = errorSpy

    try {
      const octokit = createFakeOctokit({
        getByUsername: async () => ({ data: { followers: 0 } }),
        get: async ({ repo: repoName }) => {
          if (repoName === 'broken')
            throw new Error('boom')
          return { data: { stargazers_count: 7, forks_count: 3 } }
        },
      })

      const stats = await fetchGithubStats(octokit, 'tuanductran', [], [
        { owner: 'org', repo: 'broken' },
        { owner: 'org', repo: 'ok' },
      ])

      expect(stats).toEqual({ followers: 0, stars: 7, forks: 3 })
      expect(errorSpy).toHaveBeenCalled()
    }
    finally {
      console.error = originalError
    }
  })

  test('propagates a failure fetching the owner\'s profile, instead of silently falling back', async () => {
    const octokit = createFakeOctokit({
      getByUsername: async () => {
        throw new Error('403 Resource not accessible by integration')
      },
    })

    await expect(fetchGithubStats(octokit, 'tuanductran', [])).rejects.toThrow(
      '403 Resource not accessible by integration',
    )
  })
})

describe('pickTopRepos', () => {
  test('sorts by star count, descending', () => {
    const result = pickTopRepos(
      [repo('a', { stargazers_count: 5 }), repo('b', { stargazers_count: 20 }), repo('c', { stargazers_count: 10 })],
      10,
    )
    expect(result.map(r => r.name)).toEqual(['b', 'c', 'a'])
  })

  test('excludes forked and private repos', () => {
    const result = pickTopRepos(
      [
        repo('a', { stargazers_count: 5 }),
        repo('fork', { fork: true, stargazers_count: 999 }),
        repo('secret', { private: true, stargazers_count: 999 }),
      ],
      10,
    )
    expect(result).toHaveLength(1)
    expect(result[0]?.name).toBe('a')
  })

  test('respects the limit', () => {
    const result = pickTopRepos(
      [repo('a', { stargazers_count: 5 }), repo('b', { stargazers_count: 20 }), repo('c', { stargazers_count: 10 })],
      2,
    )
    expect(result.map(r => r.name)).toEqual(['b', 'c'])
  })
})

describe('renderTopRepos', () => {
  test('renders a GFM table with a header row', () => {
    const result = renderTopRepos([{ name: 'Kami', url: 'https://x/1', stars: 1234 }])
    expect(result).toContain('| Repository')
    expect(result).toContain('| Stars')
    expect(result).toContain('[Kami](https://x/1)')
    expect(result).toContain('1,234')
  })

  test('renders a fallback message for an empty list', () => {
    expect(renderTopRepos([])).toBe('No repositories yet.')
  })
})

describe('formatStats', () => {
  test('formats numbers with thousands separators', () => {
    expect(formatStats({ followers: 6000, stars: 62000, forks: 10000 })).toBe(
      '6,000 followers, 62,000 stars, 10,000 forks',
    )
  })
})
