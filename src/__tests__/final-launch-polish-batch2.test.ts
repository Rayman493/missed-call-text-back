import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { capitalizeFirstAlpha, normalizePunctuation } from '@/lib/utils'

const chartFilter = readFileSync('src/components/ui/ChartFilterButton.tsx', 'utf8')
const newCustomers = readFileSync('src/components/analytics/NewCustomersGraph.tsx', 'utf8')
const notificationCreate = readFileSync('src/app/api/notifications/create/route.ts', 'utf8')
const overlayEvents = readFileSync('src/lib/dashboard-overlay-events.ts', 'utf8')
const pushService = readFileSync('src/lib/push-service.ts', 'utf8')
const registerRoute = readFileSync('src/app/api/push/register-device/route.ts', 'utf8')
const pushDelivery = readFileSync('src/lib/push-delivery.ts', 'utf8')
const appDelegate = readFileSync('ios/App/App/AppDelegate.swift', 'utf8')
const entitlements = readFileSync('ios/App/App/App.entitlements', 'utf8')

// ---------------------------------------------------------------------------
// ISSUE 1 — Chart filter swipe protection
// ---------------------------------------------------------------------------
describe('Issue 1 — Chart filter swipe protection', () => {
  it('defines a deterministic movement threshold', () => {
    expect(chartFilter).toContain('SWIPE_DISMISS_THRESHOLD_PX')
  })

  it('tracks pointer travel inside the popup', () => {
    expect(chartFilter).toContain('onPointerDownCapture')
    expect(chartFilter).toContain('onPointerMoveCapture')
    expect(chartFilter).toContain('swipeGestureRef')
  })

  it('option click ignores gestures that were swipes', () => {
    const idx = chartFilter.indexOf('swipeGestureRef.current')
    expect(idx).toBeGreaterThan(-1)
    const clickRegion = chartFilter.substring(chartFilter.indexOf('onClick={() => {', chartFilter.indexOf('renderOptionRow')))
    expect(clickRegion).toContain('swipeGestureRef.current')
    expect(clickRegion).toContain('setIsOpen(false)')
  })

  it('Reset Filters is guarded by the same swipe check', () => {
    expect(chartFilter).toContain('shouldIgnoreTap')
    const resetIdx = chartFilter.indexOf('handleReset')
    const region = chartFilter.substring(resetIdx, resetIdx + 400)
    expect(region).toContain('shouldIgnoreTap?.()')
  })

  it('still closes on outside pointerdown, Escape, and foreign overlay', () => {
    expect(chartFilter).toContain("document.addEventListener('pointerdown'")
    expect(chartFilter).toContain("event.key === 'Escape'")
    expect(overlayEvents).toContain('DASHBOARD_OVERLAY_OPEN')
  })

  it('scroll inside the popup does not dismiss (belongsToOverlay)', () => {
    expect(overlayEvents).toContain('belongsToOverlay')
    const scrollIdx = overlayEvents.indexOf('handleScroll')
    const region = overlayEvents.substring(scrollIdx, scrollIdx + 300)
    expect(region).toContain('belongsToOverlay(e.target)')
  })

  it('popup stays bounded to viewport with internal scroll', () => {
    expect(chartFilter).toContain('overflow-y-auto')
    expect(chartFilter).toContain('overscroll-contain')
    expect(chartFilter).toContain('maxHeight')
  })
})

// ---------------------------------------------------------------------------
// ISSUE 2 — New Customers responsive bar width
// ---------------------------------------------------------------------------
describe('Issue 2 — NewCustomersGraph responsive bar width', () => {
  it('no longer uses a fixed-px category gap that collapses dense bars', () => {
    expect(newCustomers).not.toContain('barCategoryGap={CHART_STYLES.categoryGap}>')
    expect(newCustomers).toContain('barCategoryGap={barCategoryGap}')
  })

  it('scales gap down as point count grows', () => {
    expect(newCustomers).toContain("pointCount > 60 ? '8%'")
    expect(newCustomers).toContain("pointCount > 31 ? '12%'")
    expect(newCustomers).toContain("pointCount > 16 ? '20%'")
  })

  it('pins explicit barSize on short ranges', () => {
    expect(newCustomers).toContain('pointCount <= 8 ? 32')
    expect(newCustomers).toContain('pointCount <= 16 ? 20')
    expect(newCustomers).toContain('barSize={barSize}')
  })

  it('keeps minPointSize and maxBarSize', () => {
    expect(newCustomers).toContain('minPointSize={3}')
    expect(newCustomers).toContain('maxBarSize={CHART_STYLES.barMaxSize}')
  })

  it('uses chart-level activeTooltipIndex for full-column tap targets', () => {
    expect(newCustomers).toContain('activeTooltipIndex')
    expect(newCustomers).toContain('toggleDatum(index)')
    // Bar-level per-rectangle onClick removed (would double-toggle)
    const barRegion = newCustomers.substring(newCustomers.indexOf('<Bar\n'))
    expect(barRegion).not.toContain('onClick=')
  })
})

// ---------------------------------------------------------------------------
// ISSUE 3/16 — Notification capitalization
// ---------------------------------------------------------------------------
describe('Issue 3 — ai_intake_completed preview capitalization', () => {
  it('preview serviceLabel uses canonical capitalizeFirstAlpha', () => {
    expect(notificationCreate).toContain('capitalizeFirstAlpha(normalizePunctuation(serviceRequested))')
  })

  it('helper capitalizes a lowercase reason', () => {
    expect(capitalizeFirstAlpha(normalizePunctuation('someone to repair a leaking bathroom faucet')))
      .toBe('Someone to repair a leaking bathroom faucet')
  })

  it('helper preserves already-correct and acronym text', () => {
    expect(capitalizeFirstAlpha('HVAC repair')).toBe('HVAC repair')
    expect(capitalizeFirstAlpha('Someone to repair')).toBe('Someone to repair')
  })

  it('does not modify stored serviceRequested or idempotency fields', () => {
    const region = notificationCreate.substring(notificationCreate.indexOf('ai_intake_completed'))
    expect(region).toContain('serviceRequested,')
    expect(region).toContain('callSid')
    expect(region).toContain('aiCallRecordId')
  })
})

// ---------------------------------------------------------------------------
// ISSUES 4-8 — iOS push registration path
// ---------------------------------------------------------------------------
describe('Issues 4-8 — iOS push registration', () => {
  it('entitlements include aps-environment (Push capability)', () => {
    expect(entitlements).toContain('<key>aps-environment</key>')
  })

  it('AppDelegate forwards APNs registration success to Capacitor', () => {
    expect(appDelegate).toContain('didRegisterForRemoteNotificationsWithDeviceToken')
    expect(appDelegate).toContain('.capacitorDidRegisterForRemoteNotifications')
  })

  it('AppDelegate forwards APNs registration failure to Capacitor', () => {
    expect(appDelegate).toContain('didFailToRegisterForRemoteNotificationsWithError')
    expect(appDelegate).toContain('.capacitorDidFailToRegisterForRemoteNotifications')
  })

  it('push-service detects ios platform correctly', () => {
    expect(pushService).toContain("Capacitor.getPlatform() === 'android' ? 'android' : 'ios'")
  })

  it('no Android-only guard blocks iOS registration', () => {
    expect(pushService).not.toMatch(/platform\s*===?\s*['"]android['"]\s*&&\s*/)
    expect(pushService).not.toContain("platform !== 'android'")
  })

  it('registration POST sends platform + token + business + device id', () => {
    expect(pushService).toContain('/api/push/register-device')
    const bodyIdx = pushService.indexOf('pushToken: token')
    expect(bodyIdx).toBeGreaterThan(-1)
    const region = pushService.substring(bodyIdx, bodyIdx + 300)
    expect(region).toContain('platform: this.currentPlatform')
    expect(region).toContain('businessId: this.currentBusinessId')
  })

  it('backend accepts ios and persists enabled=true', () => {
    expect(registerRoute).toContain("['android', 'ios'].includes(platform)")
    expect(registerRoute).toContain('enabled: true')
    expect(registerRoute).toContain("onConflict: 'user_id,platform,push_token'")
  })

  it('backend is business-scoped via membership', () => {
    expect(registerRoute).toContain('getUserRoleForBusiness')
    expect(registerRoute).toContain('resolveBusinessForUser')
  })

  it('stale-token cleanup is same-device scoped (rotation safe)', () => {
    expect(registerRoute).toContain(".eq('device_identifier', deviceIdentifier)")
    expect(registerRoute).toContain(".neq('push_token', pushToken)")
  })
})

// ---------------------------------------------------------------------------
// ISSUES 5/9 — Push diagnostics safety
// ---------------------------------------------------------------------------
describe('Issues 5/9 — Push diagnostics', () => {
  it('logs token prefix and length only — never full token', () => {
    expect(pushService).toContain('tokenPrefix')
    expect(pushService).toContain('tokenLength')
    expect(pushService).not.toContain('console.log(`[PUSH SERVICE] FCM/APNs registration event received`, { platform: this.currentPlatform, token')
  })

  it('registrationError logs platform + message', () => {
    expect(pushService).toContain('Push registration error')
  })

  it('delivery failure log carries errorCode + permanent flag without full token', () => {
    expect(pushDelivery).toContain('tokenFailures')
    expect(pushDelivery).toContain("s.token.substring(0, 12)")
    expect(pushDelivery).not.toMatch(/tokenFailures[\s\S]{0,200}s\.token[^.]/)
  })
})

// ---------------------------------------------------------------------------
// ISSUES 13-14 — iOS foreground/tap handling + deep link
// ---------------------------------------------------------------------------
describe('Issues 13-14 — iOS push handling and deep links', () => {
  it('foreground notification listener present', () => {
    expect(pushService).toContain("addListener('pushNotificationReceived'")
  })

  it('tap listener present for background/terminated delivery', () => {
    expect(pushService).toContain("addListener('pushNotificationActionPerformed'")
  })

  it('tap navigates to the canonical actionUrl with safety validation', () => {
    expect(pushService).toContain('isSafeNotificationActionUrl')
    expect(pushService).toContain('data?.actionUrl')
  })
})
