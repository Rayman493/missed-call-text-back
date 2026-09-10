import { describe, it, expect } from 'vitest'

/**
 * Regression tests for Batch 4 — Dashboard Interactions + Personal Voicemail
 *
 * Covers:
 * - ChartTouchWrapper uses canonical gesture guard (both X/Y, 10px threshold)
 * - No setTimeout in ChartTouchWrapper
 * - Bar charts have cursor={false} on Tooltip
 * - Recharts focus rectangle suppressed via CSS
 * - Personal Voicemail "Personal Contacts" link always rendered
 */

const fs = require('fs')

function readContent(path: string): string {
  return fs.readFileSync(path, 'utf8')
}

describe('Batch 4 — ChartTouchWrapper Canonical Gesture Guard', () => {
  it('uses 10px threshold (matching lead-status-gesture.ts)', () => {
    const content = readContent('src/lib/chart-utils.tsx')
    expect(content).toContain('CHART_GESTURE_THRESHOLD = 10')
  })

  it('tracks both X and Y movement (not just Y)', () => {
    const content = readContent('src/lib/chart-utils.tsx')
    expect(content).toContain('startXRef')
    expect(content).toContain('startYRef')
    expect(content).toContain('deltaX')
    expect(content).toContain('deltaY')
    // Should check both axes
    expect(content).toContain('deltaX > CHART_GESTURE_THRESHOLD || deltaY > CHART_GESTURE_THRESHOLD')
  })

  it('does NOT use setTimeout', () => {
    const content = readContent('src/lib/chart-utils.tsx')
    // Filter out both // and * comment lines
    const codeLines = content.split('\n').filter(line => {
      const trimmed = line.trim()
      return !trimmed.startsWith('//') && !trimmed.startsWith('*')
    })
    const codeWithoutComments = codeLines.join('\n')
    expect(codeWithoutComments).not.toContain('setTimeout')
  })

  it('does NOT use requestAnimationFrame', () => {
    const content = readContent('src/lib/chart-utils.tsx')
    const codeLines = content.split('\n').filter(line => {
      const trimmed = line.trim()
      return !trimmed.startsWith('//') && !trimmed.startsWith('*')
    })
    const codeWithoutComments = codeLines.join('\n')
    expect(codeWithoutComments).not.toContain('requestAnimationFrame')
  })

  it('uses pan-y pan-x touch-action (both axes scroll)', () => {
    const content = readContent('src/lib/chart-utils.tsx')
    expect(content).toContain("touchAction: 'pan-y pan-x'")
  })

  it('suppresses chart pointer events only during active drag (not scroll)', () => {
    const content = readContent('src/lib/chart-utils.tsx')
    expect(content).toContain('isDragging')
    expect(content).toContain("pointerEvents: isDragging ? 'none' : 'auto'")
  })

  it('resets drag state synchronously on touch end (no delay)', () => {
    const content = readContent('src/lib/chart-utils.tsx')
    expect(content).toContain('handleTouchEnd')
    // Extract just the handleTouchEnd function body and filter comments
    const funcStart = content.indexOf('const handleTouchEnd')
    const funcEnd = content.indexOf('\n  }', funcStart)
    if (funcStart !== -1 && funcEnd !== -1) {
      const handlerBody = content.substring(funcStart, funcEnd)
      const codeLines = handlerBody.split('\n').filter(line => {
        const trimmed = line.trim()
        return !trimmed.startsWith('//') && !trimmed.startsWith('*')
      })
      const codeBody = codeLines.join('\n')
      expect(codeBody).not.toContain('setTimeout')
      expect(codeBody).not.toContain('requestAnimationFrame')
    }
  })
})

describe('Batch 4 — Bar Chart Selection (No Giant Rectangle)', () => {
  it('NewCustomersGraph has cursor={false} on Tooltip', () => {
    const content = readContent('src/components/analytics/NewCustomersGraph.tsx')
    expect(content).toContain('cursor={false}')
  })

  it('CustomerPipelineGraph has cursor={false} on Tooltip', () => {
    const content = readContent('src/components/analytics/CustomerPipelineGraph.tsx')
    expect(content).toContain('cursor={false}')
  })

  it('CustomersStatusGraph has cursor={false} on Tooltip', () => {
    const content = readContent('src/components/analytics/CustomersStatusGraph.tsx')
    expect(content).toContain('cursor={false}')
  })

  it('globals.css suppresses Recharts surface/wrapper focus outline', () => {
    const content = readContent('src/app/globals.css')
    expect(content).toContain('.recharts-surface:focus')
    expect(content).toContain('.recharts-wrapper:focus')
    expect(content).toContain('.recharts-cursor')
    expect(content).toContain('outline: none')
  })

  it('globals.css preserves focus-visible on individual data elements', () => {
    const content = readContent('src/app/globals.css')
    expect(content).toContain('.recharts-bar-rectangle:focus-visible')
    expect(content).toContain('.recharts-pie-sector:focus-visible')
    expect(content).toContain('.recharts-line-dot:focus-visible')
    expect(content).toContain('outline: 2px solid')
  })
})

describe('Batch 4 — Personal Voicemail Link', () => {
  it('always renders Personal Contacts as a Link (no conditional plain text)', () => {
    const content = readContent('src/app/dashboard/personal-voicemail/page.tsx')
    // The link should always be present, not conditional on contacts.length
    expect(content).toContain('href="/dashboard/settings#contacts"')
    expect(content).toContain('Personal Contacts')
    // Should NOT have the old conditional that removed the link
    expect(content).not.toContain("contacts.length === 0 ? (")
  })

  it('does not render duplicate link (only one Personal Contacts link)', () => {
    const content = readContent('src/app/dashboard/personal-voicemail/page.tsx')
    // Count occurrences of the link href in the explanatory text
    const linkMatches = content.match(/href="\/dashboard\/settings#contacts"/g)
    // There should be at most 2: one in the header text, one in the empty-state CTA
    // But the header text should always have exactly one link
    expect(linkMatches).toBeTruthy()
    if (linkMatches) {
      expect(linkMatches.length).toBeGreaterThanOrEqual(1)
      expect(linkMatches.length).toBeLessThanOrEqual(2)
    }
  })

  it('destination unchanged (/dashboard/settings#contacts)', () => {
    const content = readContent('src/app/dashboard/personal-voicemail/page.tsx')
    expect(content).toContain('/dashboard/settings#contacts')
  })

  it('uses semantic accessible Link component (not plain anchor)', () => {
    const content = readContent('src/app/dashboard/personal-voicemail/page.tsx')
    // Should import Link from next/link
    expect(content).toMatch(/import.*Link.*from.*['"]next\/link['"]/)
  })
})

describe('Batch 4 — Desktop/Accessibility Preservation', () => {
  it('line charts preserve activeDot for tap selection', () => {
    const revenueContent = readContent('src/components/analytics/RevenueGraph.tsx')
    expect(revenueContent).toContain('activeDot')

    const activityContent = readContent('src/components/analytics/BusinessActivityGraph.tsx')
    expect(activityContent).toContain('activeDot')
  })

  it('tooltips are disabled only on touch devices (preserved on desktop)', () => {
    const revenueContent = readContent('src/components/analytics/RevenueGraph.tsx')
    expect(revenueContent).toContain('!isTouchDevice')

    const newCustomersContent = readContent('src/components/analytics/NewCustomersGraph.tsx')
    expect(newCustomersContent).toContain('!isTouchDevice')
  })

  it('donut charts preserve onClick segment selection', () => {
    const paymentContent = readContent('src/components/analytics/PaymentCollectionGraph.tsx')
    expect(paymentContent).toContain('onClick')

    const leadsContent = readContent('src/components/analytics/LeadsSourceGraph.tsx')
    expect(leadsContent).toContain('onClick')
  })

  it('BusinessActivityGraph legend buttons preserve focus-visible ring', () => {
    const content = readContent('src/components/analytics/BusinessActivityGraph.tsx')
    expect(content).toContain('focus-visible:ring-2')
  })
})

describe('Batch 4 — Business Logic Unchanged', () => {
  it('all 7 chart components still use ChartTouchWrapper', () => {
    const charts = [
      'src/components/analytics/RevenueGraph.tsx',
      'src/components/analytics/BusinessActivityGraph.tsx',
      'src/components/analytics/NewCustomersGraph.tsx',
      'src/components/analytics/CustomerPipelineGraph.tsx',
      'src/components/analytics/CustomersStatusGraph.tsx',
      'src/components/analytics/PaymentCollectionGraph.tsx',
      'src/components/analytics/LeadsSourceGraph.tsx',
    ]
    for (const path of charts) {
      const content = readContent(path)
      expect(content).toContain('ChartTouchWrapper')
    }
  })

  it('Personal Voicemail still fetches contacts and voicemails', () => {
    const content = readContent('src/app/dashboard/personal-voicemail/page.tsx')
    expect(content).toContain('fetchContacts')
    expect(content).toContain('fetchVoicemails')
  })

  it('Personal Voicemail polling behavior preserved', () => {
    const content = readContent('src/app/dashboard/personal-voicemail/page.tsx')
    expect(content).toContain('setInterval')
    expect(content).toContain('pollTimer')
  })
})
