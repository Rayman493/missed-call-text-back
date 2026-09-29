import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8')

const settings = read('components/SettingsContent.tsx')
const globalsCss = read('app/globals.css')
const dailyBrief = read('components/DailyBrief.tsx')
const briefService = read('lib/daily-brief/daily-brief-service.ts')
const recentActivity = read('components/RecentActivityCard.tsx')
const booking = read('components/settings/OnlineBookingSection.tsx')

describe('Android native picker/chevron inset', () => {
  it('pseudo-element margin rule is bumped inward (~10px) and covers the shared class', () => {
    expect(globalsCss).toContain('.native-picker-inset::-webkit-calendar-picker-indicator')
    expect(globalsCss).toContain('.booking-exception-date::-webkit-calendar-picker-indicator')
    expect(globalsCss).toContain('margin-inline-end: 10px')
  })

  it('Automation controls carry the inset class / custom chevron', () => {
    // Timezone select gets appearance-none + manual chevron positioned inward
    const tz = settings.indexOf('value={formBusiness.business_hours_timezone')
    const tzSelect = settings.slice(tz - 400, tz + 1400)
    expect(tzSelect).toContain('appearance-none')
    expect(tzSelect).toContain('bg-[right_0.75rem_center]')
    expect(tzSelect).toContain('pr-9')

    // Open/Close Time + Out of Office datetime-locals use the inset class
    const openTime = settings.indexOf('ref={openTimeInputRef}')
    expect(settings.slice(openTime, openTime + 1200)).toContain('native-picker-inset')
    const closeTime = settings.indexOf('ref={closeTimeInputRef}')
    expect(settings.slice(closeTime, closeTime + 1200)).toContain('native-picker-inset')
    const ooo = settings.indexOf('out_of_office_start ? toDateTimeLocal')
    expect(settings.slice(ooo, ooo + 1200)).toContain('native-picker-inset')
  })

  it('Online Booking blocked-date inputs keep the scoped indicator class', () => {
    expect(booking.match(/booking-exception-date/g)?.length).toBeGreaterThanOrEqual(2)
  })
})

describe('Payments cards alignment', () => {
  it('Stripe capability bullets/status sit in the card body, not the mt-auto footer', () => {
    const stripeCard = settings.slice(
      settings.indexOf('brands/stripe.svg'),
      settings.indexOf('id="payments-venmo"')
    )
    const mtAutoIdx = stripeCard.indexOf('mt-auto')
    const bulletsIdx = stripeCard.indexOf('stripe_charges_enabled')
    expect(mtAutoIdx).toBeGreaterThan(-1)
    expect(bulletsIdx).toBeGreaterThan(-1)
    expect(bulletsIdx).toBeLessThan(mtAutoIdx)
    // footer keeps only the action row
    const footer = stripeCard.slice(mtAutoIdx)
    expect(footer).not.toContain('Stripe processes customer card payments')
  })
})

describe('Daily Brief bullet consistency', () => {
  it('empty-state items render without the priority bullet', () => {
    expect(dailyBrief).toContain('isPlainItem')
    expect(dailyBrief).toContain('plain={isPlainItem(section, item)}')
    // placeholder badge exclusion
    expect(dailyBrief).toContain('!isPlainItem(section, item)')
    expect(dailyBrief).toContain('placeholder-')
  })

  it('schedule section emits a marked placeholder empty-state line', () => {
    expect(briefService).toContain("placeholder-schedule-empty")
    expect(briefService).toContain('isPlaceholder: true')
    expect(briefService).toContain('No events scheduled today')
  })
})

describe('Recent Activity name dedup', () => {
  it('hides customerName in metadata when the title already contains it', () => {
    expect(recentActivity).toContain('titleIdentifiesCustomer')
    // both linked and non-linked row variants use the check
    expect(recentActivity.match(/titleIdentifiesCustomer\(activity\.title, activity\.customerName\)/g)?.length).toBe(2)
    expect(recentActivity).toContain('escapeRegExp')
  })
})
