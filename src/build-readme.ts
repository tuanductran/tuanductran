import process from 'node:process'

import { Octokit } from '@octokit/rest'
import Mustache from 'mustache'

import { fetchFeedEntries, renderFeedEntries } from './lib/feed'
import {
  extractCurrentStats,
  fetchGithubStats,
  fetchReleases,
  formatStats,
  pickLatestPerRepo,
  renderReleaseEntries,
} from './lib/github'

const TEMPLATE_PATH = new URL('../README.template.md', import.meta.url)
const README_PATH = new URL('../README.md', import.meta.url)

// GitHub owner whose releases and stats populate "Latest Releases".
const GITHUB_OWNER = process.env.GITHUB_OWNER ?? 'tuanductran'
// Blog RSS feed that populates "Recent Posts".
const BLOG_RSS_URL = process.env.BLOG_RSS_URL ?? 'https://tuanductran.xyz/rss.xml'
const RELEASE_COUNT = 6
const POST_COUNT = 5

// Templates are markdown, not HTML, so mustache's default HTML-escaping
// (turning "&", "<", ">", quotes into entities) would corrupt output like
// release titles or post titles that happen to contain those characters.
Mustache.escape = (text: string) => text

async function readFallbackStats() {
  try {
    const existingReadme = await Bun.file(README_PATH).text()
    return extractCurrentStats(existingReadme)
  }
  catch {
    return { followers: 0, stars: 0, forks: 0 }
  }
}

async function main() {
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? ''
  const octokit = new Octokit({ auth: token || undefined })

  const fallbackStats = await readFallbackStats()

  const [releases, stats, posts] = await Promise.all([
    fetchReleases(octokit),
    fetchGithubStats(octokit, fallbackStats),
    fetchFeedEntries(BLOG_RSS_URL, POST_COUNT),
  ])

  const latestReleases = pickLatestPerRepo(releases, RELEASE_COUNT)

  const template = await Bun.file(TEMPLATE_PATH).text()
  const rendered = Mustache.render(template, {
    github_stats: formatStats(stats),
    recent_releases: renderReleaseEntries(latestReleases),
    recent_posts: renderFeedEntries(posts),
  })

  await Bun.write(README_PATH, rendered)
  console.warn(`Updated ${GITHUB_OWNER}'s README: ${latestReleases.length} releases, ${posts.length} posts.`)
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
