import { describe, it, expect } from 'vitest'
import {
  formatAdaptiveIntakeSms,
  normalizeBusinessNameForSms,
  normalizeCustomerNameForSms,
  polishTimingWrapper,
  normalizeCallbackTime,
  normalizeAddressForStorage,
  generateCanonicalRequestTitle
} from '../ai-intake-formatter'

describe('normalizeBusinessNameForSms', () => {
  it('trims leading and trailing whitespace', () => {
    expect(normalizeBusinessNameForSms('  Production  ')).toBe('Production');
  })

  it('collapses internal whitespace', () => {
    expect(normalizeBusinessNameForSms('Acme   Services')).toBe('Acme Services');
  })

  it('rejects placeholder names', () => {
    expect(normalizeBusinessNameForSms('Unknown')).toBeNull();
    expect(normalizeBusinessNameForSms('Not Provided')).toBeNull();
    expect(normalizeBusinessNameForSms('Not Collected')).toBeNull();
    expect(normalizeBusinessNameForSms('N/A')).toBeNull();
    expect(normalizeBusinessNameForSms('Caller')).toBeNull();
    expect(normalizeBusinessNameForSms('Customer')).toBeNull();
  })

  it('accepts valid business names', () => {
    expect(normalizeBusinessNameForSms('Production')).toBe('Production');
    expect(normalizeBusinessNameForSms('Acme Services')).toBe('Acme Services');
  })

  it('returns null for empty or null values', () => {
    expect(normalizeBusinessNameForSms('')).toBeNull();
    expect(normalizeBusinessNameForSms(null)).toBeNull();
    expect(normalizeBusinessNameForSms(undefined)).toBeNull();
  })
})

describe('normalizeCustomerNameForSms', () => {
  it('rejects placeholder names', () => {
    expect(normalizeCustomerNameForSms('Unknown')).toBeNull();
    expect(normalizeCustomerNameForSms('Not Provided')).toBeNull();
    expect(normalizeCustomerNameForSms('Caller')).toBeNull();
  })

  it('accepts valid customer names', () => {
    expect(normalizeCustomerNameForSms('Ryan')).toBe('Ryan');
    expect(normalizeCustomerNameForSms('John Smith')).toBe('John Smith');
  })

  it('returns null for empty or null values', () => {
    expect(normalizeCustomerNameForSms('')).toBeNull();
    expect(normalizeCustomerNameForSms(null)).toBeNull();
  })
})

describe('polishTimingWrapper', () => {
  it('removes conversational wrappers', () => {
    expect(polishTimingWrapper('Sometime in the next month, if that\'s possible')).toBe('Next month');
    expect(polishTimingWrapper('Sometime in the afternoon')).toBe('Sometime in the afternoon');
    expect(polishTimingWrapper('As soon as you guys can get here')).toBe('As soon as possible');
    expect(polishTimingWrapper('As soon as you can')).toBe('As soon as possible');
    expect(polishTimingWrapper('Whenever you can')).toBe('Whenever');
  })

  it('preserves meaningful timing', () => {
    expect(polishTimingWrapper('Wednesday')).toBe('Wednesday');
    expect(polishTimingWrapper('This week')).toBe('This week');
    expect(polishTimingWrapper('Next week')).toBe('Next week');
    expect(polishTimingWrapper('Morning')).toBe('Morning');
    expect(polishTimingWrapper('Evening')).toBe('Evening');
  })

  it('sentence capitalizes', () => {
    expect(polishTimingWrapper('next month')).toBe('Next month');
  })

  it('returns Not collected for empty values', () => {
    expect(polishTimingWrapper('')).toBe('Not collected');
    expect(polishTimingWrapper(null)).toBe('Not collected');
  })
})

describe('formatAdaptiveIntakeSms - Service field summarization', () => {
  it('produces concise summary for verbose plumbing request', () => {
    const intakeData = {
      customerName: 'Ryan',
      reasonForCalling: 'I was looking to get some new pipes installed in my new house. It\'s getting built right now, and I\'m trying to get the the piping all set up. And I was recommended to you guys by a friend. So I\'d like you guys to come do it for my house',
      addressOrLocation: '1632 South Pine Drive',
      desiredCompletionTime: 'Within the next month',
      preferredCallbackTime: 'Afternoon'
    };

    const result = formatAdaptiveIntakeSms(
      intakeData,
      '+15551234567',
      'Production',
      '',
      'onsite'
    );

    // Should use canonical title instead of raw transcript
    expect(result).toContain('• Service:');
    // Should not contain raw conversational filler
    expect(result).not.toContain('I was looking to');
    expect(result).not.toContain('recommended by a friend');
    expect(result).not.toContain('you guys');
    // Should contain concise service description (much shorter than original)
    const serviceLine = result.match(/• Service: (.+)/)?.[1] || '';
    expect(serviceLine.length).toBeLessThan(50); // Concise
  })

  it('removes duplicate words like "the the"', () => {
    const intakeData = {
      customerName: 'Ryan',
      reasonForCalling: 'I need the the plumbing fixed',
      addressOrLocation: '1632 South Pine Drive',
      desiredCompletionTime: 'Within the next month',
      preferredCallbackTime: 'Afternoon'
    };

    const result = formatAdaptiveIntakeSms(
      intakeData,
      '+15551234567',
      'Production',
      '',
      'onsite'
    );

    expect(result).not.toContain('the the');
  })

  it('excludes conversational framing and referral commentary', () => {
    const intakeData = {
      customerName: 'Ryan',
      reasonForCalling: 'I was recommended by a friend to get my grass cut. They said you guys do good work.',
      addressOrLocation: '1632 South Pine Drive',
    };

    const result = formatAdaptiveIntakeSms(
      intakeData,
      '+15551234567',
      'Production',
      '',
      'onsite'
    );

    expect(result).not.toContain('recommended by a friend');
    expect(result).not.toContain('they said you guys');
  })
})

describe('formatAdaptiveIntakeSms - Business name handling', () => {
  it('trims business name and avoids space before punctuation', () => {
    const intakeData = {
      customerName: 'Ryan',
      reasonForCalling: 'Piano lessons',
    };

    const result = formatAdaptiveIntakeSms(
      intakeData,
      '+15551234567',
      '  Production  ',
      '',
      'onsite'
    );

    expect(result).toContain('Thanks for reaching out to Production.');
    expect(result).not.toContain('Production .');
  })

  it('rejects placeholder business names', () => {
    const intakeData = {
      customerName: 'Ryan',
      reasonForCalling: 'Piano lessons',
    };

    const result = formatAdaptiveIntakeSms(
      intakeData,
      '+15551234567',
      'Unknown',
      '',
      'onsite'
    );

    expect(result).not.toContain('Unknown');
    expect(result).toContain('Thanks for reaching out.');
  })
})

describe('formatAdaptiveIntakeSms - Customer name handling', () => {
  it('uses normalized customer name when available', () => {
    const intakeData = {
      customerName: 'Ryan',
      reasonForCalling: 'Piano lessons',
    };

    const result = formatAdaptiveIntakeSms(
      intakeData,
      '+15551234567',
      'Production',
      '',
      'onsite'
    );

    expect(result).toContain('Hi Ryan!');
  })

  it('rejects placeholder customer names', () => {
    const intakeData = {
      customerName: 'Unknown',
      reasonForCalling: 'Piano lessons',
    };

    const result = formatAdaptiveIntakeSms(
      intakeData,
      '+15551234567',
      'Production',
      '',
      'onsite'
    );

    expect(result).not.toContain('Hi Unknown!');
    expect(result).toContain('Hi!');
  })

  it('uses natural generic greeting when name unavailable', () => {
    const intakeData = {
      reasonForCalling: 'Piano lessons',
    };

    const result = formatAdaptiveIntakeSms(
      intakeData,
      '+15551234567',
      'Production',
      '',
      'onsite'
    );

    expect(result).toContain('Hi!');
  })
})

describe('formatAdaptiveIntakeSms - Spacing and formatting', () => {
  it('includes exactly one blank line between fields', () => {
    const intakeData = {
      customerName: 'Ryan',
      reasonForCalling: 'Piano lessons',
      addressOrLocation: '1632 South Pine Drive',
      desiredCompletionTime: 'Within the next month',
      preferredCallbackTime: 'Afternoon'
    };

    const result = formatAdaptiveIntakeSms(
      intakeData,
      '+15551234567',
      'Production',
      '',
      'onsite'
    );

    // Check for single blank lines between fields (double newline in string)
    expect(result).toMatch(/Service:.*\n\n• Address:/s);
    expect(result).toMatch(/Address:.*\n\n• Preferred timing:/s);
  })

  it('does not produce duplicate blank lines when optional fields absent', () => {
    const intakeData = {
      customerName: 'Ryan',
      reasonForCalling: 'Piano lessons',
    };

    const result = formatAdaptiveIntakeSms(
      intakeData,
      '+15551234567',
      'Production',
      '',
      'onsite'
    );

    // Should not have triple newlines
    expect(result).not.toContain('\n\n\n');
  })

  it('has no leading or trailing whitespace', () => {
    const intakeData = {
      customerName: 'Ryan',
      reasonForCalling: 'Piano lessons',
    };

    const result = formatAdaptiveIntakeSms(
      intakeData,
      '+15551234567',
      'Production',
      '',
      'onsite'
    );

    expect(result).toEqual(result.trim());
  })
})

describe('formatAdaptiveIntakeSms - Complete vs partial intake closings', () => {
  it('uses complete-intake closing for full intake', () => {
    const intakeData = {
      customerName: 'Ryan',
      reasonForCalling: 'Piano lessons',
      addressOrLocation: '1632 South Pine Drive',
      desiredCompletionTime: 'Within the next month',
      preferredCallbackTime: 'Afternoon'
    };

    const result = formatAdaptiveIntakeSms(
      intakeData,
      '+15551234567',
      'Production',
      '',
      'onsite'
    );

    expect(result).toContain('We\'ve shared this with the team, and they\'ll follow up soon. Reply here if anything changes.');
  })

  it('uses partial-intake closing for partial intake', () => {
    const intakeData = {
      customerName: 'Ryan',
      reasonForCalling: 'Piano lessons',
      addressOrLocation: '1632 South Pine Drive',
    };

    const result = formatAdaptiveIntakeSms(
      intakeData,
      '+15551234567',
      'Production',
      '',
      'onsite'
    );

    expect(result).toContain('We\'ve shared these details with the team, and they\'ll follow up soon. Reply here if you\'d like to add anything.');
  })
})

describe('formatAdaptiveIntakeSms - Address handling by service location mode', () => {
  it('includes address for onsite mode when captured', () => {
    const intakeData = {
      customerName: 'Ryan',
      reasonForCalling: 'Piano lessons',
      addressOrLocation: '1632 South Pine Drive',
    };

    const result = formatAdaptiveIntakeSms(
      intakeData,
      '+15551234567',
      'Production',
      '',
      'onsite'
    );

    expect(result).toContain('• Address: 1632 South Pine Drive');
  })

  it('does not include address for remote mode', () => {
    const intakeData = {
      customerName: 'Ryan',
      reasonForCalling: 'Piano lessons',
      addressOrLocation: '1632 South Pine Drive',
    };

    const result = formatAdaptiveIntakeSms(
      intakeData,
      '+15551234567',
      'Production',
      '',
      'remote'
    );

    expect(result).not.toContain('• Address:');
  })

  it('does not include address for customer_comes_to_business mode', () => {
    const intakeData = {
      customerName: 'Ryan',
      reasonForCalling: 'Piano lessons',
      addressOrLocation: '1632 South Pine Drive',
    };

    const result = formatAdaptiveIntakeSms(
      intakeData,
      '+15551234567',
      'Production',
      '',
      'customer_comes_to_business'
    );

    expect(result).not.toContain('• Address:');
  })
})

describe('formatAdaptiveIntakeSms - Timing normalization', () => {
  it('polishes conversational timing wrappers', () => {
    const intakeData = {
      customerName: 'Ryan',
      reasonForCalling: 'Piano lessons',
      desiredCompletionTime: 'Sometime in the next month, if that\'s possible',
      preferredCallbackTime: 'Sometime in the afternoon'
    };

    const result = formatAdaptiveIntakeSms(
      intakeData,
      '+15551234567',
      'Production',
      '',
      'onsite'
    );

    expect(result).toContain('Next month');
    expect(result).toContain('Afternoon');
  })

  it('preserves vague timing without converting to firm appointment', () => {
    const intakeData = {
      customerName: 'Ryan',
      reasonForCalling: 'Piano lessons',
      desiredCompletionTime: 'Whenever',
    };

    const result = formatAdaptiveIntakeSms(
      intakeData,
      '+15551234567',
      'Production',
      '',
      'onsite'
    );

    expect(result).toContain('Whenever');
    expect(result).not.toContain('Specific date');
  })
})

describe('formatAdaptiveIntakeSms - Raw data preservation', () => {
  it('uses canonical title for SMS but does not modify input data', () => {
    const intakeData = {
      customerName: 'Ryan',
      reasonForCalling: 'I was looking to get some new pipes installed in my new house. It\'s getting built right now, and I\'m trying to get the the piping all set up. And I was recommended to you guys by a friend. So I\'d like you guys to come do it for my house',
      addressOrLocation: '1632 South Pine Drive',
      desiredCompletionTime: 'Within the next month',
      preferredCallbackTime: 'Afternoon'
    };

    const originalReason = intakeData.reasonForCalling;

    formatAdaptiveIntakeSms(
      intakeData,
      '+15551234567',
      'Production',
      '',
      'onsite'
    );

    // Original input should be unchanged
    expect(intakeData.reasonForCalling).toBe(originalReason);
  })

  it('demonstrated production input shows Service: New-Construction Plumbing Installation', () => {
    const intakeData = {
      customerName: 'Ryan',
      reasonForCalling: 'I was looking to get some new pipes installed in my new house. It\'s getting built right now, and I\'m trying to get the the piping all set up. And I was recommended to you guys by a friend. So I\'d like you guys to come do it for my house',
      addressOrLocation: '1632 South Pine Drive',
      desiredCompletionTime: 'Within the next month',
      preferredCallbackTime: 'Afternoon'
    };

    const result = formatAdaptiveIntakeSms(
      intakeData,
      '+15551234567',
      'Production',
      '',
      'onsite'
    );

    // Should show the canonical title in the Service field
    expect(result).toContain('Service: New-Construction Plumbing Installation');
  })
})

describe('formatAdaptiveIntakeSms - Formatter fallback', () => {
  it('falls back to cleaned non-empty request when summarization fails', () => {
    const intakeData = {
      customerName: 'Ryan',
      reasonForCalling: 'General service request',
    };

    const result = formatAdaptiveIntakeSms(
      intakeData,
      '+15551234567',
      'Production',
      '',
      'onsite'
    );

    // Should still have a service field, not empty
    expect(result).toContain('• Service:');
  })
})

describe('generateCanonicalRequestTitle - Demonstrated case', () => {
  it('summarizes verbose plumbing request', () => {
    const verboseRequest = 'I was looking to get some new pipes installed in my new house. It\'s getting built right now, and I\'m trying to get the the piping all set up. And I was recommended to you guys by a friend. So I\'d like you guys to come do it for my house';

    const result = generateCanonicalRequestTitle(verboseRequest);

    // Should be concise
    expect(result.length).toBeLessThan(verboseRequest.length / 2);
    // Should not contain conversational filler
    expect(result).not.toContain('I was looking to');
    expect(result).not.toContain('recommended by a friend');
    expect(result).not.toContain('you guys');
    expect(result).not.toContain('the the');
    // Should contain service-related terms
    expect(result).toMatch(/Plumbing|Pipes|Installation/i);
  })

  it('always returns non-empty', () => {
    expect(generateCanonicalRequestTitle('')).toBe('General Service');
    expect(generateCanonicalRequestTitle(null)).toBe('General Service');
    expect(generateCanonicalRequestTitle(undefined)).toBe('General Service');
  })
})

describe('polishTimingWrapper - Completion timing', () => {
  it('removes I\'d like it completed prefix', () => {
    expect(polishTimingWrapper('I\'d like it completed within the next month')).toBe('Within the next month');
  })

  it('removes I would like it completed prefix', () => {
    expect(polishTimingWrapper('I would like it completed within the next month')).toBe('Within the next month');
  })

  it('removes I\'d like it done prefix', () => {
    expect(polishTimingWrapper('I\'d like it done within the next month')).toBe('Within the next month');
  })

  it('removes I would like it done prefix', () => {
    expect(polishTimingWrapper('I would like it done within the next month')).toBe('Within the next month');
  })

  it('removes I\'d like to have it finished prefix', () => {
    expect(polishTimingWrapper('I\'d like to have it finished by Friday')).toBe('By friday');
  })

  it('removes I would like to have it finished prefix', () => {
    expect(polishTimingWrapper('I would like to have it finished by Friday')).toBe('By friday');
  })

  it('converts There\'s no rush to No rush', () => {
    expect(polishTimingWrapper('There\'s no rush')).toBe('No rush');
  })

  it('preserves explicit dates', () => {
    expect(polishTimingWrapper('I need it done on January 15th')).toBe('On january 15th');
  })

  it('preserves meaningful ranges', () => {
    expect(polishTimingWrapper('Between 9 AM and 5 PM')).toBe('Between 9 am and 5 pm');
  })

  it('preserves before, after, by, and within', () => {
    expect(polishTimingWrapper('Before the end of the week')).toBe('Before the end of the week');
    expect(polishTimingWrapper('After the permit is approved')).toBe('After the permit is approved');
    expect(polishTimingWrapper('By next Friday')).toBe('By next friday');
    expect(polishTimingWrapper('Within the next month')).toBe('Within the next month');
  })

  it('preserves conditions', () => {
    expect(polishTimingWrapper('Once materials are available')).toBe('Once materials are available');
  })

  it('preserves vague timing when caller was vague', () => {
    expect(polishTimingWrapper('Whenever works')).toBe('Whenever works');
  })

  it('does not fabricate appointments or deadlines', () => {
    expect(polishTimingWrapper('I need it done soon')).not.toContain('specific date');
    expect(polishTimingWrapper('As soon as possible')).not.toContain('tomorrow');
  })
})

describe('normalizeCallbackTime - Callback timing', () => {
  it('removes are best for calling me suffix', () => {
    expect(normalizeCallbackTime('Afternoons are best for calling me')).toBe('Afternoons');
  })

  it('removes is best for calling me suffix', () => {
    expect(normalizeCallbackTime('Afternoons is best for calling me')).toBe('Afternoons');
  })

  it('removes are best suffix', () => {
    expect(normalizeCallbackTime('Afternoons are best')).toBe('Afternoons');
  })

  it('removes is best suffix', () => {
    expect(normalizeCallbackTime('Afternoons is best')).toBe('Afternoons');
  })

  it('removes work best suffix', () => {
    expect(normalizeCallbackTime('Mornings work best')).toBe('Mornings');
  })

  it('removes works best suffix', () => {
    expect(normalizeCallbackTime('Mornings works best')).toBe('Mornings');
  })

  it('removes you can call me prefix', () => {
    expect(normalizeCallbackTime('You can call me in the evening')).toBe('In the evening');
  })

  it('removes call me prefix', () => {
    expect(normalizeCallbackTime('Call me after 3 PM')).toBe('After 3 pm');
  })

  it('preserves meaningful qualifiers', () => {
    expect(normalizeCallbackTime('Afternoons except Tuesdays')).toBe('Afternoons except tuesdays');
    expect(normalizeCallbackTime('After 3 PM, but not after 6 PM')).toBe('After 3 pm, but not after 6 pm');
  })

  it('preserves specific times', () => {
    expect(normalizeCallbackTime('Between 1 and 3 PM')).toBe('Between 1 and 3 pm');
  })

  it('preserves anytime', () => {
    expect(normalizeCallbackTime('Anytime is fine')).toBe('Anytime');
  })

  it('does not invent AM/PM when uncertain', () => {
    expect(normalizeCallbackTime('Sometime in the afternoon')).toBe('Afternoon');
    expect(normalizeCallbackTime('Call me at 3')).not.toContain('AM');
    expect(normalizeCallbackTime('Call me at 3')).not.toContain('PM');
  })

  it('returns trimmed original when normalization is unsafe', () => {
    expect(normalizeCallbackTime('Whenever you can, but not too early')).toBe('Whenever you can, but not too early');
  })
})

describe('formatAdaptiveIntakeSms - Live demonstrated intake', () => {
  it('produces exact required SMS for demonstrated live intake', () => {
    const intakeData = {
      customerName: 'Ryan',
      reasonForCalling: 'I was looking to get some new pipes installed in my new house. It\'s getting built right now, and I\'m trying to get the the piping all set up. And I was recommended to you guys by a friend. So I\'d like you guys to come do it for my house',
      addressOrLocation: '1632 South Pine Drive',
      desiredCompletionTime: 'I\'d like it completed within the next month',
      preferredCallbackTime: 'Afternoons are best for calling me'
    };

    const result = formatAdaptiveIntakeSms(
      intakeData,
      '+15551234567',
      'Production',
      '',
      'onsite'
    );

    // Check exact required output
    expect(result).toContain('Hi Ryan! Thanks for reaching out to Production.');
    expect(result).toContain('• Service: New-Construction Plumbing Installation');
    expect(result).toContain('• Address: 1632 South Pine Drive');
    expect(result).toContain('• Preferred timing: Within the next month');
    expect(result).toContain('• Best callback time: Afternoons');
    expect(result).toContain('We\'ve shared this with the team, and they\'ll follow up soon. Reply here if anything changes.');

    // Verify conversational values are NOT in the SMS
    expect(result).not.toContain('I\'d like it completed');
    expect(result).not.toContain('are best for calling me');

    // Verify spacing is correct (exactly one blank line between fields)
    expect(result).toMatch(/Service:.*\n\n• Address:/s);
    expect(result).toMatch(/Address:.*\n\n• Preferred timing:/s);
    expect(result).toMatch(/Preferred timing:.*\n\n• Best callback time:/s);
  })
})

describe('normalizeAddressForStorage - Address punctuation', () => {
  it('removes trailing period', () => {
    expect(normalizeAddressForStorage('1532 Southpine Drive.')).toBe('1532 Southpine Drive');
  })

  it('removes trailing comma', () => {
    expect(normalizeAddressForStorage('1532 Southpine Drive,')).toBe('1532 Southpine Drive');
  })

  it('removes trailing semicolon', () => {
    expect(normalizeAddressForStorage('1532 Southpine Drive;')).toBe('1532 Southpine Drive');
  })

  it('removes trailing colon', () => {
    expect(normalizeAddressForStorage('1532 Southpine Drive:')).toBe('1532 Southpine Drive');
  })

  it('removes trailing exclamation mark', () => {
    expect(normalizeAddressForStorage('1532 Southpine Drive!')).toBe('1532 Southpine Drive');
  })

  it('removes trailing question mark', () => {
    expect(normalizeAddressForStorage('1532 Southpine Drive?')).toBe('1532 Southpine Drive');
  })

  it('preserves internal periods', () => {
    expect(normalizeAddressForStorage('123 W. Main St.')).toBe('123 W. Main St');
  })

  it('preserves internal commas', () => {
    expect(normalizeAddressForStorage('Apt. 4B, 123 Main St.')).toBe('Apt. 4B, 123 Main St');
  })

  it('preserves hyphens', () => {
    expect(normalizeAddressForStorage('12-14 North Avenue.')).toBe('12-14 North Avenue');
  })

  it('preserves apartment details', () => {
    expect(normalizeAddressForStorage('42 W. Main St., Apt. 3B.')).toBe('42 W. Main St., Apt. 3B');
  })

  it('preserves suite details', () => {
    expect(normalizeAddressForStorage('100 Route 51, Suite 200.')).toBe('100 Route 51, Suite 200');
  })

  it('handles addresses without trailing punctuation', () => {
    expect(normalizeAddressForStorage('123 W. Main St., Apt. 4B')).toBe('123 W. Main St., Apt. 4B');
  })

  it('handles null', () => {
    expect(normalizeAddressForStorage(null)).toBe('');
  })

  it('handles undefined', () => {
    expect(normalizeAddressForStorage(undefined)).toBe('');
  })

  it('handles empty string', () => {
    expect(normalizeAddressForStorage('')).toBe('');
  })

  it('trims whitespace', () => {
    expect(normalizeAddressForStorage('  1532 Southpine Drive.  ')).toBe('1532 Southpine Drive');
  })
})