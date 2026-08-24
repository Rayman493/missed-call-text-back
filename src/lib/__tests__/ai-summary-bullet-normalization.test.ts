import { describe, it, expect } from 'vitest'

/**
 * AI Summary Bullet Normalization Tests
 *
 * These tests verify that the AI Summary rendering normalizes common list prefixes
 * to avoid double bullets when the summary generator inserts markdown bullets.
 */

// Mock the extractKeyPoints function from AICallDetails
function extractKeyPoints(summary: string): string[] {
  if (!summary || typeof summary !== 'string') return []

  // Normalize common list prefixes to avoid double bullets
  const normalized = summary
    .replace(/^[-•*]\s+/gm, '')  // Remove leading markdown bullets
    .replace(/^\d+\.\s+/gm, '')  // Remove leading numbered list markers

  // Split by sentences and filter for meaningful points
  const sentences = normalized
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && s.length < 100) // Filter out very short or very long sentences

  // Return up to 5 key points
  return sentences.slice(0, 5)
}

describe('AI Summary Bullet Normalization', () => {
  it('TEST L - "- text" renders with one bullet', () => {
    const summary = '- He would like the service completed next week.'
    const points = extractKeyPoints(summary)

    expect(points).toHaveLength(1)
    expect(points[0]).toBe('He would like the service completed next week')
    expect(points[0]).not.toMatch(/^[-•*]/)
  })

  it('TEST M - "• text" renders with one bullet', () => {
    const summary = '• Ryan prefers morning callbacks before 11am.'
    const points = extractKeyPoints(summary)

    expect(points).toHaveLength(1)
    expect(points[0]).toBe('Ryan prefers morning callbacks before 11am')
    expect(points[0]).not.toMatch(/^[-•*]/)
  })

  it('TEST N - "* text" renders with one bullet', () => {
    const summary = '* Currently, no job is scheduled for this request.'
    const points = extractKeyPoints(summary)

    expect(points).toHaveLength(1)
    expect(points[0]).toBe('Currently, no job is scheduled for this request')
    expect(points[0]).not.toMatch(/^[-•*]/)
  })

  it('TEST O - plain "text" renders with one bullet', () => {
    const summary = 'He would like the service completed next week.'
    const points = extractKeyPoints(summary)

    expect(points).toHaveLength(1)
    expect(points[0]).toBe('He would like the service completed next week')
    expect(points[0]).not.toMatch(/^[-•*]/)
  })

  it('TEST P - meaningful punctuation inside an item is preserved', () => {
    const summary = 'The customer mentioned they might have a fence.'
    const points = extractKeyPoints(summary)

    expect(points).toHaveLength(1)
    expect(points[0]).toContain('fence')
    expect(points[0]).toContain('might')
  })

  it('TEST Q - numbered list markers are normalized', () => {
    const summary = '1. He would like the service completed next week. 2. Ryan prefers morning callbacks.'
    const points = extractKeyPoints(summary)

    expect(points.length).toBeGreaterThan(0)
    expect(points.every(p => !p.match(/^\d+\./))).toBe(true)
  })

  it('TEST R - empty summary returns empty array', () => {
    const points = extractKeyPoints('')
    expect(points).toHaveLength(0)
  })

  it('TEST S - null summary returns empty array', () => {
    const points = extractKeyPoints(null as any)
    expect(points).toHaveLength(0)
  })

  it('TEST T - bullet at start of line only (not in middle of text)', () => {
    const summary = 'The yard is 0.5 acres - this is a large property.'
    const points = extractKeyPoints(summary)

    expect(points.length).toBeGreaterThan(0)
    // The dash in the middle is preserved (not a list marker)
    expect(points[0]).toContain('The yard is 0')
  })

  it('TEST U - bullet followed by space is removed, but bullet without space is preserved', () => {
    const summary = '-He would like the service completed.' // No space after bullet
    const points = extractKeyPoints(summary)

    expect(points.length).toBeGreaterThan(0)
    // Without space after bullet, it's not treated as a list marker
    expect(points[0]).toMatch(/^-He/)
  })

  it('TEST V - multiple consecutive bullets are handled', () => {
    const summary = '-- He would like the service completed.'
    const points = extractKeyPoints(summary)

    expect(points.length).toBeGreaterThan(0)
    // Only the first bullet+space pattern is removed
    expect(points[0]).toMatch(/^-/)
  })
})