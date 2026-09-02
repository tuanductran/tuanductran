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
 * repo the authenticated user owns. Extra repos (not owned by the user, e.g.
 * an org project they contribute to) can be included via `extraRepos`.
 */
export async function fetchReleases(
  octokit: Octokit,
  options: { maxPerRepo?: number } = {},
): Promise<ReleaseEntry[]> {
  const { maxPerRepo = 10 } = options
  const releases: ReleaseEntry[] = []

  try {
    const repos = await octokit.paginate(octokit.repos.listForAuthenticatedUser, {
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
  }
  catch (error) {
    console.error('Error fetching releases:', error)
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

/** Sum stargazers/forks across owned, non-fork repos, plus optional extra repos, and the user's follower count. */
export async function fetchGithubStats(
  octokit: Octokit,
  fallback: GithubStats,
  extraRepos: Array<{ owner: string, repo: string }> = [],
): Promise<GithubStats> {
  try {
    const { data: user } = await octokit.users.getAuthenticated()

    let totalStars = 0
    let totalForks = 0

    const repos = await octokit.paginate(octokit.repos.listForAuthenticatedUser, {
      type: 'owner',
      per_page: 100,
    })

    for (const repo of repos) {
      if (repo.fork)
        continue
      totalStars += repo.stargazers_count ?? 0
      totalForks += repo.forks_count ?? 0
    }

    for (const { owner, repo } of extraRepos) {
      try {
        const { data } = await octokit.repos.get({ owner, repo })
        totalStars += data.stargazers_count ?? 0
        totalForks += data.forks_count ?? 0
      }
      catch (error) {
        console.error(`Error fetching stats for ${owner}/${repo}:`, error)
      }
    }

    return { stars: totalStars, forks: totalForks, followers: user.followers }
  }
  catch (error) {
    console.error('Error fetching GitHub stats:', error)
    return fallback
  }
}

/** Pull `N,NNN followers, N,NNN stars, N,NNN forks` out of existing README text, for a fallback if the API call fails. */
export function extractCurrentStats(readmeContent: string): GithubStats {
  const match = readmeContent.match(
    /([\d,]+) followers, ([\d,]+) stars, ([\d,]+) forks/,
  )
  const [, followers, stars, forks] = match ?? []
  if (!followers || !stars || !forks)
    return { followers: 0, stars: 0, forks: 0 }

  return {
    followers: Number(followers.replace(/,/g, '')),
    stars: Number(stars.replace(/,/g, '')),
    forks: Number(forks.replace(/,/g, '')),
  }
}

export function formatStats(stats: GithubStats): string {
  const fmt = (n: number) => n.toLocaleString('en-US')
  return `${fmt(stats.followers)} followers, ${fmt(stats.stars)} stars, ${fmt(stats.forks)} forks`
}
