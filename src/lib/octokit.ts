import { retry } from '@octokit/plugin-retry'
import { throttling } from '@octokit/plugin-throttling'
import { Octokit as OctokitCore } from '@octokit/rest'

/**
 * `retry` and `throttling` are the two plugins octokit/rest.js's own docs
 * recommend for anything beyond a one-off script: `retry` re-sends
 * requests that fail with a transient network/5xx error, and `throttling`
 * implements GitHub's documented request-pacing rules so a burst of calls
 * (one `listReleases` per repo, in our case) doesn't trip a secondary rate
 * limit. See https://github.com/octokit/plugin-throttling.js and
 * https://github.com/octokit/plugin-retry.js.
 */
const Octokit = OctokitCore.plugin(retry, throttling)

export function createOctokit(auth: string | undefined): OctokitCore {
  return new Octokit({
    auth,
    throttle: {
      onRateLimit: (retryAfter, options, octokit, retryCount) => {
        octokit.log.warn(`Rate limit hit for ${options.method} ${options.url}, retrying after ${retryAfter}s`)
        // Give up after 2 retries so a misbehaving run can't hang the
        // scheduled workflow indefinitely.
        return retryCount < 2
      },
      onSecondaryRateLimit: (retryAfter, options, octokit) => {
        octokit.log.warn(`Secondary rate limit hit for ${options.method} ${options.url}, retrying after ${retryAfter}s`)
        return true
      },
    },
  })
}
