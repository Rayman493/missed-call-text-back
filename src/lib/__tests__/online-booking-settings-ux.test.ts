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

  describe('mobile responsive overflow contract', () => {
    it('booking-hours day rows stack on mobile and stay horizontal on desktop', () => {
      // The old `flex items-center gap-3` + `w-28` row forced label + two time
      // inputs + "to" onto one line wider than a 360px viewport.
      expect(section).toMatch(/key=\{d\} className="flex flex-col gap-1\.5 sm:flex-row sm:items-center sm:gap-3"/)
      // Desktop keeps the fixed weekday column.
      expect(section).toMatch(/sm:w-28 sm:flex-shrink-0/)
      // No unresponsive fixed-width label remains.
      expect(section).not.toMatch(/flex w-28 items-center/)
    })

    it('start/end time controls get equal-width shrinkable columns on mobile', () => {
      expect(section).toMatch(/grid grid-cols-\[1fr_auto_1fr\] items-center gap-2 pl-6 sm:pl-0 sm:flex sm:items-center/)
      // Both time inputs are full-width shrinkable on mobile, intrinsic on desktop.
      const timeInputs = section.match(/type="time"[\s\S]*?className=\{`\$\{inputCls\} w-full min-w-0 sm:w-auto`\}/g)
      expect(timeInputs?.length).toBe(2)
    })

    it('closed days render no time controls and stay compact', () => {
      expect(section).toMatch(/\{week\[d\]\.open \? \(/)
      expect(section).toMatch(/pl-6 text-xs text-muted-foreground sm:pl-0">Closed/)
    })

    it('"Use my business hours" label wraps without overflowing', () => {
      expect(section).toMatch(/mb-3 flex items-start gap-2 text-sm text-foreground/)
      expect(section).toMatch(/mt-0\.5 h-4 w-4 flex-shrink-0 rounded border-border/)
      expect(section).toMatch(/<span className="min-w-0">[\s\S]*?Use my business hours/)
    })

    it('blocked-date fields stack full-width on mobile and inline on desktop', () => {
      expect(section).toMatch(/flex flex-col sm:flex-row sm:items-end gap-2/)
      const dateLabels = section.match(/<label className="block w-full sm:w-auto">/g)
      expect(dateLabels?.length).toBe(2)
      const dateInputs = section.match(/type="date"[\s\S]*?className=\{`\$\{inputCls\} w-full sm:w-auto`\}/g)
      expect(dateInputs?.length).toBe(2)
    })

    it('inner booking cards use tighter mobile padding', () => {
      const paddedCards = section.match(/border border-border\/30 rounded-lg p-3 sm:p-4/g)
      expect(paddedCards?.length).toBe(2)
    })

    it('the Online Booking settings card relaxes padding on mobile', () => {
      expect(settingsContent).toMatch(/id="online-booking" tabIndex=\{-1\} className="[^"]*p-4 sm:p-6/)
    })

    it('sticky unsaved-changes bar stacks into two rows on mobile', () => {
      expect(actionBar).toMatch(/flex flex-col gap-2 rounded-2xl border/)
      expect(actionBar).toMatch(/sm:flex-row sm:items-center sm:justify-between sm:gap-3/)
      // Action cluster spans the second mobile row; buttons share it evenly.
      expect(actionBar).toMatch(/flex w-full items-center gap-2 sm:w-auto sm:gap-3/)
      expect(actionBar).toMatch(/flex-1 rounded-xl border border-slate-200/)
      expect(actionBar).toMatch(/min-w-0 flex-1 items-center justify-center/)
      // Desktop keeps the fixed save minimum width.
      expect(actionBar).toMatch(/sm:min-w-\[128px\]/)
    })

    it('sticky bar keeps bottom-nav offset and safe-area handling', () => {
      expect(actionBar).toMatch(/env\(safe-area-inset-bottom, 0px\)/)
      expect(actionBar).toMatch(/var\(--bottom-nav-height, 0px\)/)
    })
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
