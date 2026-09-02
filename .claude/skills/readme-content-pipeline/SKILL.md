---
name: readme-content-pipeline
description: How README.md's content sections are fetched, formatted, and rendered — Mustache templating, GFM table rendering, and the blog RSS feed. Use when adding or editing a README section, changing table output, or working in README.template.md, src/lib/text.ts, or src/lib/feed.ts.
---

## Pipeline shape

`src/build-readme.ts` fetches data (Octokit + `rss-parser`), formats each section as a markdown string, and renders `README.template.md` through Mustache. Every section follows the same three-piece shape as a model:

- a `fetch*`/`pick*` function that returns typed data (`fetchReleases`, `pickTopRepos`, `fetchFeedEntries`, ...)
- a `render*` function that turns that data into a markdown string, with a plain-English fallback for an empty list (`'No recent releases.'`, `'No repositories yet.'`, `'No recent posts.'`)
- a `{{ placeholder }}` in `README.template.md` that Mustache substitutes

To add a new section: write the fetch/pick + render pair in `src/lib/`, add the placeholder to the template between the right headings, pass it into the `Mustache.render()` call in `src/build-readme.ts`, and update `tests/template.test.ts`'s two placeholder-substitution tests to include the new key.

## Mustache: HTML-escaping is disabled

`Mustache.escape = (text) => text` in `src/build-readme.ts`, because the output is Markdown, not HTML — Mustache's default escaping would corrupt `&`, `<`, `>`, or quotes in release/post titles. Don't remove this.

## GFM tables: use `renderTable`, not hand-rolled markdown

`renderTable(headers: [string, string], rows: [string, string][])` in `src/lib/text.ts` wraps `markdown-table`, column-aligning by **display width** via `string-width` (not `.length`) so Vietnamese diacritics, CJK, and emoji don't misalign the `|` delimiters. It also escapes `\`, `|`, and newlines in every cell via `escapeTableCell` — backslashes are escaped first, then pipes; that order matters (see the comment in `text.ts`). Always build new tabular sections through this helper.

## Blog feed

`fetchFeedEntries(url, limit)` in `src/lib/feed.ts` wraps `rss-parser`, normalizes dates via `parseEntryDate` (ISO-first, falls back to `pubDate`, empty string if unparseable), and truncates long titles with `truncateMiddle`. Unlike the Octokit fetches, a broken feed fetch is caught and returns `[]` rather than throwing — a bad blog feed degrading to "no posts" is an acceptable, low-stakes fallback (unlike GitHub API failures — see the `octokit-github-api` skill).
