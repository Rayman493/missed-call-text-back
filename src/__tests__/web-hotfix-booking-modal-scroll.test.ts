import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('Web hotfix — booking form autofill focus contrast', () => {
  const src = readFileSync('src/app/book/[slug]/PublicBookingClient.tsx', 'utf8')

  it('overrides the global dark autofill text color on focus', () => {
    // globals.css sets input:-webkit-autofill:focus { -webkit-text-fill-color:
    // #f1f5f9 } — white text on this light-themed page. The field's Tailwind
    // fix must carry :focus so it beats the global rule's higher specificity.
    expect(src).toContain('autofill:focus:[-webkit-text-fill-color:theme(colors.slate.900)]')
  })

  it('overrides the autofill caret color on focus', () => {
    expect(src).toContain('autofill:focus:[caret-color:theme(colors.slate.900)]')
  })
})

describe('Web hotfix — BookingRequestDetailModal invisible actions', () => {
  const src = readFileSync('src/components/schedule/BookingRequestDetailModal.tsx', 'utf8')

  it('contains no phantom primary-N shades (not in tailwind config)', () => {
    expect(src).not.toMatch(/primary-\d{2,3}\b/)
  })

  it('Create Appointment uses bg-primary + text-primary-foreground', () => {
    expect(src).toMatch(/bg-primary[^-][^"']*text-primary-foreground/)
  })

  it('Create Job outline button uses border-primary + text-primary', () => {
    expect(src).toMatch(/border-primary[^-][^"']*text-primary[^-]/)
  })
})

describe('Web hotfix — BookingRequestsCard hover tokens', () => {
  const src = readFileSync('src/components/schedule/BookingRequestsCard.tsx', 'utf8')

  it('contains no phantom primary-N shades', () => {
    expect(src).not.toMatch(/primary-\d{2,3}\b/)
  })
})

describe('Web hotfix — Modal bottom-pin survives async content growth', () => {
  const src = readFileSync('src/components/ui/Modal.tsx', 'utf8')

  it('defers the bottom-pin write to requestAnimationFrame', () => {
    // Writing scrollTop inside the ResizeObserver callback can clamp to the
    // pre-commit scroll range; the pin must run on the next frame.
    expect(src).toContain('requestAnimationFrame')
    expect(src).toMatch(/pinRaf = requestAnimationFrame/)
  })

  it('checks the live scroll position, not only the recorded snapshot', () => {
    // If the user reaches the bottom in the same frame the content grows,
    // the ref snapshot is stale — the live position must also qualify.
    expect(src).toMatch(/content\.scrollTop \+ content\.clientHeight >= prev\.scrollHeight/)
  })

  it('cancels a pending pin frame on cleanup', () => {
    expect(src).toContain('cancelAnimationFrame(pinRaf)')
  })
})
