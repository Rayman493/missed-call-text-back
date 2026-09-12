/**
 * Behavioral DOM tests for the AI Summary safe-Markdown renderer.
 *
 * Tests the ACTUAL rendered DOM output (not source-string assertions):
 *   A. **bold** -> <strong>
 *   B. inline bold within a sentence
 *   C. bullets render cleanly
 *   D. line breaks remain readable
 *   E. malformed emphasis does not crash and produces readable text
 *   F. raw HTML (<script>) remains escaped — no script element created
 *   G. no literal paired ** markers remain around valid bold text
 *
 * Uses react-dom/server renderToStaticMarkup to verify the real DOM output.
 */

import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { renderAISummary } from '@/lib/ai-summary-markdown'

function renderToHtml(summary: string): string {
  return renderToStaticMarkup(<>{renderAISummary(summary)}</>)
}

describe('AI Summary Markdown Renderer — Behavioral DOM Tests', () => {
  it('A. **bold** renders as <strong>', () => {
    const html = renderToHtml('**Service Needed**')
    expect(html).toContain('<strong>Service Needed</strong>')
    // No literal ** markers remain around valid bold text
    expect(html).not.toContain('**')
  })

  it('B. inline bold within a sentence renders correctly', () => {
    const html = renderToHtml('The customer needs **plumbing repair** tomorrow.')
    expect(html).toContain('<strong>plumbing repair</strong>')
    expect(html).toContain('The customer needs')
    expect(html).toContain('tomorrow.')
    // No literal ** markers
    expect(html).not.toContain('**')
  })

  it('C. bullets render cleanly as <ul><li>', () => {
    const summary = `- First task\n- Second task\n- Third task`
    const html = renderToHtml(summary)
    expect(html).toContain('<ul')
    expect(html).toContain('<li')
    expect(html).toContain('First task')
    expect(html).toContain('Second task')
    expect(html).toContain('Third task')
    // No literal bullet markers
    expect(html).not.toContain('- First task')
  })

  it('C2. asterisk bullets also render as list items', () => {
    const summary = `* Item one\n* Item two`
    const html = renderToHtml(summary)
    expect(html).toContain('<ul')
    expect(html).toContain('<li')
    expect(html).toContain('Item one')
    expect(html).toContain('Item two')
  })

  it('C3. unicode bullets also render as list items', () => {
    const summary = `• Item A\n• Item B`
    const html = renderToHtml(summary)
    expect(html).toContain('<ul')
    expect(html).toContain('<li')
    expect(html).toContain('Item A')
    expect(html).toContain('Item B')
  })

  it('D. line breaks remain readable (paragraphs)', () => {
    const summary = `First paragraph.\n\nSecond paragraph.`
    const html = renderToHtml(summary)
    expect(html).toContain('First paragraph.')
    expect(html).toContain('Second paragraph.')
    // Both paragraphs should be present as separate <p> elements
    // (renderAISummary adds class="leading-relaxed" to <p> tags)
    const pCount = (html.match(/<p /g) || []).length
    expect(pCount).toBeGreaterThanOrEqual(2)
  })

  it('E. malformed emphasis does not crash and produces readable text', () => {
    // Unmatched ** on one side — should not crash, should degrade to literal
    expect(() => renderToHtml('**Next Step*')).not.toThrow()
    expect(() => renderToHtml('*Next Step**')).not.toThrow()
    expect(() => renderToHtml('Some **broken bold')).not.toThrow()

    const html1 = renderToHtml('**Next Step*')
    // Should contain the text content (degraded gracefully)
    expect(html1).toContain('Next Step')
    // Should NOT create a <strong> for malformed emphasis
    // (the unmatched ** is stripped, * remains as literal)
    // No crash, readable text produced

    const html2 = renderToHtml('*Next Step**')
    expect(html2).toContain('Next Step')
  })

  it('E2. multiple malformed markers do not crash', () => {
    expect(() => renderToHtml('**bold** and **broken')).not.toThrow()
    const html = renderToHtml('**bold** and **broken')
    // Valid bold still renders
    expect(html).toContain('<strong>bold</strong>')
    // Broken part degrades to text
    expect(html).toContain('broken')
  })

  it('F. raw HTML <script> remains escaped — no script element created', () => {
    const summary = `<script>alert('x')</script>`
    const html = renderToHtml(summary)
    // CRITICAL: no actual <script> element should be in the rendered output.
    // The literal substring "<script>" (with real angle brackets) must NOT appear.
    expect(html).not.toContain('<script>')
    // The escaped form MUST appear (React auto-escapes text to entities).
    // Rendered output contains "<script>" (HTML entities for <script>).
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('alert')
  })

  it('F2. raw HTML <div> remains escaped', () => {
    const summary = `<div onclick="evil()">content</div>`
    const html = renderToHtml(summary)
    // No actual <div> element with a real onclick attribute should be created.
    // A real <div> element would look like "<div onclick=..." with real brackets.
    // The escaped form must appear instead (entity-encoded "<div").
    expect(html).not.toMatch(/<div[^>]*onclick=/)
    expect(html).toContain('&lt;div')
    expect(html).toContain('content')
  })

  it('G. no literal paired ** markers remain around valid bold text', () => {
    const html = renderToHtml('**Service Needed**')
    // Absolutely no ** should remain in the output
    expect(html).not.toContain('**')
  })

  it('G2. mixed bold and plain text has no stray ** markers', () => {
    const summary = `**Service Needed**\n\nThe customer wants **urgent help** with this.`
    const html = renderToHtml(summary)
    expect(html).not.toContain('**')
    expect(html).toContain('<strong>Service Needed</strong>')
    expect(html).toContain('<strong>urgent help</strong>')
  })

  it('H. empty/null input returns null (no crash)', () => {
    expect(renderAISummary('')).toBeNull()
    expect(renderAISummary(null as any)).toBeNull()
    expect(renderAISummary(undefined as any)).toBeNull()
  })

  it('I. bold inside bullet items renders as <strong>', () => {
    const summary = `- **Important:** do this first\n- Regular item`
    const html = renderToHtml(summary)
    expect(html).toContain('<ul')
    expect(html).toContain('<strong>Important:</strong>')
    expect(html).toContain('do this first')
    expect(html).toContain('Regular item')
    expect(html).not.toContain('**')
  })
})
