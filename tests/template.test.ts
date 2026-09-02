import { describe, expect, test } from 'bun:test'
import Mustache from 'mustache'

describe('README.template.md rendering', () => {
  test('replaces all four placeholders and leaves no braces behind', async () => {
    const template = await Bun.file(new URL('../README.template.md', import.meta.url)).text()

    Mustache.escape = (text: string) => text
    const rendered = Mustache.render(template, {
      github_stats: '1,234 followers, 56 stars, 7 forks',
      recent_releases: '• [repo v1.0.0](https://example.com) - 2026-01-01',
      top_repos: '• [repo](https://example.com) - 42 stars',
      recent_posts: '• [A post](https://example.com/post) - 2026-01-01',
    })

    expect(rendered).toContain('1,234 followers, 56 stars, 7 forks')
    expect(rendered).toContain('[repo v1.0.0](https://example.com)')
    expect(rendered).toContain('42 stars')
    expect(rendered).toContain('[A post](https://example.com/post)')
    expect(rendered).not.toContain('{{')
    expect(rendered).not.toContain('}}')
  })

  test('does not HTML-escape markdown-significant characters', async () => {
    const template = await Bun.file(new URL('../README.template.md', import.meta.url)).text()

    Mustache.escape = (text: string) => text
    const rendered = Mustache.render(template, {
      github_stats: 'Bun & TypeScript "quotes"',
      recent_releases: 'x',
      top_repos: 'x',
      recent_posts: 'x',
    })

    expect(rendered).toContain('Bun & TypeScript "quotes"')
    expect(rendered).not.toContain('&amp;')
    expect(rendered).not.toContain('&quot;')
  })

  test('the template itself has no leftover HTML-comment markers', async () => {
    const template = await Bun.file(new URL('../README.template.md', import.meta.url)).text()
    expect(template).not.toContain('<!--')
  })

  test('the template uses plain markdown, not an HTML table, for the two content blocks', async () => {
    const template = await Bun.file(new URL('../README.template.md', import.meta.url)).text()
    expect(template).not.toContain('<table')
    expect(template).not.toContain('<td')
    expect(template).not.toContain('<tr')
  })
})
