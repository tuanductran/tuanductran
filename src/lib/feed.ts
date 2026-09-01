import Parser from 'rss-parser'

import { truncateMiddle } from './text'

export interface FeedEntry {
  title: string
  url: string
  published: string
}

const parser = new Parser({
  timeout: 10_000,
  headers: { 'User-Agent': 'readme-builder/1.0 (+https://github.com)' },
})

/**
 * Normalize a feed item's date-ish fields down to `YYYY-MM-DD`.
 * Mirrors the fallback chain in the Python `parse_entry_date`.
 */
export function parseEntryDate(item: {
  isoDate?: string
  pubDate?: string
}): string {
  const raw = item.isoDate ?? item.pubDate ?? ''
  if (!raw)
    return ''

  const isoMatch = raw.match(/\d{4}-\d{2}-\d{2}/)
  if (isoMatch)
    return isoMatch[0]

  const parsed = new Date(raw)
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10)
  }

  return ''
}

/**
 * Fetch and normalize a feed's entries. Any network or parse failure is
 * swallowed and results in an empty list, so one broken feed never breaks
 * the whole README build.
 */
export async function fetchFeedEntries(
  url: string,
  limit = 10,
): Promise<FeedEntry[]> {
  try {
    const feed = await parser.parseURL(url)
    const entries: FeedEntry[] = []

    for (const item of feed.items) {
      const title = truncateMiddle(item.title ?? '')
      const link = (item.link ?? '').split('#')[0]
      const published = parseEntryDate(item)
      if (!title || !link || !published)
        continue

      entries.push({ title, url: link, published })
      if (entries.length >= limit)
        break
    }

    return entries
  }
  catch (error) {
    console.error(`Error fetching feed ${url}:`, error)
    return []
  }
}

/** Render feed entries as the `• [title](url) - published` bullet list. */
export function renderFeedEntries(entries: FeedEntry[]): string {
  return entries
    .map(e => `• [${e.title}](${e.url}) - ${e.published}`)
    .join('<br>')
}
