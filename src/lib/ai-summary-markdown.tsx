import React from 'react'

/**
 * Narrowly scoped Markdown-to-React-node renderer for AI Summary display.
 *
 * Supported syntax (SAFE subset only):
 *   **text**  → <strong>text</strong>
 *   - item / * item / • item  → bullet list items
 *   line breaks / paragraphs  → preserved sensibly
 *
 * Safety:
 *   - NO dangerouslySetInnerHTML — renders React nodes directly
 *   - Raw HTML (<script>, <div>, etc.) remains escaped/plain text
 *     because React escapes text content by default
 *   - Malformed emphasis (unmatched **) degrades to literal text
 *   - Never generates an HTML string
 *
 * This is intentionally minimal — not a general-purpose Markdown renderer.
 */

/**
 * Parse a single text segment, converting matched **bold** spans to
 * <strong> React elements. Unmatched/malformed ** markers are kept as
 * literal text so the UI never shows broken formatting.
 *
 * Returns an array of React nodes (strings and <strong> elements).
 */
function renderBoldSpans(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  // Match paired **...** (non-greedy, at least 1 char, no newline inside)
  const regex = /\*\*([^*]+?)\*\*/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let keyIndex = 0

  while ((match = regex.exec(text)) !== null) {
    // Push preceding plain text (if any)
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }
    // Push the bold span as a <strong> element
    nodes.push(
      <strong key={`${keyPrefix}-b-${keyIndex++}`}>{match[1]}</strong>
    )
    lastIndex = match.index + match[0].length
  }

  // Push remaining plain text (if any)
  if (lastIndex < text.length) {
    // Strip any stray ** that weren't part of a matched pair (malformed emphasis)
    const remaining = text.slice(lastIndex).replace(/\*\*/g, '')
    if (remaining.length > 0) {
      nodes.push(remaining)
    }
  }

  // If no matches at all, strip stray ** from the whole text and return as single node
  if (nodes.length === 0) {
    const cleaned = text.replace(/\*\*/g, '')
    if (cleaned.length > 0) return [cleaned]
    return []
  }

  return nodes
}

/**
 * Detect whether a line is a bullet item.
 * Returns the bullet-stripped content, or null if not a bullet.
 */
function stripBullet(line: string): string | null {
  const match = line.match(/^[-•*]\s+(.+)$/)
  if (match) return match[1].trim()
  // Numbered list: "1. text"
  const numMatch = line.match(/^\d+\.\s+(.+)$/)
  if (numMatch) return numMatch[1].trim()
  return null
}

/**
 * Render an AI summary string as a React node tree.
 *
 * - Lines starting with -, *, •, or "N." become bullet list items
 * - Other lines become paragraphs
 * - **bold** spans become <strong> elements
 * - Raw HTML remains escaped (React text nodes are auto-escaped)
 * - Malformed emphasis degrades to literal text
 */
export function renderAISummary(summary: string): React.ReactNode {
  if (!summary || typeof summary !== 'string') return null

  const lines = summary.split('\n').map((l) => l.trim())
  const blocks: React.ReactNode[] = []
  let bulletItems: React.ReactNode[] = []
  let paragraphBuffer: string[] = []
  let keyIndex = 0

  const flushParagraph = () => {
    if (paragraphBuffer.length > 0) {
      const text = paragraphBuffer.join(' ').trim()
      if (text.length > 0) {
        blocks.push(
          <p key={`p-${keyIndex++}`} className="leading-relaxed">
            {renderBoldSpans(text, `p-${keyIndex}`)}
          </p>
        )
      }
      paragraphBuffer = []
    }
  }

  const flushBullets = () => {
    if (bulletItems.length > 0) {
      blocks.push(
        <ul key={`ul-${keyIndex++}`} className="space-y-1.5">
          {bulletItems}
        </ul>
      )
      bulletItems = []
    }
  }

  for (const line of lines) {
    if (line.length === 0) {
      // Blank line — flush current buffers
      flushBullets()
      flushParagraph()
      continue
    }

    const bulletContent = stripBullet(line)
    if (bulletContent !== null) {
      // This line is a bullet — flush any pending paragraph first
      flushParagraph()
      bulletItems.push(
        <li key={`li-${keyIndex++}`} className="flex items-start gap-2 leading-relaxed">
          <span className="text-muted-foreground/70 mt-0.5 flex-shrink-0">•</span>
          <span className="flex-1">{renderBoldSpans(bulletContent, `li-${keyIndex}`)}</span>
        </li>
      )
    } else {
      // Regular text line — flush any pending bullets first
      flushBullets()
      paragraphBuffer.push(line)
    }
  }

  // Flush remaining buffers
  flushBullets()
  flushParagraph()

  if (blocks.length === 0) return null
  if (blocks.length === 1) return blocks[0]
  return <div className="space-y-2">{blocks}</div>
}
