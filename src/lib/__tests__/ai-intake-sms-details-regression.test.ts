/**
 * SMS Formatter Additional Details Regression Test
 *
 * Tests that when importantDetails is present in canonical extracted_info,
 * the SMS summary includes it and does NOT show "Any helpful details" as missing.
 */

import { describe, it, expect } from 'vitest';
import { formatAdaptiveIntakeSms } from '../ai-intake-formatter';

describe('SMS Formatter Additional Details Regression', () => {
  it('should include Details in SMS when importantDetails is populated', () => {
    const intakeData = {
      customerName: 'Ryan',
      serviceRequested: 'Fence Installation',
      importantDetails: 'Existing wooden privacy fence is old and rotten; wants a white vinyl replacement.',
      additionalDetails: 'Existing wooden privacy fence is old and rotten; wants a white vinyl replacement.',
      serviceAddress: '1632 South Pine Drive',
      desiredCompletionTime: 'Next month',
      callbackTime: 'In the mornings, before 11am'
    };

    const sms = formatAdaptiveIntakeSms(intakeData, '+15551234567', 'Test Business');

    expect(sms).toContain('Fence Installation');
    expect(sms).toContain('Details:');
    expect(sms).toContain('Existing wooden privacy fence is old and rotten');
    expect(sms).not.toContain('Any helpful details');
    expect(sms).not.toContain('Any important details');
  });

  it('should include Details when using additionalDetails alias', () => {
    const intakeData = {
      customerName: 'Ryan',
      serviceRequested: 'Fence Installation',
      additionalDetails: 'Existing wooden privacy fence is old and rotten; wants a white vinyl replacement.',
      serviceAddress: '1632 South Pine Drive',
      desiredCompletionTime: 'Next month',
      callbackTime: 'In the mornings, before 11am'
    };

    const sms = formatAdaptiveIntakeSms(intakeData, '+15551234567', 'Test Business');

    expect(sms).toContain('Fence Installation');
    expect(sms).toContain('Details:');
    expect(sms).toContain('Existing wooden privacy fence is old and rotten');
    expect(sms).not.toContain('Any helpful details');
  });

  it('should include Details when using additional_details alias', () => {
    const intakeData = {
      customerName: 'Ryan',
      serviceRequested: 'Fence Installation',
      additional_details: 'Existing wooden privacy fence is old and rotten; wants a white vinyl replacement.',
      serviceAddress: '1632 South Pine Drive',
      desiredCompletionTime: 'Next month',
      callbackTime: 'In the mornings, before 11am'
    };

    const sms = formatAdaptiveIntakeSms(intakeData, '+15551234567', 'Test Business');

    expect(sms).toContain('Fence Installation');
    expect(sms).toContain('Details:');
    expect(sms).toContain('Existing wooden privacy fence is old and rotten');
    expect(sms).not.toContain('Any helpful details');
  });

  it('should show missing details when importantDetails is empty', () => {
    const intakeData = {
      customerName: 'Ryan',
      serviceRequested: 'Fence Installation',
      importantDetails: '',
      serviceAddress: '1632 South Pine Drive',
      desiredCompletionTime: 'Next month',
      callbackTime: 'In the mornings, before 11am'
    };

    const sms = formatAdaptiveIntakeSms(intakeData, '+15551234567', 'Test Business');

    expect(sms).toContain('Fence Installation');
    // Should not show Details line since it's empty
    expect(sms).not.toContain('Details:');
    // May show "Any helpful details" as missing in incomplete intake
  });

  it('should handle simple no-detail case (Lawn Mowing)', () => {
    const intakeData = {
      customerName: 'Ryan',
      serviceRequested: 'Lawn Mowing',
      importantDetails: '',
      serviceAddress: '1632 South Pine Drive',
      desiredCompletionTime: 'Next month',
      callbackTime: 'In the mornings, before 11am'
    };

    const sms = formatAdaptiveIntakeSms(intakeData, '+15551234567', 'Test Business');

    expect(sms).toContain('Lawn Mowing');
    expect(sms).not.toContain('Details: Existing wooden'); // No fake details
  });
});