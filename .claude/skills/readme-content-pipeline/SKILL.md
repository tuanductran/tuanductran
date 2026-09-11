---
name: readme-content-pipeline
description: How README.md's content is fetched, formatted, and rendered — Mustache templating for the GitHub stats line. Use when editing README.template.md or the github_stats rendering in src/build-readme.ts / src/lib/github.ts.
---

## Pipeline shape

`src/build-readme.ts` fetches the owner's repo list and stats via Octokit, formats them as one string with `formatStats()`, and renders `README.template.md` through Mustache. The pipeline is intentionally minimal: one `{{ github_stats }}` placeholder, no fallback string needed since `fetchGithubStats` throws rather than degrading (see the `octokit-github-api` skill).

To add a new section: write a `fetch*`/`pick*` + `render*` (or `format*`) pair in `src/lib/`, add the placeholder to `README.template.md`, pass it into the `Mustache.render()` call in `src/build-readme.ts`, and update `tests/template.test.ts`'s placeholder-substitution tests to include the new key.

## Mustache: HTML-escaping is disabled

`Mustache.escape = (text) => text` in `src/build-readme.ts`, because the output is Markdown, not HTML — Mustache's default escaping would corrupt `&`, `<`, `>`, or quotes if they ever showed up in the stats line. Don't remove this.

## What used to live here

This skill previously also covered GFM table rendering (`src/lib/text.ts`'s `renderTable`/`escapeTableCell`, used by the render-table for GFM tables) and the blog RSS feed (`src/lib/feed.ts`'s `fetchFeedEntries`/`renderFeedEntries`, via `rss-parser`), backing the "Latest Releases", "Top Repositories", and "Recent Posts" sections. Those sections, `src/lib/text.ts`, `src/lib/feed.ts`, and the `markdown-table`/`string-width`/`rss-parser` dependencies were all removed — the README now only has the intro paragraph, social badges, and the stats line. Don't reintroduce a GFM-table helper or a feed fetcher without an explicit request to bring one of those sections back.
