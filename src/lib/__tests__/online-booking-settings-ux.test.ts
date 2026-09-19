import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { bookingPagePath, bookingPageUrl } from '@/lib/booking/url'

describe('Online Booking settings UX contracts', () => {
  const section = readFileSync('src/components/settings/OnlineBookingSection.tsx', 'utf8')
  const card = readFileSync('src/components/schedule/BookingRequestsCard.tsx', 'utf8')
  const settingsPage = readFileSync('src/app/dashboard/settings/page.tsx', 'utf8')
  const settingsContent = readFileSync('src/components/SettingsContent.tsx', 'utf8')
  const requestsRoute = readFileSync('src/app/api/booking/requests/route.ts', 'utf8')

  it('tracks dirty state and disables Save until a meaningful change is made', () => {
    expect(section).toMatch(/const \[baseline, setBaseline\]/)
    expect(section).toMatch(/const dirty =/)
    expect(section).toMatch(/disabled=\{!dirty \|\| saving\}/)
  })

  it('keeps the generated booking link stable by updating local slug from the save response', () => {
    expect(section).toMatch(/const savedSlug = data\.settings\?\.public_slug \?\? slug/)
    expect(section).toMatch(/setSlug\(savedSlug\)/)
  })

  it('resets dirty state only after a successful save so errors leave the form retryable', () => {
    expect(section).toMatch(/setBaseline\(currentSnapshot\)/)
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

  it('surfaces a public-booking deep-link id on the settings section', () => {
    expect(section).toMatch(/id="online-booking"/)
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
