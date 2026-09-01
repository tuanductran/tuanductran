import antfu from '@antfu/eslint-config'

export default antfu(
  {
    formatters: true,
    // README.md is generated output (see src/build-readme.ts) and
    // README.template.md contains {{ mustache }} placeholders — neither
    // should be reformatted or linted by eslint. markdownlint-cli2 covers
    // README.md separately (see `bun run lint:md`).
    ignores: ['README.md', 'README.template.md'],
  },
)
