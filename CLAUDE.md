# CLAUDE.md

This repo is `tuanductran/tuanductran` — GitHub's special "profile README"
repo. It is not an application; it's a small Bun/TypeScript script that
renders `README.template.md` into `README.md`, which GitHub then displays on
the [tuanductran](https://github.com/tuanductran) profile page.

## Stack

- **Runtime/package manager**: [Bun](https://bun.sh) (`packageManager: bun@1.4.0`).
  `preinstall` runs `bunx only-allow bun` — npm/yarn/pnpm are rejected.
- **Language**: TypeScript 6.0.3, strict mode, ESNext target/module,
  `verbatimModuleSyntax`, `noUncheckedIndexedAccess` (see `tsconfig.json`).
- **GitHub API**: `@octokit/rest` v22, with the `@octokit/plugin-retry` and
  `@octokit/plugin-throttling` plugins (`src/lib/octokit.ts`) for transient
  retries and GitHub's rate-limit pacing.
- **Templating**: `mustache`, with HTML-escaping disabled
  (`Mustache.escape = (text) => text` in `src/build-readme.ts`) because the
  output is Markdown, not HTML — the default escaping would corrupt titles
  containing `&`, `<`, `>`, or quotes.
- **Tables**: `markdown-table` + `string-width` render GFM tables aligned by
  _display_ width, so Vietnamese diacritics/CJK/emoji don't misalign column
  delimiters (`src/lib/text.ts`).
- **Feed**: `rss-parser` for the blog RSS feed.
- **Linting**: `@antfu/eslint-config` (`eslint.config.mjs`) and
  `markdownlint-cli2` (`.markdownlint-cli2.jsonc`) for Markdown files.

## Architecture

- `src/build-readme.ts` — entry point (`bun run build`). Reads
  `README.template.md`, fetches releases/stats/posts in parallel, renders
  the template with Mustache, writes `README.md`.
  - `GITHUB_OWNER` env var (default `'tuanductran'`) is the GitHub username
    whose releases/stats/repos populate the README.
  - `BLOG_RSS_URL` env var (default `https://tuanductran.xyz/rss.xml`).
  - `readFallbackStats()` extracts follower/star/fork counts out of the
    _existing_ `README.md` so a failed stats fetch degrades to "keep the
    last known numbers" rather than zeroing them out.
- `src/lib/github.ts` — `fetchReleases()` and `fetchGithubStats()` (GitHub
  REST calls via Octokit), plus pure helpers: `normalizeReleaseTitle()`,
  `pickLatestPerRepo()`, `renderReleaseEntries()`, `extractCurrentStats()`,
  `formatStats()`.
- `src/lib/feed.ts` — `fetchFeedEntries()` / `renderFeedEntries()` for the
  blog RSS feed, via `rss-parser`.
- `src/lib/text.ts` — pure formatting helpers shared by both: emoji
  stripping, middle-truncation, GFM table-cell escaping/rendering.
- `src/lib/octokit.ts` — `createOctokit(auth)` factory wiring up the retry
  and throttling plugins.

## Important: use username-scoped GitHub API endpoints, not "authenticated user" ones

`fetchReleases()` and `fetchGithubStats()` call `octokit.repos.listForUser({
username: owner, ... })` and `octokit.users.getByUsername({ username: owner
})` — **not** `octokit.repos.listForAuthenticatedUser()` /
`octokit.users.getAuthenticated()`.

This matters because the scheduled workflow (`.github/workflows/build.yml`)
authenticates with the default `secrets.GITHUB_TOKEN`, which is a
repo-scoped GitHub App installation token, not a real user token. GitHub
returns `403 Resource not accessible by integration` for `/user` and
`/user/repos` with that token type. Both fetch functions wrap their API
calls in `try/catch` that logs and returns an empty/fallback result instead
of throwing — so a regression here doesn't fail CI, it silently degrades
the "Latest Releases" section to `No recent releases.` (this happened once;
see the fix in this repo's history). Keep using the username-scoped
endpoints so this doesn't regress.

## Commands

```sh
bun run build       # regenerate README.md from README.template.md
bun test             # run tests/*.test.ts
bun run typecheck    # tsc --noEmit
bun run lint         # eslint .
bun run lint:fix
bun run lint:md      # markdownlint-cli2
bun run lint:md:fix
```

## CI (`.github/workflows/`)

- `build.yml` — daily cron (`00:00 UTC`) + on push to `master` touching
  `src/**`/`package.json`/`bun.lockb` + manual dispatch. Installs, tests,
  typechecks, runs `bun run build`, lints Markdown, then commits
  `README.md` back via `stefanzweifel/git-auto-commit-action` (needs
  `permissions: contents: write`, already set).
- `lint.yml` — on push to `master` and on PRs: lint + typecheck + test.
- `dependency-review.yml` — on PRs: scans manifest changes for known-vulnerable
  dependency versions.
- `stale.yml` — daily cron: labels/closes stale issues and PRs.

## Conventions

- **`README.md` is generated output — never hand-edit it.** Edit
  `README.template.md` (the Mustache template) and the `src/` generators
  instead, then run `bun run build`. Both `README.md` and
  `README.template.md` are excluded from ESLint
  (`eslint.config.mjs`), and `README.template.md` is excluded from
  markdownlint (`.markdownlint-cli2.jsonc`) since it contains
  `{{ mustache }}` placeholders and no top-level heading.
- Doc comments in this repo explain _why_, not _what_ — match that style
  (see existing comments in `src/lib/text.ts`, `src/lib/octokit.ts`) rather
  than adding narrative comments.
