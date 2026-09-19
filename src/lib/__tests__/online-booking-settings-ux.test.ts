import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { bookingPagePath, bookingPageUrl } from '@/lib/booking/url'

describe('Online Booking settings UX contracts', () => {
  const section = readFileSync('src/components/settings/OnlineBookingSection.tsx', 'utf8')
  const card = readFileSync('src/components/schedule/BookingRequestsCard.tsx', 'utf8')
  const settingsPage = readFileSync('src/app/dashboard/settings/page.tsx', 'utf8')
  const settingsContent = readFileSync('src/components/SettingsContent.tsx', 'utf8')
  const actionBar = readFileSync('src/components/SettingsActionBar.tsx', 'utf8')
  const requestsRoute = readFileSync('src/app/api/booking/requests/route.ts', 'utf8')

  it('does not render a dedicated Booking save button — global Settings save is the only submit path', () => {
    expect(section).not.toMatch(/Save booking settings/)
    expect(section).not.toMatch(/handleSave[^\n]*>\s*Saving/)
  })

  it('keeps local dirty tracking and exposes it to the global Settings save model', () => {
    expect(section).toMatch(/const \[baseline, setBaseline\]/)
    expect(section).toMatch(/const dirty =/)
    expect(section).toMatch(/useImperativeHandle\(ref, \(\) => \(\{/)
    expect(section).toMatch(/isDirty: dirty/)
    expect(section).toMatch(/save: handleSave/)
    expect(section).toMatch(/onDirtyChange\?\.\(dirty\)/)
  })

  it('resets dirty state only after a successful save so errors leave the form retryable', () => {
    expect(section).toMatch(/setBaseline\(currentSnapshot\)/)
    // Baseline must only advance after a confirmed res.ok response.
    expect(section).toMatch(/if \(!res\.ok\)/)
  })

  it('returns a save result so the global save can surface Booking errors', () => {
    expect(section).toMatch(/Promise<\{ ok: boolean; error\?: string \}>/)
    expect(section).toMatch(/return \{ ok: false, error: message \}/)
  })

  it('keeps the generated booking link stable by updating local slug from the save response', () => {
    expect(section).toMatch(/const savedSlug = data\.settings\?\.public_slug \?\? slug/)
    expect(section).toMatch(/setSlug\(savedSlug\)/)
  })

  it('displays a prominent booking link using the shared URL helper', () => {
    expect(section).toMatch(/import.*bookingPageUrl/)
    expect(section).toMatch(/Your booking link/)
    expect(section).toMatch(/bookingPageUrl\(slug, window\.location\.origin\)/)
    expect(section).toMatch(/Copy Link/)
    expect(section).toMatch(/Preview/)
  })

  it('gives clear copy feedback via toast', () => {
    expect(section).toMatch(/showToast\('Booking link copied', 'success'\)/)
  })

  it('surfaces a public-booking deep-link id and focus target on the settings card', () => {
    expect(settingsContent).toMatch(/id="online-booking"/)
    expect(settingsContent).toMatch(/id="online-booking" tabIndex=\{-1\}/)
  })

  it('wires Online Booking into the global Settings action bar dirty state', () => {
    expect(settingsContent).toMatch(/onlineBookingRef = useRef<OnlineBookingSectionHandle>/)
    expect(settingsContent).toMatch(/hasUnsavedChanges=\{hasUnsavedChanges \|\| bookingDirty\}/)
    expect(settingsContent).toMatch(/ref=\{onlineBookingRef\} onDirtyChange=\{handleBookingDirtyChange\}/)
  })

  it('global save invokes the Booking save path only when Booking is dirty', () => {
    expect(settingsContent).toMatch(/wantsBookingSave = booking\?\.isDirty \?\? bookingDirty/)
    expect(settingsContent).toMatch(/wantsBookingSave && booking \? booking\.save\(\)/)
  })

  it('global save surfaces Booking failure without faking success', () => {
    expect(settingsContent).toMatch(/setBookingSaveError\(bookingErrors\.join\(' '\) \|\| null\)/)
    expect(settingsContent).toMatch(/if \(businessOk && bookingOk\) setSaveSuccess\(true\)/)
  })

  it('global save stays disabled for duplicate submits while saving', () => {
    expect(settingsContent).toMatch(/globalSaveInFlightRef/)
    expect(actionBar).toMatch(/disabled=\{isSaving \|\| saveSuccess\}/)
  })

  it('global discard restores the persisted Booking baseline', () => {
    expect(settingsContent).toMatch(/onlineBookingRef\.current\?\.discard\(\)/)
    expect(section).toMatch(/discard: handleDiscard/)
  })

  it('?section= deep links use the canonical measured-offset scroll to the section divider', () => {
    expect(settingsContent).toMatch(/scrollToSectionRef\.current\(section\)/)
    expect(settingsContent).toMatch(/`\$\{section\}-divider`/)
    // Query param is replaced with a hash after the canonical scroll.
    expect(settingsContent).toMatch(/url\.searchParams\.delete\('section'\)/)
    expect(settingsContent).toMatch(/url\.hash = section/)
  })

  it('hash deep links use the same canonical scroll path', () => {
    expect(settingsContent).toMatch(/`\$\{hash\}-divider`/)
    expect(settingsContent).toMatch(/scrollToSectionRef\.current\(hash\)/)
  })

  it('focus happens after final scroll positioning', () => {
    expect(settingsContent).toMatch(/focus\(\{ preventScroll: true \}\)/)
  })

  it('navigates from Schedule to the Online Booking settings section', () => {
    expect(card).toMatch(/\/dashboard\/settings\?section=online-booking/)
  })

  it('settings page passes section query param and client handles #online-booking hash', () => {
    expect(settingsPage).toMatch(/section=\{section\}/)
    expect(settingsContent).toMatch(/window\.location\.hash/)
    expect(settingsContent).toMatch(/online-booking/)
  })

  it('requests API exposes booking enabled/url for the Schedule card', () => {
    expect(requestsRoute).toMatch(/bookingEnabled/)
    expect(requestsRoute).toMatch(/bookingUrl/)
  })

  it('Schedule card surfaces setup CTA when booking is not configured', () => {
    expect(card).toMatch(/Set up booking link/)
  })

  it('Schedule card surfaces copy + settings actions when booking is live', () => {
    expect(card).toMatch(/Copy booking link/)
    expect(card).toMatch(/Booking settings/)
  })

  it('blocked-date actions keep their dedicated immediate exception APIs', () => {
    expect(section).toMatch(/\/api\/booking\/exceptions/)
    expect(section).toMatch(/Block dates/)
    // Exception add/remove must not flow through the global save model.
    expect(section).not.toMatch(/exceptions.*onDirtyChange/)
  })

  it('uses one shared URL helper for both settings and schedule', () => {
    expect(card).toMatch(/bookingPageUrl/)
  })
})

describe('booking URL helper', () => {
  it('builds the canonical path', () => {
    expect(bookingPagePath('acme-co')).toBe('/book/acme-co')
  })

  it('builds the absolute public URL', () => {
    expect(bookingPageUrl('acme-co', 'https://replyflowhq.com')).toBe('https://replyflowhq.com/book/acme-co')
  })

  it('strips a trailing slash from origin', () => {
    expect(bookingPageUrl('acme-co', 'https://replyflowhq.com/')).toBe('https://replyflowhq.com/book/acme-co')
  })
})
