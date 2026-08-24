import { describe, it, expect } from 'vitest'
import { formatAiIntakeSummaryWithMode, formatAdaptiveIntakeSms } from '../ai-intake-formatter'

/**
 * SMS Spacing Regression Tests
 *
 * These tests verify that SMS confirmation messages have proper blank lines
 * between fields for better readability.
 */

describe('SMS Field Spacing - formatAiIntakeSummary', () => {
  it('TEST A - All five fields populated → exactly one blank line between each field', () => {
    const extractedInfo = {
      customerName: 'Ryan',
      reasonForCalling: 'Lawn Mowing',
      requestDetails: 'Half acre yard, equipment access challenges',
      addressOrLocation: '1632 South Pine Drive',
      desiredCompletionTime: 'Next two weeks',
      preferredCallbackTime: 'In the afternoon'
    }

    const sms = formatAiIntakeSummaryWithMode(extractedInfo, '+15551234567', 'iOS Final Testing')

    // Verify blank line after header
    expect(sms).toContain('Here\'s what we captured:\n\n•')

    // Count occurrences of \n\n• to verify blank lines between fields
    const blankLineBeforeBulletMatches = sms.match(/\n\n•/g)
    expect(blankLineBeforeBulletMatches?.length).toBeGreaterThanOrEqual(4) // At least 4 fields after first

    // Verify blank line before closing
    expect(sms).toMatch(/\n\nWe've shared/)

    // Verify no double blank lines (no \n\n\n)
    expect(sms).not.toContain('\n\n\n')
  })

  it('TEST B - Missing Details → remaining fields still have clean spacing', () => {
    const extractedInfo = {
      customerName: 'Ryan',
      reasonForCalling: 'Lawn Mowing',
      addressOrLocation: '1632 South Pine Drive',
      desiredCompletionTime: 'Next two weeks',
      preferredCallbackTime: 'In the afternoon'
    }

    const sms = formatAiIntakeSummaryWithMode(extractedInfo, '+15551234567', 'iOS Final Testing')

    // Verify blank line after header
    expect(sms).toContain('Here\'s what we captured:\n\n•')

    // Verify no double blank lines
    expect(sms).not.toContain('\n\n\n')
  })

  it('TEST C - Missing Address → no blank-gap artifact', () => {
    const extractedInfo = {
      customerName: 'Ryan',
      reasonForCalling: 'Lawn Mowing',
      requestDetails: 'Half acre yard',
      desiredCompletionTime: 'Next two weeks',
      preferredCallbackTime: 'In the afternoon'
    }

    const sms = formatAiIntakeSummaryWithMode(extractedInfo, '+15551234567', 'iOS Final Testing')

    // Verify blank line after header
    expect(sms).toContain('Here\'s what we captured:\n\n•')

    // Verify no double blank lines
    expect(sms).not.toContain('\n\n\n')
  })

  it('TEST D - Only Request populated → clean valid message', () => {
    const extractedInfo = {
      customerName: 'Ryan',
      reasonForCalling: 'Lawn Mowing'
    }

    const sms = formatAiIntakeSummaryWithMode(extractedInfo, '+15551234567', 'iOS Final Testing')

    // Verify blank line after header
    expect(sms).toContain('Here\'s what we captured:\n\n•')

    // Verify no double blank lines
    expect(sms).not.toContain('\n\n\n')
  })

  it('TEST E - Greeting separated from "Here\'s what we captured"', () => {
    const extractedInfo = {
      customerName: 'Ryan',
      reasonForCalling: 'Lawn Mowing'
    }

    const sms = formatAiIntakeSummaryWithMode(extractedInfo, '+15551234567', 'iOS Final Testing')

    // Verify blank line between greeting and field list
    expect(sms).toMatch(/\.\n\nHere's what we captured:/)
  })

  it('TEST F - Field list separated from closing', () => {
    const extractedInfo = {
      customerName: 'Ryan',
      reasonForCalling: 'Lawn Mowing',
      requestDetails: 'Half acre yard',
      addressOrLocation: '1632 South Pine Drive',
      desiredCompletionTime: 'Next two weeks',
      preferredCallbackTime: 'In the afternoon'
    }

    const sms = formatAiIntakeSummaryWithMode(extractedInfo, '+15551234567', 'iOS Final Testing')

    // Verify blank line between last field and closing (for complete intake)
    if (sms.includes('We\'ve shared this with the team')) {
      expect(sms).toMatch(/\n\nWe've shared this with the team/)
    }
  })

  it('TEST G - Existing values remain unchanged by formatting', () => {
    const extractedInfo = {
      customerName: 'Ryan',
      reasonForCalling: 'Lawn Mowing',
      requestDetails: 'Half acre yard, equipment access challenges',
      addressOrLocation: '1632 South Pine Drive',
      desiredCompletionTime: 'Next two weeks',
      preferredCallbackTime: 'In the afternoon'
    }

    const sms = formatAiIntakeSummaryWithMode(extractedInfo, '+15551234567', 'iOS Final Testing')

    // Verify field values are unchanged
    expect(sms).toContain('Ryan')
    expect(sms).toContain('Lawn Mowing')
    expect(sms).toContain('Half acre yard, equipment access challenges')
    expect(sms).toContain('1632 South Pine Drive')
    expect(sms).toContain('Next two weeks')
    expect(sms).toContain('In the afternoon')
  })
})

describe('SMS Field Spacing - formatAdaptiveIntakeSms', () => {
  it('TEST A - Adaptive SMS also has blank lines between fields', () => {
    const intakeData = {
      customerName: 'Ryan',
      serviceRequested: 'Lawn Mowing',
      additionalDetails: 'Half acre yard, equipment access challenges',
      serviceAddress: '1632 South Pine Drive',
      desiredCompletionTime: 'Next two weeks',
      callbackTime: 'In the afternoon'
    }

    const sms = formatAdaptiveIntakeSms(intakeData, '+15551234567', 'iOS Final Testing')

    // Verify blank line after header
    expect(sms).toContain('Here\'s what we captured:\n\n•')

    // Count occurrences of \n\n• to verify blank lines between fields
    const blankLineBeforeBulletMatches = sms.match(/\n\n•/g)
    expect(blankLineBeforeBulletMatches?.length).toBeGreaterThanOrEqual(4)

    // Verify no double blank lines
    expect(sms).not.toContain('\n\n\n')
  })

  it('TEST B - Adaptive SMS missing fields still has clean spacing', () => {
    const intakeData = {
      customerName: 'Ryan',
      serviceRequested: 'Lawn Mowing',
      serviceAddress: '1632 South Pine Drive',
      desiredCompletionTime: 'Next two weeks',
      callbackTime: 'In the afternoon'
    }

    const sms = formatAdaptiveIntakeSms(intakeData, '+15551234567', 'iOS Final Testing')

    // Verify blank line after header
    expect(sms).toContain('Here\'s what we captured:\n\n•')

    // Verify no double blank lines
    expect(sms).not.toContain('\n\n\n')
  })
})