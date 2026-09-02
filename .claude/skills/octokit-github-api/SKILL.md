---
name: octokit-github-api
description: GitHub REST API conventions for this repo's Octokit usage in src/lib/github.ts and src/lib/octokit.ts. Use when adding or changing any GitHub API call (fetchOwnerRepos, fetchReleases, fetchGithubStats, or a new fetch), or when a "Latest Releases"/"Top Repositories"/stats section silently degrades to a fallback string.
---

## Always use username-scoped endpoints, never "authenticated user" ones

Use `octokit.repos.listForUser({ username, ... })` and `octokit.users.getByUsername({ username })` — never `listForAuthenticatedUser()` / `getAuthenticated()`.

Why: `.github/workflows/build.yml` authenticates with the default `secrets.GITHUB_TOKEN`, a repo-scoped GitHub App installation token, not a real user token. GitHub returns `403 Resource not accessible by integration` for `/user` and `/user/repos` with that token type. This broke "Latest Releases" once already (see the `fix: use username-scoped GitHub API endpoints` commit in this repo's history) — the endpoints silently 403'd and the failure was swallowed, degrading the README instead of failing CI.

## Fetch the repo list once, share it

`fetchOwnerRepos(octokit, owner)` in `src/lib/github.ts` is the single source of truth for the owner's repo list (includes `stargazers_count`, `forks_count`, `fork`, `private` for every repo). `fetchReleases`, `fetchGithubStats`, and `pickTopRepos` all take that list as a parameter — none of them re-fetch it. If you add a new consumer that needs the repo list, thread `ownerRepos` through from `src/build-readme.ts`'s `main()` instead of calling `fetchOwnerRepos` again.

## Let top-level fetch failures throw — never swallow-and-fallback

`fetchOwnerRepos`, `fetchReleases`, and `fetchGithubStats` do not wrap their main API call in try/catch. A failure propagates to `main().catch(...)` in `src/build-readme.ts`, which sets a non-zero exit code *before* `README.md` is written — so CI fails loudly instead of committing a degraded README (`No recent releases.`, zeroed stats, an empty repo list). Only a *per-item* failure inside a loop (one repo's `listReleases`, one `extraRepos.get`) is caught, logged, and skipped — that's fine, since it doesn't taint the rest of the run. Don't add a new try/catch-and-return-fallback around a top-level call; if new code genuinely needs graceful degradation, make that an explicit, separate decision, not a silent default.

## Client setup

`createOctokit(auth)` in `src/lib/octokit.ts` wires up `@octokit/plugin-retry` (transient 5xx/network retries) and `@octokit/plugin-throttling` (rate-limit pacing, gives up after 2 retries). Use this factory for any new Octokit instance in this repo rather than constructing `Octokit` directly.

## Caching

This repo deliberately does not do cross-run HTTP/ETag caching of GitHub API responses: it's documented as unreliable for GitHub App installation-token auth (this workflow's `GITHUB_TOKEN`), and at this call volume (once daily, a few dozen requests) there's no rate-limit problem it would solve. The one real optimization is the in-run repo-list sharing described above. See CLAUDE.md's "Caching" section before proposing a persisted response cache.
