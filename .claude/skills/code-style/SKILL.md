---
name: code-style
description: Linting and doc-comment conventions for this repo — eslint (@antfu/eslint-config) and markdownlint-cli2 setup, ignored files, and comment style. Use before or after editing any .ts or .md file, or when bun run lint / bun run lint:md fails.
---

## Ignored files

`README.md` and `README.template.md` are generated/templated output, excluded from both linters:

- `eslint.config.mjs`: `ignores: ['README.md', 'README.template.md']`
- `.markdownlint-cli2.jsonc`: `README.template.md` is ignored entirely (contains `{{ mustache }}` placeholders and no top-level heading); `README.md` is linted but with `MD013`/`MD041` disabled (single long intro paragraph, no top-level heading).

Never hand-edit `README.md` — edit `README.template.md` and the `src/` generators, then run `bun run build`.

## Doc comments: explain *why*, not *what*

Match the existing style in `src/lib/text.ts` and `src/lib/octokit.ts`: a comment exists only for a non-obvious reason (a hidden constraint, a workaround, an ordering requirement), not to restate what well-named code already says. Don't add narrative comments describing what a function does line by line.

## Markdown style

Emphasis uses underscores (`_text_`), not asterisks (`*text*`) — `eslint-plugin-format`'s Prettier integration enforces this, and `bun run lint:fix` auto-corrects it. Fenced code blocks always specify a language (` ```sh `, not a bare ` ``` `).

## Before committing

Run, in order: `bun test`, `bun run typecheck`, `bun run lint`, `bun run lint:md`. All four must pass — `lint.yml` runs the same set on every push and PR.
