/**
 * Call forwarding setup UX simplification — regression coverage.
 *
 * Proves the simplified hierarchy landed without touching forwarding logic:
 * - 3-step flow: ReplyFlow number -> carrier -> hero dial code
 * - mental-model strip at the top
 * - secondary help (voicemail / disable / troubleshooting) demoted under "Need help?"
 * - modal CTA renamed to "Continue to Final Test"
 * - Copy / Dial / carrier select / code generation all unchanged
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const readSrc = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf-8')

const helpCenter = readSrc('src/components/ForwardingHelpCenter.tsx')
const modal = readSrc('src/components/CallForwardingInstructions.tsx')
const setupCard = readSrc('src/components/BusinessPhoneSetupCard.tsx')

describe('Step-by-step hierarchy and copy', () => {
  it('keeps the three numbered steps in order: number -> carrier -> dial code', () => {
    // note: step 3 renders via getCarrierInstructions() which is defined above
    // the returned JSX — assert on the call site's position, not the title.
    const i1 = helpCenter.indexOf('Your ReplyFlow number')
    const i2 = helpCenter.indexOf('Choose your carrier')
    const i3 = helpCenter.indexOf('{selectedCarrier && getCarrierInstructions()}')
    expect(i1).toBeGreaterThan(-1)
    expect(i2).toBeGreaterThan(i1)
    expect(i3).toBeGreaterThan(i2)
    expect(helpCenter).toContain('Dial this code from your business phone')
  })

  it('uses the simplified helper copy for steps 1 and 2', () => {
    expect(helpCenter).toContain('This is where your missed calls will go.')
    expect(helpCenter).toContain('correct forwarding code for your phone provider')
    // old, denser helpers removed
    expect(helpCenter).not.toContain('Calls forwarded here are handled by ReplyFlow.')
    expect(helpCenter).not.toContain('Select your phone provider to see the correct forwarding code.')
  })

  it('primary content appears before the Need help? section', () => {
    const dialStep = helpCenter.indexOf('Dial this code from your business phone')
    const needHelp = helpCenter.indexOf('Need help?')
    expect(dialStep).toBeGreaterThan(-1)
    expect(needHelp).toBeGreaterThan(dialStep)
  })
})

describe('Hero forwarding code', () => {
  it('renders the generated dial code in large hero type', () => {
    expect(helpCenter).toContain('generateForwardingCode(selectedCarrierInfo.dialCode, twilioNumber)')
    expect(helpCenter).toMatch(/code[^>]*text-2xl[^>]*font-bold[^>]*font-mono/)
  })

  it('keeps Copy and Dial directly under the code', () => {
    const hero = helpCenter.slice(
      helpCenter.indexOf('generateForwardingCode(selectedCarrierInfo.dialCode'),
      helpCenter.indexOf('After entering the code'),
    )
    expect(hero).toContain('handleCopyCode(dialCode)')
    expect(hero).toContain('handleOpenDialer(dialCode)')
    expect(hero).toContain('Copy')
    expect(hero).toContain('Dial')
  })

  it('shows the Call/Send hint under the code without over-explaining', () => {
    expect(helpCenter).toContain('After entering the code, press Call/Send.')
    // the generic carrier note ("Press Send/Call after entering the code") is
    // deduplicated so it doesn't render twice
    expect(helpCenter).toContain("selectedCarrierInfo.notes !== 'Press Send/Call after entering the code'")
  })
})

describe('Mental model visual', () => {
  it('renders the missed-call flow strip near the top of the help center', () => {
    const strip = helpCenter.indexOf('ReplyFlow answers')
    const step1 = helpCenter.indexOf('Your ReplyFlow number')
    expect(strip).toBeGreaterThan(-1)
    expect(strip).toBeLessThan(step1)
    expect(helpCenter).toContain('Missed call')
    expect(helpCenter).toContain('Forwarded to ReplyFlow')
  })

  it('renders the same strip in BusinessPhoneSetupCard', () => {
    expect(setupCard).toContain('Missed call → Forwarded to ReplyFlow → ReplyFlow answers')
  })
})

describe('Secondary help is demoted but preserved', () => {
  it('groups voicemail note, disable code, and troubleshooting under Need help?', () => {
    const needHelp = helpCenter.indexOf('Need help?')
    const after = helpCenter.slice(needHelp)
    expect(after).toContain('Already use voicemail?')
    expect(after).toContain('Disable Call Forwarding')
    expect(after).toContain('Troubleshooting')
    // voicemail note stays subtle, non-mandatory
    expect(after).toContain('existing voicemail')
    expect(helpCenter).not.toMatch(/must disable voicemail/i)
    expect(helpCenter).not.toMatch(/always disable/i)
  })

  it('disable-forwarding section remains collapsed behind a toggle', () => {
    expect(helpCenter).toContain("toggleSection('disableForwarding')")
    expect(helpCenter).toContain("expandedSection === 'disableForwarding'")
    expect(helpCenter).toContain("toggleSection('troubleshooting')")
  })
})

describe('Bottom CTA', () => {
  it('replaces "I\'ve Enabled Forwarding" with "Continue to Final Test"', () => {
    expect(modal).toContain('Continue to Final Test')
    expect(modal).not.toContain("I've Enabled Forwarding")
    expect(modal).toContain('finished dialing the code on your business phone')
  })

  it('confirm behavior unchanged — still calls handleConfirmForwarding', () => {
    expect(modal).toContain('handleConfirmForwarding')
    expect(modal).toContain('confirm-forwarding-instructions')
  })
})

describe('Forwarding logic unchanged', () => {
  it('carrier codes, select options, and copy/dial handlers are intact', () => {
    expect(helpCenter).toContain("dialCode: '*71 {{TWILIO_NUMBER}}'")
    expect(helpCenter).toContain("dialCode: '**61*{{TWILIO_NUMBER}}#'")
    expect(helpCenter).toContain('CARRIER_OPTIONS')
    expect(helpCenter).toContain('navigator.clipboard.writeText(code)')
    expect(helpCenter).toContain('window.open(telUrl')
    // portal-config carriers still get no Dial button
    expect(helpCenter).toContain("'ringcentral', 'grasshopper', 'google_voice', 'other'")
  })

  it('BusinessPhoneSetupCard still copies *71 + ReplyFlow number', () => {
    expect(setupCard).toContain('`*71 ${formatPhoneNumber(forwardingNumber)}`')
    expect(setupCard).toContain('navigator.clipboard.writeText(code)')
    // hero shows the same single dial string
    expect(setupCard).toContain('*71 {formatPhoneNumber(business.twilio_phone_number)}')
  })
})
