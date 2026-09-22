import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const attachmentsCard = readFileSync('src/components/CustomerAttachmentsCard.tsx', 'utf8')
const chart = readFileSync('src/components/analytics/BusinessActivityGraph.tsx', 'utf8')
const sheet = readFileSync('src/components/conversation/AttachmentActionSheet.tsx', 'utf8')
const activity = readFileSync('src/components/RecentActivityCard.tsx', 'utf8')
const aiCallDetails = readFileSync('src/components/AICallDetails.tsx', 'utf8')

const slice = (src: string, from: string, to: string) => {
  const a = src.indexOf(from)
  const b = src.indexOf(to, a + from.length)
  return a === -1 || b === -1 ? '' : src.slice(a, b)
}

describe('A — PDF/document attachment tiles are openable', () => {
  it('non-image tiles render as anchors, not inert divs', () => {
    const branch = slice(attachmentsCard, 'if (!isImage(media.mime_type))', 'if (hasFailed)')
    expect(branch).toContain('<a')
    expect(branch).toContain('href={displayUrl || undefined}')
    expect(branch).toContain('target="_blank"')
    expect(branch).toContain('aria-label={`Open ${typeLabel} attachment`}')
    expect(branch).not.toContain('<div\n')
  })

  it('document open reuses the canonical signed-URL recover + Browser.open flow', () => {
    const handler = slice(attachmentsCard, 'const handleDocumentOpen', 'handleImageError = (displayUrl')
    expect(handler).toContain('/api/mms-media/recover-url?url=')
    expect(handler).toContain("media.media_url.includes('/api/mms-media/serve')")
    expect(handler).toContain("await import('@capacitor/browser')")
    expect(handler).toContain('Browser.open({ url: openUrl })')
  })

  it('native path stays authorization-safe and only intercepts signed serve URLs', () => {
    const handler = slice(attachmentsCard, 'const handleDocumentOpen', 'handleImageError = (displayUrl')
    expect(handler).toContain('Bearer ${session.access_token}')
    expect(handler).toContain('if (!Capacitor.isNativePlatform()) return')
  })

  it('open failure surfaces a visible error, not a silent dead tile', () => {
    expect(attachmentsCard).toContain("showToast(\"Couldn't open the attachment. Please try again.\", 'error')")
  })

  it('image lightbox path is preserved unchanged', () => {
    expect(attachmentsCard).toContain('setExpandedImage(getDisplayUrl(media))')
    expect(attachmentsCard).toContain("useModalBackButton({ isOpen: !!expandedImage")
    expect(attachmentsCard).toContain("useBodyScrollLock(!!expandedImage")
  })

  it('authenticated blob resolution and 401 recovery are preserved', () => {
    expect(attachmentsCard).toContain('recoveryAttemptedRef')
    expect(attachmentsCard).toContain('/api/mms-media/recover-url')
    expect(attachmentsCard).toContain('URL.createObjectURL(blob)')
  })
})

describe('B — engagement chart tooltip shows values', () => {
  it('exact-hit payload keeps the tapped series including honest zero', () => {
    const handler = slice(chart, 'const toggleDatum', 'const handleChartAreaClick')
    expect(handler).toContain('data[idx][seriesKey as keyof ActivityData]')
    // Exact hit does NOT filter out 0 — the user tapped a visible point
    const exact = slice(handler, 'const payload = seriesKey', ': visibleKeys')
    expect(exact).not.toContain('value > 0')
  })

  it('nearest-x fallback filters to nonzero series only', () => {
    const handler = slice(chart, 'const toggleDatum', 'const handleChartAreaClick')
    expect(handler).toContain(".filter((entry) => typeof entry.value === 'number' && entry.value > 0)")
  })

  it('a date with no nonzero values never opens a date-only popup', () => {
    const handler = slice(chart, 'const toggleDatum', 'const handleChartAreaClick')
    expect(handler).toContain('if (!seriesKey && payload.length === 0)')
    expect(handler).toContain('setSelectedDatum(null)')
  })

  it('renderer no longer re-filters zeros out of the curated payload', () => {
    const popup = slice(chart, 'selectedDatum.payload', 'Dismiss')
    expect(popup).toContain("typeof entry.value === 'number'")
    expect(popup).not.toContain('entry.value > 0')
  })

  it('series colors and labels come from the canonical maps', () => {
    const popup = slice(chart, 'selectedDatum.payload', 'Dismiss')
    expect(popup).toContain('SERIES_LABELS[key]')
    expect(popup).toContain('backgroundColor: entry.color')
  })

  it('dismissal paths (outside tap, ×, whitespace tolerance) preserved', () => {
    expect(chart).toContain("document.addEventListener('pointerdown', handlePointerDown)")
    expect(chart).toContain('setSelectedDatum(null)')
    expect(chart).toContain('CHART_STYLES.tapHitTolerance')
    expect(chart).toContain('aria-label="Dismiss"')
  })
})

describe('C — attachment sheet polish preserves behavior', () => {
  it('still exposes exactly the three existing picker actions', () => {
    expect(sheet).toContain('onClick={handleTakePhoto}')
    expect(sheet).toContain('onClick={handleChoosePhoto}')
    expect(sheet).toContain('onClick={handleChooseFile}')
    expect(sheet).toContain('Take Photo')
    expect(sheet).toContain('Choose Photo')
    expect(sheet).toContain('Choose File')
  })

  it('title and X share one aligned header row', () => {
    const header = slice(sheet, '{/* Title row', '{/* Compact muted limits block */}')
    expect(header).toContain('flex items-center justify-between')
    expect(header).toContain('text-sm font-semibold text-foreground')
    expect(header).toContain('aria-label="Close attachment options"')
    expect(header).not.toContain('-my-1.5')
  })

  it('file limits render in a compact muted block', () => {
    expect(sheet).toContain('rounded-lg bg-muted/40 px-3 py-2')
    expect(sheet).toContain('attachmentLimitLines()')
  })

  it('action rows are equal-height full-width targets with uniform icon wells', () => {
    const rows = slice(sheet, 'space-y-1', '</Modal')
    expect(rows.match(/h-14 rounded-xl/g)?.length).toBe(3)
    expect(rows.match(/w-10 h-10 rounded-full bg-muted text-foreground/g)?.length).toBe(3)
  })

  it('picker/permission/upload plumbing untouched', () => {
    expect(sheet).toContain('CapacitorCamera.takePhoto')
    expect(sheet).toContain('capture="environment"')
    expect(sheet).toContain('accept={fileAccept}')
    expect(sheet).toContain('onPickerLaunch()')
    expect(sheet).toContain('onPickerReturnRef.current')
    expect(sheet).toContain('bottomSheetOnMobile')
  })
})

describe('D — activity row alignment', () => {
  it('linked and non-linked rows share the same icon/text axis', () => {
    // Slice to EOF — avoids a \r\n-sensitive end anchor.
    const a = activity.indexOf('activities.slice(0, 6).map')
    const list = a === -1 ? '' : activity.slice(a)
    // Both variants apply -mx-2 so px-2 content starts at the same x
    expect(list).toContain('-mx-2 px-2 rounded-lg transition-colors')
    expect(list).toContain('`${baseClasses} -mx-2`')
    // Shared icon box unchanged
    expect(list.match(/w-9 h-9 rounded-lg/g)?.length).toBe(2)
    expect(list.match(/flex items-start gap-3 py-2 px-2/g)?.length).toBe(1)
  })
})

describe('E — Customer Context request icon is neutral', () => {
  it('Request title icon well uses muted background/foreground', () => {
    const card = slice(aiCallDetails, 'Concise Request Title', 'Request Details - Combined')
    expect(card).toContain('bg-muted flex items-center justify-center')
    expect(card).toContain('text-muted-foreground')
    expect(card).not.toContain('text-blue-600')
    expect(card).not.toContain('bg-blue-500/10')
  })
})
