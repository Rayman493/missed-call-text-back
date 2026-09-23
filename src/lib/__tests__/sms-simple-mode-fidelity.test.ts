/**
 * Simple Mode SMS fidelity — Michael Thompson retest (CA110a1903252020d442371be68e811cd7)
 *
 * The customer SMS must agree with Customer Context on the same captured fields:
 * - Request shows the caller's actual reason, not the internal service title
 *   ("someone to fix a leaking kitchen sink", not "Plumbing Repair").
 * - Details is omitted entirely when no additional details were volunteered —
 *   the request text is never used as a Details fallback.
 * - Desired completion and preferred callback preserve the caller's natural
 *   phrases ("Sometime in the next couple days would be great",
 *   "As soon as you can") — no paraphrase into different wording.
 */

import { describe, it, expect } from 'vitest'
import { formatAiIntakeSummaryWithMode } from '@/lib/ai-intake-formatter'
import { normalizeExtractedInfo } from '@/lib/ai-field-mapping'

// The persisted extracted_info shape written by Simple Mode for the retest call.
const simpleExtractedInfo = {
  customerName: 'Michael Thompson',
  customerPhone: '+14122533598',
  serviceRequested: 'someone to fix a leaking kitchen sink',
  importantDetails: '',
  additionalDetails: '',
  serviceAddress: '1632 South Pond Drive',
  desiredCompletionTime: 'Sometime in the next couple days would be great',
  desiredCompletion: 'Sometime in the next couple days would be great',
  callbackTime: 'As soon as you can',
  nameRefused: false,
  locationRefused: false,
  serviceLocationType: 'onsite',
  intakeMode: 'simple',
}

describe('Simple Mode SMS fidelity', () => {
  it('intakeMode survives normalizeExtractedInfo', () => {
    const normalized = normalizeExtractedInfo(simpleExtractedInfo)
    expect(normalized.intakeMode).toBe('simple')
    expect(normalized.reasonForCalling).toBe('Someone to fix a leaking kitchen sink')
  })

  it('shows the captured request, not the internal service classification', () => {
    const sms = formatAiIntakeSummaryWithMode(normalizeExtractedInfo(simpleExtractedInfo), '+14122533598', 'Test Business')
    expect(sms).toContain('Request:')
    expect(sms).toMatch(/Request:.*[Ll]eaking kitchen sink/)
    expect(sms).not.toContain('Plumbing Repair')
  })

  it('omits the Details line entirely when no details were volunteered', () => {
    const sms = formatAiIntakeSummaryWithMode(normalizeExtractedInfo(simpleExtractedInfo), '+14122533598', 'Test Business')
    expect(sms).not.toContain('Details:')
    expect(sms).not.toContain('No additional details')
  })

  it('preserves natural timing and callback phrasing verbatim', () => {
    const sms = formatAiIntakeSummaryWithMode(normalizeExtractedInfo(simpleExtractedInfo), '+14122533598', 'Test Business')
    expect(sms).toContain('Desired completion: Sometime in the next couple days would be great')
    expect(sms).toContain('Preferred callback: As soon as you can')
  })

  it('still shows genuine volunteered details when provided', () => {
    const withDetails = {
      ...simpleExtractedInfo,
      importantDetails: 'It has been dripping under the cabinet for two weeks',
      additionalDetails: 'It has been dripping under the cabinet for two weeks',
    }
    const sms = formatAiIntakeSummaryWithMode(normalizeExtractedInfo(withDetails), '+14122533598', 'Test Business')
    expect(sms).toContain('Details: It has been dripping under the cabinet for two weeks')
  })

  it('does not duplicate the request into Details', () => {
    const dup = {
      ...simpleExtractedInfo,
      importantDetails: 'someone to fix a leaking kitchen sink',
      additionalDetails: 'someone to fix a leaking kitchen sink',
    }
    const sms = formatAiIntakeSummaryWithMode(normalizeExtractedInfo(dup), '+14122533598', 'Test Business')
    expect(sms).not.toContain('Details:')
  })
})
