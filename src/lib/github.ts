import type { Octokit } from '@octokit/rest'

export interface GithubStats {
  followers: number
  stars: number
  forks: number
}

/**
 * Fetch every repo `owner` has, via `listForUser` (public, username-scoped)
 * rather than `listForAuthenticatedUser` ("who am I") — the CI workflow
 * authenticates with the default `GITHUB_TOKEN`, which is a repo-scoped
 * GitHub App installation token, not a real user token, so `/user/repos`
 * 403s for it.
 *
 * Called once per build and the result shared with `fetchGithubStats` (both
 * previously made this exact same paginated call independently). No
 * fallback exists for a broken repo listing, so a failure here propagates
 * rather than being swallowed — see the incident this repo had from doing
 * that, documented in CLAUDE.md.
 */
export async function fetchOwnerRepos(octokit: Octokit, owner: string) {
  return octokit.paginate(octokit.repos.listForUser, {
    username: owner,
    type: 'owner',
    per_page: 100,
  })
}

export type OwnerRepo = Awaited<ReturnType<typeof fetchOwnerRepos>>[number]

/**
 * Sum stargazers/forks across `owner`'s owned, non-fork repos in `repos`,
 * plus optional extra repos, and `owner`'s follower count.
 *
 * Uses `getByUsername` rather than `getAuthenticated` for the same reason
 * as `fetchOwnerRepos` above: the default `GITHUB_TOKEN` isn't a user
 * token, so the "authenticated user" endpoint 403s for it.
 *
 * `getByUsername` failing propagates rather than falling back to a stale
 * number: the committed README already holds the last known-good stats, so
 * the caller aborting the build (and leaving that commit untouched) is a
 * better fallback than a runtime one that can silently mask a broken
 * fetch. A single failed `extraRepos` lookup is tolerated (logged, that
 * repo just contributes 0).
 */
export async function fetchGithubStats(
  octokit: Octokit,
  owner: string,
  repos: OwnerRepo[],
  extraRepos: Array<{ owner: string, repo: string }> = [],
): Promise<GithubStats> {
  const { data: user } = await octokit.users.getByUsername({ username: owner })

  let totalStars = 0
  let totalForks = 0

  for (const repo of repos) {
    if (repo.fork)
      continue
    totalStars += repo.stargazers_count ?? 0
    totalForks += repo.forks_count ?? 0
  }

  for (const { owner: extraOwner, repo } of extraRepos) {
    try {
      const { data } = await octokit.repos.get({ owner: extraOwner, repo })
      totalStars += data.stargazers_count ?? 0
      totalForks += data.forks_count ?? 0
    }
    catch (error) {
      console.error(`Error fetching stats for ${extraOwner}/${repo}:`, error)
    }
  }

  return { stars: totalStars, forks: totalForks, followers: user.followers }
}

export function formatStats(stats: GithubStats): string {
  const fmt = (n: number) => n.toLocaleString('en-US')
  return `${fmt(stats.followers)} followers, ${fmt(stats.stars)} stars, ${fmt(stats.forks)} forks`
}
