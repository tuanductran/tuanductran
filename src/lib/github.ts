import type { Octokit } from '@octokit/rest'

import { renderTable, stripEmoji } from './text'

export interface ReleaseEntry {
  repo: string
  repoUrl: string
  release: string
  publishedAt: string
  url: string
}

export interface GithubStats {
  followers: number
  stars: number
  forks: number
}

/** Strip the repo name out of a release title, then the emoji, e.g. "MyApp v1.2.0" -> "v1.2.0". */
export function normalizeReleaseTitle(
  repoName: string,
  releaseTitle: string | null,
  tagName: string | null,
): string {
  let title = stripEmoji((releaseTitle ?? '').replace(repoName, '').trim())
  if (!title)
    title = stripEmoji(tagName ?? '').trim()
  return title || 'Release'
}

/**
 * Fetch the most recent non-prerelease release for every public, non-fork
 * repo `owner` owns. Extra repos (not owned by `owner`, e.g. an org project
 * they contribute to) can be included via `extraRepos`.
 *
 * Deliberately uses `listForUser` (public, username-scoped) rather than
 * `listForAuthenticatedUser` ("who am I") — the CI workflow authenticates
 * with the default `GITHUB_TOKEN`, which is a repo-scoped GitHub App
 * installation token, not a real user token, so `/user/repos` 403s for it.
 *
 * A single repo's `listReleases` call failing is tolerated (logged, that
 * repo just contributes no releases) since it doesn't taint the rest of the
 * run. But `listForUser` itself failing propagates: there is no meaningful
 * fallback for "recent releases", so the caller should surface this loudly
 * rather than silently rendering "No recent releases." (see the incident
 * this repo had from swallowing exactly this error — documented in
 * CLAUDE.md).
 */
export async function fetchReleases(
  octokit: Octokit,
  owner: string,
  options: { maxPerRepo?: number } = {},
): Promise<ReleaseEntry[]> {
  const { maxPerRepo = 10 } = options
  const releases: ReleaseEntry[] = []

  const repos = await octokit.paginate(octokit.repos.listForUser, {
    username: owner,
    type: 'owner',
    per_page: 100,
  })

  for (const repo of repos) {
    if (repo.fork || repo.private)
      continue

    try {
      const repoReleases = await octokit.paginate(octokit.repos.listReleases, {
        owner: repo.owner.login,
        repo: repo.name,
        per_page: maxPerRepo,
      })

      for (const release of repoReleases.slice(0, maxPerRepo)) {
        if (release.prerelease)
          continue
        if ((release.tag_name ?? '').toLowerCase() === 'nightly')
          continue
        if (!release.published_at)
          continue

        releases.push({
          repo: repo.name,
          repoUrl: repo.html_url,
          release: normalizeReleaseTitle(
            repo.name,
            release.name,
            release.tag_name,
          ),
          publishedAt: release.published_at.slice(0, 10),
          url: release.html_url,
        })
      }
    }
    catch (error) {
      console.error(`Error fetching releases for ${repo.name}:`, error)
    }
  }

  return releases
}

/** Keep only the most recent release per repo, sorted newest first. */
export function pickLatestPerRepo(
  releases: ReleaseEntry[],
  limit: number,
): ReleaseEntry[] {
  const sorted = [...releases].sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt),
  )
  const seen = new Set<string>()
  const unique: ReleaseEntry[] = []

  for (const release of sorted) {
    if (seen.has(release.repo))
      continue
    seen.add(release.repo)
    unique.push(release)
    if (unique.length >= limit)
      break
  }

  return unique
}

/** Render release entries as a GFM table: `Release | Published`. */
export function renderReleaseEntries(releases: ReleaseEntry[]): string {
  if (releases.length === 0)
    return 'No recent releases.'

  const rows: [string, string][] = releases.map(r => [
    `[${r.repo} ${r.release}](${r.url})`,
    r.publishedAt,
  ])
  return renderTable(['Release', 'Published'], rows)
}

/**
 * Sum stargazers/forks across `owner`'s owned, non-fork repos, plus optional
 * extra repos, and `owner`'s follower count.
 *
 * Uses `getByUsername`/`listForUser` rather than `getAuthenticated`/
 * `listForAuthenticatedUser` for the same reason as `fetchReleases` above:
 * the default `GITHUB_TOKEN` isn't a user token, so the "authenticated
 * user" endpoints 403 for it.
 *
 * `getByUsername`/`listForUser` failing propagates rather than falling back
 * to a stale number, for the same reason as `fetchReleases`: the committed
 * README already holds the last known-good stats, so the caller aborting
 * the build (and leaving that commit untouched) is a better fallback than
 * a runtime one that can silently mask a broken fetch. A single failed
 * `extraRepos` lookup is tolerated (logged, that repo just contributes 0).
 */
export async function fetchGithubStats(
  octokit: Octokit,
  owner: string,
  extraRepos: Array<{ owner: string, repo: string }> = [],
): Promise<GithubStats> {
  const { data: user } = await octokit.users.getByUsername({ username: owner })

  let totalStars = 0
  let totalForks = 0

  const repos = await octokit.paginate(octokit.repos.listForUser, {
    username: owner,
    type: 'owner',
    per_page: 100,
  })

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
