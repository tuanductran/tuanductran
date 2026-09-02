/**
 * Pure text-formatting helpers used to build the README content blocks.
 * Ported from the original `build_readme.py` with the same behavior.
 */

import { markdownTable } from 'markdown-table'
import stringWidth from 'string-width'

const TITLE_MAX_LEN = 41

// Mirrors the Python EMOJI_RE ranges: flags, pictographs, emoticons,
// transport, alchemical, geometric/arrows/supplemental symbol blocks, plus
// misc symbols, dingbats, VS16, and ZWJ. The ranges are deliberately wide
// Unicode blocks (not typos), so the "obscure range" / "prefer character
// class" style rules are disabled for this line specifically.
const EMOJI_RE
  // eslint-disable-next-line no-misleading-character-class
  = /[\u{1F1E0}-\u{1F1FF}\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE0F}\u{200D}]+/gu

/** Strip emoji and collapse internal whitespace to single spaces. */
export function stripEmoji(text: string | null | undefined): string {
  if (!text)
    return ''
  const cleaned = text.replace(EMOJI_RE, '')
  return cleaned.replace(/\s+/g, ' ').trim()
}

/**
 * Truncate a string to `maxLen`, keeping a prefix and suffix separated by
 * an ellipsis in the middle, so long titles stay readable on both ends.
 */
export function truncateMiddle(
  text: string | null | undefined,
  maxLen: number = TITLE_MAX_LEN,
): string {
  const normalized = (text ?? '').replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLen)
    return normalized

  const ellipsis = '...'
  const keepLen = maxLen - ellipsis.length
  if (keepLen <= 1)
    return normalized.slice(0, maxLen)

  const leftLen = Math.floor((keepLen + 1) / 2)
  const rightLen = Math.floor(keepLen / 2)
  return `${normalized.slice(0, leftLen)}${ellipsis}${normalized.slice(normalized.length - rightLen)}`
}

/**
 * Escape characters that would otherwise break out of a GFM table cell:
 * `\` (escape character), `|` (column separator), and literal newlines
 * (cells must be single-line). Backslashes must be escaped *first* — if
 * `|` were escaped alone, input already containing `\|` would become
 * `\\|`, where the doubled backslash reads as one literal backslash and
 * leaves the following `|` unescaped again, defeating the whole point.
 * `markdown-table` handles column padding/alignment but, by design,
 * doesn't handle escaping — see https://github.com/wooorm/markdown-table.
 */
export function escapeTableCell(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
}

/**
 * Render a two-column GFM table, escaping `|`/`\`/newlines in every cell
 * and column-aligning by *display* width rather than UTF-16 code units —
 * plain `.length` misaligns delimiters for Vietnamese diacritics, CJK, and
 * emoji. See https://github.com/wooorm/markdown-table#optionsstringlength.
 */
export function renderTable(headers: [string, string], rows: [string, string][]): string {
  const escapedRows = rows.map(row => row.map(escapeTableCell) as [string, string])
  return markdownTable([headers, ...escapedRows], { stringLength: stringWidth })
}
