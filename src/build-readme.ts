import process from 'node:process'

import { Octokit } from '@octokit/rest'

import { fetchFeedEntries, renderFeedEntries } from './lib/feed'
import {
  extractCurrentStats,
  fetchGithubStats,
  fetchReleases,
  formatStats,
  pickLatestPerRepo,
  renderReleaseEntries,
} from './lib/github'
import { replaceChunk } from './lib/text'

const README_PATH = new URL('../README.md', import.meta.url)

// GitHub owner whose releases and stats populate "Latest Releases".
const GITHUB_OWNER = process.env.GITHUB_OWNER ?? 'tuanductran'
// Blog RSS feed that populates "Recent Posts".
const BLOG_RSS_URL = process.env.BLOG_RSS_URL ?? 'https://tuanductran.xyz/rss.xml'
const RELEASE_COUNT = 6
const POST_COUNT = 5

async function main() {
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? ''
  const octokit = new Octokit({ auth: token || undefined })

  const readmeContent = await Bun.file(README_PATH).text()
  const fallbackStats = extractCurrentStats(readmeContent)

  const [releases, stats, posts] = await Promise.all([
    fetchReleases(octokit),
    fetchGithubStats(octokit, fallbackStats),
    fetchFeedEntries(BLOG_RSS_URL, POST_COUNT),
  ])

  const latestReleases = pickLatestPerRepo(releases, RELEASE_COUNT)

  let rewritten = replaceChunk(
    readmeContent,
    'recent_releases',
    renderReleaseEntries(latestReleases),
  )
  rewritten = replaceChunk(
    rewritten,
    'github_stats',
    formatStats(stats),
    true,
  )

  const postsMd = posts.length
    ? renderFeedEntries(posts)
    : '• No recent posts available'
  rewritten = replaceChunk(rewritten, 'blog', postsMd)

  await Bun.write(README_PATH, rewritten)
  console.warn(`Updated ${GITHUB_OWNER}'s README: ${latestReleases.length} releases, ${posts.length} posts.`)
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
