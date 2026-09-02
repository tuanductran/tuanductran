---
name: bun-runtime
description: Bun-specific conventions for this repo — package manager enforcement, running scripts, the test runner, and CI caching. Use when running or adding install/test/build commands, writing file I/O in src/, or touching .github/workflows/build.yml or lint.yml.
---

## Bun only — never npm/yarn/pnpm

`packageManager: bun@1.4.0` in `package.json`, and `preinstall` runs `bunx only-allow bun`, which fails the install if invoked through another package manager. Always use `bun install`, `bun run <script>`, `bun test`, `bunx <tool>`.

## Commands (from package.json)

- `bun run build` — regenerate `README.md` from `README.template.md` (runs `src/build-readme.ts`)
- `bun test` — run `tests/*.test.ts` with Bun's built-in test runner (not Jest/Vitest)
- `bun run typecheck` — `tsc --noEmit`
- `bun run lint` / `bun run lint:fix` — `eslint .`
- `bun run lint:md` / `bun run lint:md:fix` — `markdownlint-cli2`

## File I/O

Use `Bun.file(url).text()` / `Bun.write(url, content)` for reading/writing `README.md` and `README.template.md` (see `src/build-readme.ts`) — not `node:fs`. This repo is Bun-only end to end; there is no Node.js fallback path.

## CI caching

`build.yml` and `lint.yml` cache `~/.bun/install/cache` (Bun's global package cache) via `actions/cache`, keyed on `hashFiles('bun.lockb')`, placed after "Setup Bun" and before "Install Dependencies". Keep this step when editing either workflow's install sequence — it's what keeps `bun install --frozen-lockfile` fast across runs.

## Bun 1.4 notes

This repo pins Bun 1.4, a from-scratch Rust rewrite of the runtime (previously Zig): a large Node.js-compat jump, ~5x lower idle CPU, ~35% lower memory, and ~50% faster startup on Linux. Its test runner supports `--grep`, `--shard`/`--changed` for CI sharding, and `Symbol.dispose` on `mock()`/`spyOn()` — not currently used by this repo's small test suite, but available if it grows.
