import process from 'node:process'

import Mustache from 'mustache'

import { fetchGithubStats, fetchOwnerRepos, formatStats } from './lib/github'
import { createOctokit } from './lib/octokit'

const TEMPLATE_PATH = new URL('../README.template.md', import.meta.url)
const README_PATH = new URL('../README.md', import.meta.url)

// GitHub owner whose stats populate the README.
const GITHUB_OWNER = process.env.GITHUB_OWNER ?? 'tuanductran'

// Templates are markdown, not HTML, so mustache's default HTML-escaping
// (turning "&", "<", ">", quotes into entities) would corrupt output like
// a follower/star count that happens to contain those characters.
Mustache.escape = (text: string) => text

async function main() {
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? ''
  const octokit = createOctokit(token || undefined)

  // fetchOwnerRepos/fetchGithubStats intentionally throw on a top-level API
  // failure (see their doc comments) instead of silently degrading, so a
  // rejection here must abort *before* README.md is touched — the commit
  // already on disk stays as the last known-good output, and
  // `main().catch` below fails the CI step instead of letting
  // git-auto-commit-action push a degraded README.
  const ownerRepos = await fetchOwnerRepos(octokit, GITHUB_OWNER)
  const stats = await fetchGithubStats(octokit, GITHUB_OWNER, ownerRepos)

  const template = await Bun.file(TEMPLATE_PATH).text()
  const rendered = Mustache.render(template, {
    github_stats: formatStats(stats),
  })

  await Bun.write(README_PATH, rendered)
  console.warn(`Updated ${GITHUB_OWNER}'s README: ${formatStats(stats)}.`)
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
