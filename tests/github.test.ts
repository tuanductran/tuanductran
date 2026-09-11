import type { Octokit } from '@octokit/rest'
import type { OwnerRepo } from '../src/lib/github'

import { describe, expect, mock, test } from 'bun:test'
import {
  fetchGithubStats,
  fetchOwnerRepos,
  formatStats,
} from '../src/lib/github'

/**
 * A minimal Octokit stand-in: only the handful of methods `fetchOwnerRepos`
 * and `fetchGithubStats` actually call. `paginate` here just calls the
 * given endpoint once and returns its `data` — good enough since none of
 * these tests exercise real multi-page responses.
 */
function createFakeOctokit(overrides: {
  listForUser?: (params: any) => Promise<{ data: any[] }>
  get?: (params: any) => Promise<{ data: any }>
  getByUsername?: (params: any) => Promise<{ data: any }>
} = {}): Octokit {
  const repos = {
    listForUser: overrides.listForUser ?? (async () => ({ data: [] })),
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

describe('formatStats', () => {
  test('formats numbers with thousands separators', () => {
    expect(formatStats({ followers: 6000, stars: 62000, forks: 10000 })).toBe(
      '6,000 followers, 62,000 stars, 10,000 forks',
    )
  })
})
