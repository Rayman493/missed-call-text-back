import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const read = (p: string) => readFileSync(p, 'utf8')

describe('zero-slot fix — business-hours fallback', () => {
  const section = read('src/components/settings/OnlineBookingSection.tsx')
  const settingsRoute = read('src/app/api/booking/settings/route.ts')

  it('falls back to the custom week editor when business hours are not configured', () => {
    expect(section).toMatch(/const hasBusinessHours = Boolean\(data\.businessHours\?\.start && data\.businessHours\?\.end\)/)
    expect(section).toMatch(/const effectiveUseBusinessHours = hasBusinessHours/)
    expect(section).toMatch(/\? data\.settings\.use_business_hours !== false/)
    expect(section).toMatch(/: false/)
  })

  it('warns when Booking is enabled but no usable hours exist', () => {
    expect(section).toMatch(/Add booking hours before customers can request a time\./)
    expect(section).toMatch(/!hasUsableHours/)
    expect(section).toMatch(/const hasUsableHours = useBusinessHours/)
  })

  it('server rejects enabling Booking with zero usable weekly hours', () => {
    expect(settingsRoute).toMatch(/Add booking hours before customers can request a time\./)
    expect(settingsRoute).toMatch(/effectiveUseBusinessHours/)
    expect(settingsRoute).toMatch(/business_hours_start, business_hours_end/)
    expect(settingsRoute).toMatch(/booking_hours/)
  })

  it('business-hours availability only counts when configured hours exist', () => {
    expect(settingsRoute).toMatch(/Boolean\(business\?\.business_hours_start && business\?\.business_hours_end\)/)
  })
})

describe('calendar-first public picker', () => {
  const client = read('src/app/book/[slug]/PublicBookingClient.tsx')

  it('groups availability by local date in the business timezone', () => {
    expect(client).toMatch(/slotsByDate/)
    expect(client).toMatch(/en-CA/)
    expect(client).toMatch(/timeZone: timezone/)
  })

  it('renders a month calendar with weekday headers and month label', () => {
    expect(client).toMatch(/'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'/)
    expect(client).toMatch(/monthLabel/)
    expect(client).toMatch(/calendarCells/)
  })

  it('disables days without slots and only highlights days with availability', () => {
    expect(client).toMatch(/disabled=\{!hasSlots\}/)
    expect(client).toMatch(/slotsByDate\.has\(cell\.key\)/)
  })

  it('shows only the selected day slots below the calendar', () => {
    expect(client).toMatch(/selectedDaySlots/)
    expect(client).toMatch(/slotsByDate\.get\(selectedDate\)/)
    expect(client).toMatch(/selectedDateLabel/)
  })

  it('clears the selected slot when the day changes', () => {
    expect(client).toMatch(/handleSelectDate/)
    expect(client).toMatch(/setSelected\(null\)/)
  })

  it('bounds month navigation to the booking horizon', () => {
    expect(client).toMatch(/canGoPrev/)
    expect(client).toMatch(/canGoNext/)
    expect(client).toMatch(/lastMonth/)
    expect(client).toMatch(/disabled=\{!canGoPrev\}/)
    expect(client).toMatch(/disabled=\{!canGoNext\}/)
    expect(client).toMatch(/aria-label="Previous month"/)
    expect(client).toMatch(/aria-label="Next month"/)
  })

  it('never exposes busy-source details — only slot start/end', () => {
    expect(client).not.toMatch(/\b(jobs?|google|hold|busy)\b/i)
    expect(client).toMatch(/selectedDaySlots\.map/)
  })

  it('submits the exact selected slot start/end', () => {
    expect(client).toMatch(/start: selected\.start/)
    expect(client).toMatch(/end: selected\.end/)
  })

  it('keeps Request a time disabled until a slot is selected', () => {
    expect(client).toMatch(/selected !== null &&/)
    expect(client).toMatch(/disabled=\{!canSubmit\}/)
  })
})

describe('public booking page polish', () => {
  const client = read('src/app/book/[slug]/PublicBookingClient.tsx')

  it('uses clean white inputs without a heavy gray filled-state treatment', () => {
    expect(client).toMatch(/border-slate-200 bg-white/)
    expect(client).not.toMatch(/bg-slate-100 px-4 py-3/)
    expect(client).toMatch(/autofill:shadow-\[inset_0_0_0_1000px_white\]/)
  })

  it('keeps a clear ReplyFlow focus ring on inputs', () => {
    expect(client).toMatch(/focus:border-blue-500/)
    expect(client).toMatch(/focus:ring-2 focus:ring-blue-500\/15/)
  })

  it('keeps customer hierarchy: need → day/time → details → request', () => {
    const needIdx = client.indexOf('What do you need?')
    const pickIdx = client.indexOf('Pick a day and time')
    const detailsIdx = client.indexOf('Your details')
    const submitIdx = client.indexOf(": 'Request a time'}")
    expect(needIdx).toBeGreaterThan(-1)
    expect(pickIdx).toBeGreaterThan(needIdx)
    expect(detailsIdx).toBeGreaterThan(pickIdx)
    expect(submitIdx).toBeGreaterThan(detailsIdx)
  })

  it('displays the business logo with object-contain and a broken-image fallback', () => {
    expect(client).toMatch(/logoUrl && !logoError/)
    expect(client).toMatch(/object-contain/)
    expect(client).toMatch(/onError=\{\(\) => setLogoError\(true\)\}/)
    expect(client).toMatch(/{businessName}/)
  })
})

describe('public route isolation', () => {
  const providers = read('src/components/ProvidersWrapper.tsx')

  it('renders /book/ routes without auth/business providers', () => {
    expect(providers).toMatch(/isBarePublicRoute/)
    expect(providers).toMatch(/normalizedPathname\.startsWith\('\/book\/'\)/)
    const bareIdx = providers.indexOf('isBarePublicRoute')
    const authIdx = providers.indexOf('<AuthProvider>')
    expect(bareIdx).toBeGreaterThan(-1)
    // The bare-route early return must precede provider wrapping.
    expect(providers.indexOf('if (isBarePublicRoute)')).toBeLessThan(authIdx)
  })
})

describe('desktop header one-line alignment', () => {
  const header = read('src/components/AppHeader.tsx')

  it('keeps the brand icon inside the shared header row height', () => {
    expect(header).toMatch(/h-10/)
    expect(header).toMatch(/BrandIcon size=\{40\}/)
    expect(header).not.toMatch(/BrandIcon size=\{56\}/)
  })

  it('keeps nav and right cluster on one non-wrapping line', () => {
    expect(header).toMatch(/flex min-w-0 items-center/)
    expect(header).toMatch(/flex flex-shrink-0 items-center/)
    expect(header).not.toMatch(/flex-wrap/)
  })

  it('uses a single shared desktop row height for all controls', () => {
    expect(header).toMatch(/h-10/)
    expect(header).toMatch(/items-center/)
  })
})

describe('Agenda → Overview rename', () => {
  const calendar = read('src/app/dashboard/calendar/page.tsx')
  const commandCenter = read('src/components/schedule/TodayCommandCenter.tsx')
  const tasksTab = read('src/components/schedule/TasksTab.tsx')

  it('uses Overview for the schedule tab label', () => {
    expect(calendar).toMatch(/>\s*Overview\s*</)
    expect(calendar).toMatch(/>Overview<\/span>/)
    expect(calendar).not.toMatch(/>\s*Agenda\s*</)
  })

  it('uses Overview for the summary heading', () => {
    expect(commandCenter).toMatch(/>\s*Overview\s*</)
    expect(commandCenter).not.toMatch(/>\s*Agenda\s*</)
  })

  it('uses Overview in back-navigation copy', () => {
    expect(tasksTab).toMatch(/← Back to Overview/)
    expect(tasksTab).not.toMatch(/← Back to Agenda/)
  })

  it('keeps the internal agenda tab identity unchanged', () => {
    expect(calendar).toMatch(/scheduleTab === 'agenda'/)
    expect(calendar).toMatch(/setScheduleTab\('agenda'\)/)
  })
})

describe('Settings back to top', () => {
  const backToTop = read('src/components/settings/BackToTopButton.tsx')
  const settings = read('src/components/SettingsContent.tsx')

  it('renders a semantic accessible button', () => {
    expect(backToTop).toMatch(/aria-label="Back to top"/)
    expect(backToTop).toMatch(/min-h-\[44px\]/)
    expect(backToTop).toMatch(/focus-visible:ring-2/)
  })

  it('appears only after meaningful scroll', () => {
    expect(backToTop).toMatch(/window\.scrollY > 400/)
    expect(backToTop).toMatch(/if \(!visible\) return null/)
  })

  it('honors prefers-reduced-motion', () => {
    expect(backToTop).toMatch(/prefers-reduced-motion: reduce/)
    expect(backToTop).toMatch(/behavior: reduced \? 'auto' : 'smooth'/)
  })

  it('lifts above the sticky save bar and mobile bottom nav', () => {
    expect(backToTop).toMatch(/lifted/)
    expect(backToTop).toMatch(/var\(--bottom-nav-height,0px\)/)
    expect(backToTop).toMatch(/safe-area-inset-bottom/)
    expect(settings).toMatch(/BackToTopButton/)
    expect(settings).toMatch(/lifted=\{hasUnsavedChanges \|\| bookingDirty/)
  })

  it('uses intentional desktop right alignment shared with ReplyFlow floating controls', () => {
    // Anchored to the viewport-right gutter outside the 1200px content column
    // (content edge = 50%-600px): icon-only pill below 2xl, labeled pill at
    // 2xl+ where the gutter provably fits it. Floored at 1.5rem on narrow
    // desktops so it never rides inward over the cards.
    expect(backToTop).toMatch(/right-4 sm:right-6 lg:right-\[max\(1\.5rem,calc\(50%-664px\)\)\] 2xl:right-\[max\(1\.5rem,calc\(50%-732px\)\)\]/)
    expect(backToTop).not.toMatch(/calc\(50%-700px\)/)
  })
})

describe('BookingRequestDetailModal accepted-flow UX', () => {
  const modal = read('src/components/schedule/BookingRequestDetailModal.tsx')

  it('sends the Authorization Bearer header on detail, action, and slot requests', () => {
    expect(modal).toMatch(/session\?\.access_token/)
    expect(modal).toMatch(/headers\.Authorization = `Bearer \$\{session\.access_token\}`/)
    expect(modal).toMatch(/const headers = await authHeaders\(\)/)
    expect(modal).toMatch(/fetch\(`\/api\/booking\/requests\/\$\{requestId\}`/)
    expect(modal).toMatch(/fetch\(`\/api\/booking\/requests\/\$\{requestId\}\/action`,/)
    expect(modal).toMatch(/fetch\(`\/api\/booking\/requests\/\$\{requestId\}\/slots`/)
  })

  it('uses the canonical kebab action names for Create Appointment and Create Job', () => {
    expect(modal).toMatch(/runAction\('create-appointment'\)/)
    expect(modal).toMatch(/runAction\('create-job'\)/)
    expect(modal).not.toMatch(/runAction\('create_appointment'\)/)
    expect(modal).not.toMatch(/runAction\('create_job'\)/)
  })

  it('uses the canonical ReplyFlow Modal shell so the card stays viewport-contained', () => {
    expect(modal).toMatch(/import Modal from '@\/components\/ui\/Modal'/)
    expect(modal).toMatch(/<Modal isOpen onClose=\{onClose\} title=\{detail\?\.customer_name \?\? 'Booking request'\}>/)
    expect(modal).toMatch(/max-h-56 space-y-3 overflow-y-auto/)
  })

  it('shows a strong selected-time summary before sending the proposal', () => {
    expect(modal).toMatch(/Selected:/)
    expect(modal).toMatch(/aria-pressed=\{selected\}/)
    expect(modal).toMatch(/ring-2 ring-primary-600\/20/)
  })

  it('closes the suggestion picker after a successful proposal', () => {
    expect(modal).toMatch(/setPicking\(false\)/)
  })

  it('shows Accepted state clearly and links to the resolved customer', () => {
    expect(modal).toMatch(/Accepted/)
    expect(modal).toMatch(/View Customer/)
    expect(modal).toMatch(/detail\.lead_id/)
  })

  it('routes View Customer to the canonical lead detail route', () => {
    expect(modal).toMatch(/navigateFromModal\(`\/dashboard\/leads\/\$\{detail\.lead_id\}`\)/)
    expect(modal).not.toMatch(/\/dashboard\/customers\//)
  })

  it('routes View Job to the canonical Schedule jobs surface', () => {
    expect(modal).toMatch(/\/dashboard\/calendar\?tab=jobs/)
  })

  it('routes View Appointment to the canonical Schedule appointments surface', () => {
    expect(modal).toMatch(/\/dashboard\/calendar\?tab=appointments/)
  })

  it('hides both create actions once the booking is converted', () => {
    expect(modal).toMatch(/status === 'accepted' && \(!hasAppointment \|\| !hasJob\)/)
    expect(modal).toMatch(/Create Appointment/)
    expect(modal).toMatch(/Create Job/)
  })

  it('subscribes to realtime updates for the open request and the list', () => {
    expect(modal).toMatch(/booking-request-detail:/)
    // Unfiltered binding + client-side payload guard — server-side
    // postgres_changes filters previously yielded SUBSCRIBED-but-zero-events.
    expect(modal).not.toMatch(/filter: `id=eq\.\$\{requestId\}`/)
    expect(modal).toMatch(/row\?\.id !== requestId \|\| row\?\.business_id !== effectiveBusinessId/)
    expect(modal).toMatch(/realtime\.setAuth/)
  })

  it('places View Customer in the Customer section and uses navigation-aware close', () => {
    expect(modal).toMatch(/<User className=/)
    expect(modal).toMatch(/View Customer/)
    expect(modal).toMatch(/navigateFromModal\(`/)
    expect(modal).toMatch(/suppressNextHistoryBackCleanup\(\)/)
  })

  it('renders Customer, Request, and Time fields with explicit labels', () => {
    expect(modal).toMatch(/>Customer</)
    expect(modal).toMatch(/>Phone</)
    expect(modal).toMatch(/>Request</)
    expect(modal).toMatch(/>Service</)
    expect(modal).toMatch(/>Time</)
    expect(modal).toMatch(/formatPhoneNumber\(detail\.customer_phone\)/)
  })

  it('keeps create actions visible when only one record exists and hides them when both do', () => {
    expect(modal).toMatch(/!hasAppointment \|\| !hasJob/)
    expect(modal).toMatch(/!hasAppointment &&/)
    expect(modal).toMatch(/!hasJob &&/)
  })

  it('shows both View Appointment and View Job when both records exist', () => {
    expect(modal).toMatch(/>Created records</)
    expect(modal).toMatch(/navigateFromModal\('\/dashboard\/calendar\?tab=appointments'\)/)
    expect(modal).toMatch(/navigateFromModal\('\/dashboard\/calendar\?tab=jobs'\)/)
  })
})

describe('Settings deep-link positioning', () => {
  const settings = read('src/components/SettingsContent.tsx')

  it('targets the section divider (true section start), falling back to the card', () => {
    // The divider is the canonical anchor — the same boundary the scroll-spy
    // uses — so the section heading lands just below the sticky nav.
    expect(settings).toMatch(/document\.getElementById\(`\$\{section\}-divider`\) \?\? document\.getElementById\(section\)/)
    expect(settings).toMatch(/document\.getElementById\(`\$\{hash\}-divider`\) \?\? document\.getElementById\(hash\)/)
    const scrollFn = settings.slice(settings.indexOf('const scrollToSection = useCallback'))
    expect(scrollFn).toMatch(/document\.getElementById\(`\$\{sectionId\}-divider`\) \?\? document\.getElementById\(sectionId\)/)
  })

  it('keeps one canonical scroll function used by query-param and hash paths', () => {
    expect(settings).toMatch(/scrollToSectionRef\.current\(section\)/)
    expect(settings).toMatch(/scrollToSectionRef\.current\(hash\)/)
  })

  it('uses MutationObserver only while a section is pending and cleans up', () => {
    expect(settings).toMatch(/new MutationObserver\(tryScroll\)/)
    expect(settings).toMatch(/\.disconnect\(\)/)
    expect(settings).toMatch(/setTimeout[\s\S]*?, 5000\)/)
  })
})

describe('BookingRequestsCard loading shell', () => {
  const card = read('src/components/schedule/BookingRequestsCard.tsx')

  it('always renders the header and footer without early returns', () => {
    expect(card).not.toMatch(/if \(loading\) \{\s*return/)
    expect(card).toMatch(/>Booking Requests</)
    expect(card).toMatch(/Booking settings/)
    expect(card).toMatch(/Copy booking link/)
  })

  it('shows skeleton rows while the initial fetch is in progress', () => {
    expect(card).toMatch(/skeletonRows/)
    expect(card).toMatch(/animate-pulse/)
    expect(card).toMatch(/loading \? \(/)
  })

  it('keeps the error state inside the same mounted shell', () => {
    expect(card).toMatch(/error \? \(/)
    expect(card).toMatch(/Could not load booking requests/)
  })

  it('renders the empty state in the same shell after loading succeeds', () => {
    expect(card).toMatch(/No booking requests yet\./)
  })
})
