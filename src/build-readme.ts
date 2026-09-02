import process from 'node:process'

import Mustache from 'mustache'

import { fetchFeedEntries, renderFeedEntries } from './lib/feed'
import {
  fetchGithubStats,
  fetchOwnerRepos,
  fetchReleases,
  formatStats,
  pickLatestPerRepo,
  pickTopRepos,
  renderReleaseEntries,
  renderTopRepos,
} from './lib/github'
import { createOctokit } from './lib/octokit'

const TEMPLATE_PATH = new URL('../README.template.md', import.meta.url)
const README_PATH = new URL('../README.md', import.meta.url)

// GitHub owner whose releases, stats, and top repos populate the README.
const GITHUB_OWNER = process.env.GITHUB_OWNER ?? 'tuanductran'
// Blog RSS feed that populates "Recent Posts".
const BLOG_RSS_URL = process.env.BLOG_RSS_URL ?? 'https://tuanductran.xyz/rss.xml'
const RELEASE_COUNT = 6
const TOP_REPO_COUNT = 5
const POST_COUNT = 5

// Templates are markdown, not HTML, so mustache's default HTML-escaping
// (turning "&", "<", ">", quotes into entities) would corrupt output like
// release titles or post titles that happen to contain those characters.
Mustache.escape = (text: string) => text

async function main() {
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? ''
  const octokit = createOctokit(token || undefined)

  // fetchOwnerRepos/fetchReleases/fetchGithubStats intentionally throw on a
  // top-level API failure (see their doc comments) instead of silently
  // degrading, so a rejection here must abort *before* README.md is
  // touched — the commit already on disk stays as the last known-good
  // output, and `main().catch` below fails the CI step instead of letting
  // git-auto-commit-action push a degraded README.
  //
  // The owner's repo list is fetched once here and shared with
  // fetchReleases/fetchGithubStats/pickTopRepos below, instead of each of
  // them independently re-fetching the same list.
  const ownerRepos = await fetchOwnerRepos(octokit, GITHUB_OWNER)

  const [releases, stats, posts] = await Promise.all([
    fetchReleases(octokit, ownerRepos),
    fetchGithubStats(octokit, GITHUB_OWNER, ownerRepos),
    fetchFeedEntries(BLOG_RSS_URL, POST_COUNT),
  ])

  const latestReleases = pickLatestPerRepo(releases, RELEASE_COUNT)
  const topRepos = pickTopRepos(ownerRepos, TOP_REPO_COUNT)

  const template = await Bun.file(TEMPLATE_PATH).text()
  const rendered = Mustache.render(template, {
    github_stats: formatStats(stats),
    recent_releases: renderReleaseEntries(latestReleases),
    top_repos: renderTopRepos(topRepos),
    recent_posts: renderFeedEntries(posts),
  })

  await Bun.write(README_PATH, rendered)
  console.warn(`Updated ${GITHUB_OWNER}'s README: ${latestReleases.length} releases, ${topRepos.length} top repos, ${posts.length} posts.`)
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
