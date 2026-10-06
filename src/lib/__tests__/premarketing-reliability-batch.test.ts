import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

/**
 * Pre-marketing reliability + cognitive-friction batch regressions:
 *  1. New Job: End Time is never auto-derived from Start Time.
 *  2. Composer attachments: images preview via FileReader data-URL,
 *     non-images get a file card, failures fall back (no broken-image UI).
 *  3. Mobile conversation card height is defensively bounded.
 *  4. Light-mode conversation metadata uses readable slate tokens.
 *  5. Customer detail header shows no full Reason-for-Calling text.
 *  6. Settings chevron affordances sit slightly inward from the edge.
 *  7. Conversation images don't flash/reload on refresh (stable identity,
 *     skip-resolved, no hard-error flash during in-flight re-resolution).
 */

const jobComposer = readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
const pageClient = readFileSync('src/app/dashboard/leads/[id]/page-client.tsx', 'utf8')
const thumb = readFileSync('src/components/conversation/AttachmentPreviewThumb.tsx', 'utf8')
const mobileList = readFileSync('src/components/MobileConversationMessageList.tsx', 'utf8')
const desktopList = readFileSync('src/components/DesktopConversationMessageList.tsx', 'utf8')
const settings = readFileSync('src/components/SettingsContent.tsx', 'utf8')
const mediaRenderer = readFileSync('src/components/MessageMediaRenderer.tsx', 'utf8')

describe('1. JobComposer — End Time never auto-derived', () => {
  it('no start+1h auto-default effect exists', () => {
    expect(jobComposer).not.toContain('endH')
    expect(jobComposer).not.toContain('endTimeTouched')
    expect(jobComposer).not.toContain('setScheduledEndTime(`${String(endH)')
  })

  it('start and end are independent setters (onChange direct)', () => {
    expect(jobComposer).toContain('onChange={setScheduledTime}')
    expect(jobComposer).toContain('onChange={setScheduledEndTime}')
  })

  it('helper copy no longer claims end defaults to start + 1 hour', () => {
    expect(jobComposer).not.toContain('defaults to start + 1 hour')
    expect(jobComposer).toContain('End time is set only if you choose one')
  })

  it('edit mode still hydrates the stored end time', () => {
    expect(jobComposer).toContain('setScheduledEndTime(editJob.scheduled_end_time?.slice(0, 5)')
  })

  it('prefill end time still hydrates (intentional prefilled value)', () => {
    expect(jobComposer).toContain('setScheduledEndTime(prefill?.scheduled_end_time')
  })

  it('end time still submitted when set (null when empty — optional)', () => {
    expect(jobComposer).toContain('scheduled_end_time: scheduledEndTime || null')
  })
})

describe('2. Attachment preview — images thumb, files card, no broken-image UI', () => {
  it('mobile composer renders AttachmentPreviewThumb (not inline createObjectURL <img>)', () => {
    expect(pageClient).toContain('AttachmentPreviewThumb')
    const previewIdx = pageClient.indexOf('{mobileImages.length > 0 && (')
    const region = pageClient.slice(previewIdx, previewIdx + 900)
    expect(region).not.toContain('URL.createObjectURL')
    expect(region).not.toContain('<img')
  })

  it('image previews use FileReader readAsDataURL (Capacitor-safe, no blob: in <img>)', () => {
    expect(thumb).toContain('new FileReader()')
    expect(thumb).toContain('readAsDataURL(file)')
    expect(thumb).not.toContain('URL.createObjectURL(')
  })

  it('non-image files never render through <img> — file card with icon + filename', () => {
    expect(thumb).toContain("file.type.startsWith('image/')")
    expect(thumb).toContain('FileCard')
    // File card path has no <img> element
    const fileCardIdx = thumb.indexOf('function FileCard')
    const fileCardRegion = thumb.slice(fileCardIdx)
    expect(fileCardRegion).not.toContain('<img')
  })

  it('image decode failure falls back to file card (onError -> setFailed)', () => {
    expect(thumb).toContain('onError={() => setFailed(true)}')
    expect(thumb).toContain('isImage && !failed')
  })

  it('remove control preserved with accessible label', () => {
    expect(thumb).toContain('aria-label="Remove attachment"')
    expect(thumb).toContain('onClick={onRemove}')
  })

  it('loading state is a skeleton block, not a broken <img>', () => {
    expect(thumb).toContain('animate-pulse')
    expect(thumb).toContain('aria-label="Loading attachment preview"')
  })
})

describe('3. Mobile conversation card height is bounded', () => {
  it('cardTop is clamped to the viewport (no negative-top inflation)', () => {
    expect(pageClient).toContain('Math.max(0, cardTop)')
  })

  it('computed height is capped at the visible viewport minus nav', () => {
    expect(pageClient).toContain('const maxHeight = visibleBottom - navHeight - 8')
    expect(pageClient).toContain('Math.min(maxHeight,')
  })

  it('card carries a defensive CSS max-height tied to the viewport', () => {
    expect(pageClient).toContain('max-h-[calc(var(--visual-viewport-height,100dvh)-var(--bottom-nav-height,72px))]')
  })

  it('existing bounded height class is retained (viewport - header - nav)', () => {
    expect(pageClient).toContain('h-[calc(var(--visual-viewport-height,100dvh)-7rem-var(--bottom-nav-height,72px))]')
  })

  it('message list still owns internal scrolling (flex-1 overflow-y-auto min-h-0)', () => {
    const containerIdx = pageClient.indexOf('mobileConversationContainerRef}')
    const region = pageClient.slice(containerIdx, containerIdx + 300)
    expect(region).toContain('flex-1 overflow-y-auto')
    expect(region).toContain('min-h-0')
  })
})

describe('4. Light-mode conversation metadata contrast', () => {
  it('delivery status uses solid slate in light mode, original muted token in dark', () => {
    expect(mobileList).toContain('text-slate-500 dark:text-muted-foreground/50">Delivered')
    expect(desktopList).toContain('text-slate-500 dark:text-muted-foreground/40 font-medium">Delivered')
  })

  it('message timestamps use solid slate in light mode', () => {
    expect(mobileList).toContain('text-slate-500 dark:text-muted-foreground/30" title=')
    expect(desktopList).toContain('text-slate-500 dark:text-muted-foreground/30 font-medium" title=')
  })

  it('separators get a readable-but-secondary slate (light) / original (dark)', () => {
    expect(mobileList).toContain('text-slate-400 dark:text-muted-foreground/30">•')
    expect(desktopList).toContain('text-slate-400 dark:text-muted-foreground/20">•')
  })

  it('no extremely-low-opacity light-mode metadata remains in message status rows', () => {
    for (const src of [mobileList, desktopList]) {
      // Strip the preserved dark-mode tokens — any remaining bare fractional
      // opacity muted token is a light-mode contrast violation.
      const stripped = src.replace(/dark:text-muted-foreground\/\d+/g, '')
      expect(stripped.match(/text-muted-foreground\/\d+/g) || []).toEqual([])
      expect(src.match(/dark:text-muted-foreground/g)?.length).toBeGreaterThan(0)
    }
  })

  it('Failed/Sending statuses get stronger light tokens, dark preserved', () => {
    expect(mobileList).toContain('text-red-600 dark:text-red-500/60')
    expect(mobileList).toContain('text-blue-600 dark:text-blue-500/60')
    expect(desktopList).toContain('text-red-600 dark:text-red-500/50')
    expect(desktopList).toContain('text-blue-600 dark:text-blue-500/50')
  })
})

describe('5. Customer detail header — no full Reason for Calling', () => {
  it('header does not fall back to raw serviceRequested', () => {
    const headerIdx = pageClient.indexOf('{/* Customer Identity - Horizontal */}')
    const headerRegion = pageClient.slice(headerIdx, headerIdx + 5000)
    expect(headerRegion).not.toContain('serviceRequested')
    expect(headerRegion).not.toContain("'No request'")
  })

  it('short canonical request title may still render when present', () => {
    expect(pageClient).toContain('getLeadRequestTitle(leadData || lead)')
  })

  it('name and phone remain in the header', () => {
    const headerIdx = pageClient.indexOf('{/* Customer Identity - Horizontal */}')
    const headerRegion = pageClient.slice(headerIdx, headerIdx + 5000)
    expect(headerRegion).toContain('getLeadDisplayName')
    expect(headerRegion).toContain('formatPhoneNumber')
  })

  it('Customer Context still surfaces the full reason (CustomerDetails -> Reason for Calling)', () => {
    const customerDetails = readFileSync('src/components/CustomerDetails.tsx', 'utf8')
    expect(pageClient).toContain('<CustomerDetails')
    expect(customerDetails).toContain("'Reason for Calling'")
  })
})

describe('6. Settings chevron affordances sit inward', () => {
  it('all shared expand/collapse chevron buttons use the mr-2 inset', () => {
    const occurrences = settings.match(/p-1\.5 mr-2 text-slate-500/g) || []
    expect(occurrences.length).toBe(6)
    expect(settings).not.toContain('p-1.5 mr-1 text-slate-500')
  })

  it('touch target padding preserved (p-1.5 retained on chevron buttons)', () => {
    expect(settings).toContain('p-1.5 mr-2')
  })
})

describe('7. Conversation images — stable resolution, no flash', () => {
  it('media fingerprint uses durable identity, not the rotating signed URL', () => {
    expect(mediaRenderer).toContain('getMediaIdentity')
    const fpIdx = mediaRenderer.indexOf('const mediaFingerprint')
    const fpRegion = mediaRenderer.slice(fpIdx, fpIdx + 400)
    expect(fpRegion).toContain('getMediaIdentity(m)')
    expect(fpRegion).not.toContain('m.media_url')
  })

  it('identity for MMS URLs is the storage path query param', () => {
    expect(mediaRenderer).toContain("searchParams.get('path')")
    expect(mediaRenderer).toContain('mms:${path}')
  })

  it('items already resolved for an identity are skipped (no re-resolve churn)', () => {
    expect(mediaRenderer).toContain('resolvedIdentityRef')
    expect(mediaRenderer).toContain('resolvedIdentityRef.current[mediaItem.id] === identity')
  })

  it('resolution records identity on success (initial + retry paths)', () => {
    const marks = mediaRenderer.match(/resolvedIdentityRef\.current\[media(Item)?\.?i?d?\] = getMediaIdentity|resolvedIdentityRef\.current\[mediaItem\.id\] = identity|resolvedIdentityRef\.current\[mediaId\] = getMediaIdentity/g) || []
    expect(marks.length).toBeGreaterThanOrEqual(2)
  })

  it('hard-error state is suppressed while a resolution attempt is still in flight', () => {
    expect(mediaRenderer).toContain('stillTrying')
    expect(mediaRenderer).toContain('resolvingMedia.has(mediaItem.id) && !retriesExhausted')
    expect(mediaRenderer).toContain('&& !stillTrying')
  })

  it('manual retry still clears stale resolved state and re-queues', () => {
    expect(mediaRenderer).toContain('delete resolvedIdentityRef.current[id]')
    expect(mediaRenderer).toContain('setResolvingMedia(prev => new Set(prev).add(id))')
  })

  it('blob URLs still cleaned up on unmount (no unbounded memory)', () => {
    expect(mediaRenderer).toContain('URL.revokeObjectURL(url)')
    expect(mediaRenderer).toContain('blobUrlsRef.current.clear()')
  })
})
