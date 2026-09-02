# CLAUDE.md

This repo is `tuanductran/tuanductran` — GitHub's special "profile README"
repo. It is not an application; it's a small Bun/TypeScript script that
renders `README.template.md` into `README.md`, which GitHub then displays on
the [tuanductran](https://github.com/tuanductran) profile page.

## Stack

- **Runtime/package manager**: [Bun](https://bun.sh) (`packageManager: bun@1.4.0`).
  `preinstall` runs `bunx only-allow bun` — npm/yarn/pnpm are rejected. Bun
  1.4 is a from-scratch Rust rewrite of the runtime (previously Zig): a large
  Node.js-compat jump, ~5x lower idle CPU, ~35% lower memory, and ~50%
  faster startup on Linux. Its test runner (used by `bun test` here) gained
  `--grep`, `--shard`/`--changed` for CI sharding, and `Symbol.dispose`
  support on `mock()`/`spyOn()` — none of which this repo's small suite
  currently needs, but worth knowing about before reaching for a third-party
  alternative.
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

- `src/build-readme.ts` — entry point (`bun run build`). Fetches the
  owner's repo list once, then releases/stats/posts in parallel, renders
  `README.template.md` with Mustache, writes `README.md`.
  - `GITHUB_OWNER` env var (default `'tuanductran'`) is the GitHub username
    whose releases/stats/top-repos populate the README.
  - `BLOG_RSS_URL` env var (default `https://tuanductran.xyz/rss.xml`).
  - Calls `fetchOwnerRepos()` once and passes the result into
    `fetchReleases()`, `fetchGithubStats()`, and `pickTopRepos()` — those
    three used to each independently re-list the owner's repos (up to three
    identical `GET /users/{owner}/repos` calls per build); fetching once and
    sharing it is this repo's one real "cache," in the sense of avoiding
    redundant work within a single build run (see "Caching" below for what
    was deliberately _not_ built).
- `src/lib/github.ts` — `fetchOwnerRepos()` (the shared repo list),
  `fetchReleases()`, `fetchGithubStats()`, `pickTopRepos()` (GitHub REST
  calls via Octokit / derived from the shared repo list), plus pure
  helpers: `normalizeReleaseTitle()`, `pickLatestPerRepo()`,
  `renderReleaseEntries()`, `renderTopRepos()`, `formatStats()`.
- `src/lib/feed.ts` — `fetchFeedEntries()` / `renderFeedEntries()` for the
  blog RSS feed, via `rss-parser`.
- `src/lib/text.ts` — pure formatting helpers shared by both: emoji
  stripping, middle-truncation, GFM table-cell escaping/rendering.
- `src/lib/octokit.ts` — `createOctokit(auth)` factory wiring up the retry
  and throttling plugins.

## Important: use username-scoped GitHub API endpoints, not "authenticated user" ones

`fetchOwnerRepos()` and `fetchGithubStats()` call `octokit.repos.listForUser({
username: owner, ... })` and `octokit.users.getByUsername({ username: owner
})` — **not** `octokit.repos.listForAuthenticatedUser()` /
`octokit.users.getAuthenticated()`.

This matters because the scheduled workflow (`.github/workflows/build.yml`)
authenticates with the default `secrets.GITHUB_TOKEN`, which is a
repo-scoped GitHub App installation token, not a real user token. GitHub
returns `403 Resource not accessible by integration` for `/user` and
`/user/repos` with that token type. Keep using the username-scoped
endpoints so this doesn't regress (it did once; see this repo's history).

## Important: a top-level fetch failure must abort the build, not degrade it

`fetchOwnerRepos()`, `fetchReleases()`, and `fetchGithubStats()` do **not**
catch and swallow a failure of their own main API call (an auth/token
problem, a network error, GitHub down) — they let it throw. Only a
_per-item_ failure inside a loop (one repo's `listReleases`, one
`extraRepos` lookup) is caught, logged, and skipped, since that doesn't
taint the rest of the run.

This is deliberate: `main()` in `src/build-readme.ts` already wraps its
`Promise.all` in nothing (no local try/catch), so a thrown error propagates
all the way up to the top-level `main().catch(...)`, which logs it and sets
a non-zero exit code — **before** `README.md` is ever written. In CI, that
fails the `bun run build` step, which stops the workflow before
`git-auto-commit-action` runs. So a broken fetch can never overwrite a good
README with a degraded one (`No recent releases.`, zeroed-out stats, an
empty repo list) — it just leaves the last known-good commit alone and
turns the workflow run red so it gets noticed. Do not add a
try/catch-and-return-fallback around these three functions' main calls; if
you need graceful degradation for some _new_ fetch, make that an explicit,
separate decision, not a silent default.

## Caching

The only caching this repo does, and the reasoning behind not doing more:

- **In-run memoization (implemented)**: `fetchOwnerRepos()` in
  `src/build-readme.ts` is called once per build and its result is shared
  across `fetchReleases()`, `fetchGithubStats()`, and `pickTopRepos()`,
  instead of each independently calling `listForUser`. This is a real,
  measurable reduction in API calls per run (was up to 3x the same request,
  now 1x).
- **CI dependency cache (implemented)**: both `build.yml` and `lint.yml`
  cache `~/.bun/install/cache` (Bun's global package cache) keyed on
  `hashFiles('bun.lockb')` via `actions/cache`, so
  `bun install --frozen-lockfile` doesn't re-download every dependency on
  every run.
- **Cross-run HTTP/ETag caching of GitHub API responses (deliberately not
  implemented)**: GitHub's REST API supports conditional requests
  (`If-None-Match` + a cached `ETag`) that return `304` without counting
  against the rate limit. This was considered and rejected for two reasons:
  (1) it's documented as unreliable for GitHub App installation-token auth
  — exactly what `secrets.GITHUB_TOKEN` is here — sometimes returning `200`
  instead of `304`; and (2) this workflow runs once a day and makes at most
  a few dozen requests, nowhere near the 5,000/hour authenticated rate
  limit, so there's no real problem this would solve. Don't add a
  persisted ETag/response cache unless the call volume actually grows
  enough to matter.

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
- Both `build.yml` and `lint.yml` cache `~/.bun/install/cache` via
  `actions/cache`, keyed on `hashFiles('bun.lockb')`, before
  `bun install --frozen-lockfile` — see "Caching" above.
- `dependency-review.yml` — on PRs: scans manifest changes for known-vulnerable
  dependency versions.
- `stale.yml` — daily cron: labels/closes stale issues and PRs.

## `.claude/` — project skills, permissions, and hooks

- `.claude/skills/` — one skill per area of this repo's stack:
  `octokit-github-api` (GitHub API/Octokit conventions — the fail-loud and
  shared-repo-list patterns above), `bun-runtime` (Bun commands, file I/O,
  CI caching), `readme-content-pipeline` (Mustache/GFM-table/RSS
  conventions), `code-style` (eslint/markdownlint conventions). These load
  automatically when relevant; each is more detailed than the summary here.
- `.claude/settings.json` — permission rules for this repo:
  - `allow`: the `package.json` scripts and low-risk local git commands
    (`add`/`commit`/`checkout -b`/`branch -m`/`fetch`) run without
    prompting.
  - `deny`: `npm`/`yarn`/`pnpm` (this repo is Bun-only, see "Bun only" in
    the `bun-runtime` skill), force-pushes, `--no-verify`, `git reset
--hard`, `git clean -f`, `rm -rf`, and reading `.env` files.
  - `ask`: `git push` and edits to `.github/workflows/**` always prompt for
    confirmation — pushing is externally visible and workflow files can
    grant CI secrets/permissions, so neither should be silently
    auto-approved even though the rest of the local git loop is.
  - `hooks.PreToolUse` runs `.claude/hooks/block-readme-edit.sh` before
    every `Edit`/`Write` call: it denies the call if the target path is
    `README.md`, with a message pointing at `README.template.md` and
    `bun run build` instead. This is the machine-enforced version of the
    "never hand-edit README.md" rule below — Bash-driven writes (i.e. the
    real build script) are untouched, since the hook only gates the
    Edit/Write tools.

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
