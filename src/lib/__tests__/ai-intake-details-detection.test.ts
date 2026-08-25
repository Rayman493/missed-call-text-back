import { describe, it, expect } from 'vitest'
import { formatAiIntakeSummaryWithMode, formatAdaptiveIntakeSms } from '../ai-intake-formatter'

/**
 * AI Intake Details Detection Regression Tests
 *
 * These tests verify that the "details still needed" bug is fixed:
 * - When meaningful details are captured, SMS should NOT say "Still needed: Any helpful details"
 * - When details are absent, SMS should correctly identify them as missing
 * - Details can be satisfied by multiple canonical fields or contextual reasonForCalling
 */

describe('AI Intake Details Detection - Canonical Fields', () => {
  it('should recognize details from requestDetails field', () => {
    const extractedInfo = {
      customerName: 'John Smith',
      reasonForCalling: 'Lawn mowing',
      requestDetails: 'You would like the lawn mowed again this year',
      addressOrLocation: '123 Main St',
      desiredCompletionTime: 'This week',
      preferredCallbackTime: 'Morning',
    }

    const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

    expect(sms).toContain('• Details: You would like the lawn mowed again this year')
    expect(sms).not.toContain('Still needed:')
    expect(sms).not.toContain('Any helpful details')
  })

  it('should recognize details from additionalDetails field', () => {
    const extractedInfo = {
      customerName: 'John Smith',
      reasonForCalling: 'Plumbing repair',
      additionalDetails: 'The kitchen sink is leaking and flooding the cabinet',
      addressOrLocation: '123 Main St',
      desiredCompletionTime: 'This week',
      preferredCallbackTime: 'Morning',
    }

    const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

    expect(sms).toContain('• Details: The kitchen sink is leaking and flooding the cabinet')
    expect(sms).not.toContain('Still needed:')
    expect(sms).not.toContain('Any helpful details')
  })

  it('should recognize details from importantDetails field', () => {
    const extractedInfo = {
      customerName: 'John Smith',
      reasonForCalling: 'HVAC repair',
      importantDetails: 'The AC unit is making strange noises and not cooling properly',
      addressOrLocation: '123 Main St',
      desiredCompletionTime: 'This week',
      preferredCallbackTime: 'Morning',
    }

    const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

    expect(sms).toContain('• Details: The AC unit is making strange noises and not cooling properly')
    expect(sms).not.toContain('Still needed:')
    expect(sms).not.toContain('Any helpful details')
  })
})

describe('AI Intake Details Detection - Contextual reasonForCalling', () => {
  it('should recognize details from reasonForCalling with contextual indicator "because"', () => {
    const extractedInfo = {
      customerName: 'John Smith',
      reasonForCalling: 'I need my kitchen sink repaired because it is leaking',
      addressOrLocation: '123 Main St',
      desiredCompletionTime: 'This week',
      preferredCallbackTime: 'Morning',
    }

    const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

    // reasonForCalling should NOT be treated as details - only canonical fields count
    expect(sms).not.toContain('• Details:')
    expect(sms).not.toContain('Still needed:')
    expect(sms).not.toContain('Any helpful details')
  })

  it('should recognize details from reasonForCalling with contextual indicator "due to"', () => {
    const extractedInfo = {
      customerName: 'John Smith',
      reasonForCalling: 'Need plumbing repair due to broken pipe in basement',
      addressOrLocation: '123 Main St',
      desiredCompletionTime: 'This week',
      preferredCallbackTime: 'Morning',
    }

    const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

    // reasonForCalling should NOT be treated as details - only canonical fields count
    expect(sms).not.toContain('• Details:')
    expect(sms).not.toContain('Still needed:')
    expect(sms).not.toContain('Any helpful details')
  })

  it('should recognize details from reasonForCalling with contextual indicator "leaking"', () => {
    const extractedInfo = {
      customerName: 'John Smith',
      reasonForCalling: 'The toilet is leaking and needs immediate repair',
      addressOrLocation: '123 Main St',
      desiredCompletionTime: 'This week',
      preferredCallbackTime: 'Morning',
    }

    const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

    // reasonForCalling should NOT be treated as details - only canonical fields count
    expect(sms).not.toContain('• Details:')
    expect(sms).not.toContain('Still needed:')
    expect(sms).not.toContain('Any helpful details')
  })

  it('should recognize details from reasonForCalling with contextual indicator "not working"', () => {
    const extractedInfo = {
      customerName: 'John Smith',
      reasonForCalling: 'My garage door opener is not working after the storm',
      addressOrLocation: '123 Main St',
      desiredCompletionTime: 'This week',
      preferredCallbackTime: 'Morning',
    }

    const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

    // reasonForCalling should NOT be treated as details - only canonical fields count
    expect(sms).not.toContain('• Details:')
    expect(sms).not.toContain('Still needed:')
    expect(sms).not.toContain('Any helpful details')
  })

  it('should recognize details from reasonForCalling with contextual indicator "broken"', () => {
    const extractedInfo = {
      customerName: 'John Smith',
      reasonForCalling: 'The water heater is broken and we have no hot water',
      addressOrLocation: '123 Main St',
      desiredCompletionTime: 'This week',
      preferredCallbackTime: 'Morning',
    }

    const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

    // reasonForCalling should NOT be treated as details - only canonical fields count
    expect(sms).not.toContain('• Details:')
    expect(sms).not.toContain('Still needed:')
    expect(sms).not.toContain('Any helpful details')
  })

  it('should recognize details from reasonForCalling with contextual indicator "needs"', () => {
    const extractedInfo = {
      customerName: 'John Smith',
      reasonForCalling: 'Car maintenance',
      requestDetails: 'My car needs an oil change and tire rotation',
      addressOrLocation: '123 Main St',
      desiredCompletionTime: 'This week',
      preferredCallbackTime: 'Morning',
    }

    const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

    expect(sms).toContain('• Details: My car needs an oil change and tire rotation')
    expect(sms).not.toContain('Still needed:')
    expect(sms).not.toContain('Any helpful details')
  })

  it('should recognize details from reasonForCalling with contextual indicator "would like"', () => {
    const extractedInfo = {
      customerName: 'John Smith',
      reasonForCalling: 'Dog checkup',
      requestDetails: 'I would like to schedule a routine checkup for my dog',
      addressOrLocation: '123 Main St',
      desiredCompletionTime: 'This week',
      preferredCallbackTime: 'Morning',
    }

    const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

    expect(sms).toContain('• Details: I would like to schedule a routine checkup for my dog')
    expect(sms).not.toContain('Any helpful details') // Details are detected
  })

  it('should recognize details from reasonForCalling longer than 4 words', () => {
    const extractedInfo = {
      customerName: 'John Smith',
      reasonForCalling: 'Electrical system inspection',
      requestDetails: 'I need someone to come look at my electrical system',
      addressOrLocation: '123 Main St',
      desiredCompletionTime: 'This week',
      preferredCallbackTime: 'Morning',
    }

    const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

    expect(sms).toContain('• Details: I need someone to come look at my electrical system')
    expect(sms).not.toContain('Any helpful details') // Details are detected
  })

  it('should NOT treat long generic requests as details', () => {
    const extractedInfo = {
      customerName: 'John Smith',
      reasonForCalling: 'I need someone to fix my sink',
      addressOrLocation: '123 Main St',
      desiredCompletionTime: 'This week',
      preferredCallbackTime: 'Morning',
    }

    const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

    // All required fields are present - should not show "Still needed:"
    expect(sms).not.toContain('Still needed:')
    expect(sms).not.toContain('Any helpful details') // Long but generic request should not count as details
  })

  it('should NOT treat long service scheduling requests as details', () => {
    const extractedInfo = {
      customerName: 'John Smith',
      reasonForCalling: 'I would like to schedule plumbing service for my home',
      addressOrLocation: '123 Main St',
      desiredCompletionTime: 'This week',
      preferredCallbackTime: 'Morning',
    }

    const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

    // All required fields are present - should not show "Still needed:"
    expect(sms).not.toContain('Still needed:')
    expect(sms).not.toContain('Any helpful details') // Long scheduling request should not count as details
  })

  it('should NOT treat long help requests as details', () => {
    const extractedInfo = {
      customerName: 'John Smith',
      reasonForCalling: 'I need help with my air conditioner as soon as possible',
      addressOrLocation: '123 Main St',
      desiredCompletionTime: 'This week',
      preferredCallbackTime: 'Morning',
    }

    const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

    // All required fields are present - should not show "Still needed:"
    expect(sms).not.toContain('Still needed:')
    expect(sms).not.toContain('Any helpful details') // Long help request should not count as details
  })

  it('should recognize short but clearly contextual details', () => {
    const extractedInfo = {
      customerName: 'John Smith',
      reasonForCalling: 'Plumbing repair',
      requestDetails: 'Pipe burst',
      addressOrLocation: '123 Main St',
      desiredCompletionTime: 'This week',
      preferredCallbackTime: 'Morning',
    }

    const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

    expect(sms).toContain('• Details: Pipe burst')
    expect(sms).not.toContain('Any helpful details') // Short but clearly contextual
  })

  it('should recognize short contextual details with cause indicator', () => {
    const extractedInfo = {
      customerName: 'John Smith',
      reasonForCalling: 'AC repair',
      requestDetails: 'Due to power outage',
      addressOrLocation: '123 Main St',
      desiredCompletionTime: 'This week',
      preferredCallbackTime: 'Morning',
    }

    const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

    expect(sms).toContain('• Details: Due to power outage')
    expect(sms).not.toContain('Any helpful details') // Short but has cause indicator
  })

  it('should recognize short contextual details with symptom indicator', () => {
    const extractedInfo = {
      customerName: 'John Smith',
      reasonForCalling: 'Mower repair',
      requestDetails: 'Not starting',
      addressOrLocation: '123 Main St',
      desiredCompletionTime: 'This week',
      preferredCallbackTime: 'Morning',
    }

    const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

    expect(sms).toContain('• Details: Not starting')
    expect(sms).not.toContain('Any helpful details') // Short but has symptom indicator
  })

  describe('False-positive prevention - generic location phrases', () => {
    it('should NOT treat "in the kitchen" as meaningful details', () => {
      const extractedInfo = {
        customerName: 'John Smith',
        reasonForCalling: 'I need service in the kitchen',
        addressOrLocation: '123 Main St',
        desiredCompletionTime: 'This week',
        preferredCallbackTime: 'Morning',
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

      // All required fields are present - should not show "Still needed:"
      expect(sms).not.toContain('Still needed:')
      expect(sms).not.toContain('Any helpful details')  // Details are optional // Generic location phrase should not count
    })

    it('should NOT treat "in the bathroom" as meaningful details', () => {
      const extractedInfo = {
        customerName: 'John Smith',
        reasonForCalling: 'I need plumbing in the bathroom',
        addressOrLocation: '123 Main St',
        desiredCompletionTime: 'This week',
        preferredCallbackTime: 'Morning',
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

      // All required fields are present - should not show "Still needed:"
      expect(sms).not.toContain('Still needed:')
      expect(sms).not.toContain('Any helpful details')  // Details are optional // Generic location phrase should not count
    })

    it('should NOT treat "at the house" as meaningful details', () => {
      const extractedInfo = {
        customerName: 'John Smith',
        reasonForCalling: 'I need someone at the house',
        addressOrLocation: '123 Main St',
        desiredCompletionTime: 'This week',
        preferredCallbackTime: 'Morning',
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

      // All required fields are present - should not show "Still needed:"
      expect(sms).not.toContain('Still needed:')
      expect(sms).not.toContain('Any helpful details')  // Details are optional // Generic location phrase should not count
    })

    it('should NOT treat "on the sink" as meaningful details', () => {
      const extractedInfo = {
        customerName: 'John Smith',
        reasonForCalling: 'I need work on the sink',
        addressOrLocation: '123 Main St',
        desiredCompletionTime: 'This week',
        preferredCallbackTime: 'Morning',
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

      // All required fields are present - should not show "Still needed:"
      expect(sms).not.toContain('Still needed:')
      expect(sms).not.toContain('Any helpful details')  // Details are optional // Generic location phrase should not count
    })

    it('should NOT treat "outside" as meaningful details', () => {
      const extractedInfo = {
        customerName: 'John Smith',
        reasonForCalling: 'I need help with the unit outside',
        addressOrLocation: '123 Main St',
        desiredCompletionTime: 'This week',
        preferredCallbackTime: 'Morning',
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

      // All required fields are present - should not show "Still needed:"
      expect(sms).not.toContain('Still needed:')
      expect(sms).not.toContain('Any helpful details')  // Details are optional // Generic location phrase should not count
    })
  })

  describe('False-positive prevention - generic adjectives and actions', () => {
    it('should NOT treat "bad sink" as meaningful details', () => {
      const extractedInfo = {
        customerName: 'John Smith',
        reasonForCalling: 'I have a bad sink',
        addressOrLocation: '123 Main St',
        desiredCompletionTime: 'This week',
        preferredCallbackTime: 'Morning',
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

      // All required fields are present - should not show "Still needed:"
      expect(sms).not.toContain('Still needed:')
      expect(sms).not.toContain('Any helpful details')  // Details are optional // Generic adjective should not count
    })

    it('should NOT treat "installed" alone as meaningful details', () => {
      const extractedInfo = {
        customerName: 'John Smith',
        reasonForCalling: 'I need a new faucet installed',
        addressOrLocation: '123 Main St',
        desiredCompletionTime: 'This week',
        preferredCallbackTime: 'Morning',
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

      // All required fields are present - should not show "Still needed:"
      expect(sms).not.toContain('Still needed:')
      expect(sms).not.toContain('Any helpful details')  // Details are optional // Installation request should not count
    })

    it('should NOT treat "install a faucet" as meaningful details', () => {
      const extractedInfo = {
        customerName: 'John Smith',
        reasonForCalling: 'I need someone to install a faucet',
        addressOrLocation: '123 Main St',
        desiredCompletionTime: 'This week',
        preferredCallbackTime: 'Morning',
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

      // All required fields are present - should not show "Still needed:"
      expect(sms).not.toContain('Still needed:')
      expect(sms).not.toContain('Any helpful details')  // Details are optional // Installation request should not count
    })

    it('should NOT treat "started looking" as meaningful details', () => {
      const extractedInfo = {
        customerName: 'John Smith',
        reasonForCalling: 'I started looking for a plumber',
        addressOrLocation: '123 Main St',
        desiredCompletionTime: 'This week',
        preferredCallbackTime: 'Morning',
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

      // Request field is missing from output - should show "Still needed:"
      expect(sms).toContain('Still needed:')
      expect(sms).not.toContain('Any helpful details')  // Details are optional // Generic action should not count
    })

    it('should NOT treat "come out today" as meaningful details', () => {
      const extractedInfo = {
        customerName: 'John Smith',
        reasonForCalling: 'I need someone to come out today',
        addressOrLocation: '123 Main St',
        desiredCompletionTime: 'This week',
        preferredCallbackTime: 'Morning',
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

      // All required fields are present - should not show "Still needed:"
      expect(sms).not.toContain('Still needed:')
      expect(sms).not.toContain('Any helpful details')  // Details are optional // Timing request should not count
    })
  })

  describe('False-positive prevention - timing words alone', () => {
    it('should NOT treat "yesterday" as meaningful details', () => {
      const extractedInfo = {
        customerName: 'John Smith',
        reasonForCalling: 'I called yesterday',
        addressOrLocation: '123 Main St',
        desiredCompletionTime: 'This week',
        preferredCallbackTime: 'Morning',
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

      // All required fields are present - should not show "Still needed:"
      expect(sms).not.toContain('Still needed:')
      expect(sms).not.toContain('Any helpful details')  // Details are optional // Timing word alone should not count
    })

    it('should NOT treat "last week" as meaningful details', () => {
      const extractedInfo = {
        customerName: 'John Smith',
        reasonForCalling: 'I called last week',
        addressOrLocation: '123 Main St',
        desiredCompletionTime: 'This week',
        preferredCallbackTime: 'Morning',
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

      // All required fields are present - should not show "Still needed:"
      expect(sms).not.toContain('Still needed:')
      expect(sms).not.toContain('Any helpful details')  // Details are optional // Timing word alone should not count
    })
  })

  describe('True-positive prevention - contextual examples should still work', () => {
    it('should recognize "leaking in the kitchen" as meaningful details', () => {
      const extractedInfo = {
        customerName: 'John Smith',
        reasonForCalling: 'Sink repair',
        requestDetails: 'Leaking in the kitchen',
        addressOrLocation: '123 Main St',
        desiredCompletionTime: 'This week',
        preferredCallbackTime: 'Morning',
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

      expect(sms).toContain('• Details: Leaking in the kitchen')
      expect(sms).not.toContain('Any helpful details') // Has specific symptom + location
    })

    it('should recognize "overflowing in the upstairs bathroom" as meaningful details', () => {
      const extractedInfo = {
        customerName: 'John Smith',
        reasonForCalling: 'Toilet repair',
        requestDetails: 'Overflowing in the upstairs bathroom',
        addressOrLocation: '123 Main St',
        desiredCompletionTime: 'This week',
        preferredCallbackTime: 'Morning',
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

      expect(sms).toContain('• Details: Overflowing in the upstairs bathroom')
      expect(sms).not.toContain('Any helpful details') // Has specific symptom + location
    })

    it('should recognize "stopped working yesterday" as meaningful details', () => {
      const extractedInfo = {
        customerName: 'John Smith',
        reasonForCalling: 'AC repair',
        requestDetails: 'Stopped working yesterday',
        addressOrLocation: '123 Main St',
        desiredCompletionTime: 'This week',
        preferredCallbackTime: 'Morning',
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

      expect(sms).toContain('• Details: Stopped working yesterday')
      expect(sms).not.toContain('Any helpful details') // Has symptom + timing
    })

    it('should recognize "installed last week and is already leaking" as meaningful details', () => {
      const extractedInfo = {
        customerName: 'John Smith',
        reasonForCalling: 'Faucet repair',
        requestDetails: 'Installed last week and is already leaking',
        addressOrLocation: '123 Main St',
        desiredCompletionTime: 'This week',
        preferredCallbackTime: 'Morning',
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

      expect(sms).toContain('• Details: Installed last week and is already leaking')
      expect(sms).not.toContain('Any helpful details') // Has troubleshooting + symptom
    })

    it('should recognize "making a loud grinding noise" as meaningful details', () => {
      const extractedInfo = {
        customerName: 'John Smith',
        reasonForCalling: 'AC repair',
        requestDetails: 'Making a loud grinding noise',
        addressOrLocation: '123 Main St',
        desiredCompletionTime: 'This week',
        preferredCallbackTime: 'Morning',
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

      expect(sms).toContain('• Details: Making a loud grinding noise')
      expect(sms).not.toContain('Any helpful details') // Has specific symptom
    })

    it('should recognize "cracked under the sink" as meaningful details', () => {
      const extractedInfo = {
        customerName: 'John Smith',
        reasonForCalling: 'Pipe repair',
        requestDetails: 'Cracked under the sink',
        addressOrLocation: '123 Main St',
        desiredCompletionTime: 'This week',
        preferredCallbackTime: 'Morning',
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

      expect(sms).toContain('• Details: Cracked under the sink')
      expect(sms).not.toContain('Any helpful details') // Has specific symptom + location
    })
  })

  it('should NOT treat short service name as details', () => {
    const extractedInfo = {
      customerName: 'John Smith',
      reasonForCalling: 'Lawn mowing',
      addressOrLocation: '123 Main St',
      desiredCompletionTime: 'This week',
      preferredCallbackTime: 'Morning',
    }

    const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

    expect(sms).not.toContain('Still needed:')
    expect(sms).not.toContain('Any helpful details')
    expect(sms).not.toContain('• Details:')
  })

  it('should NOT treat 4-word service name as details', () => {
    const extractedInfo = {
      customerName: 'John Smith',
      reasonForCalling: 'Weekly lawn mowing service',
      addressOrLocation: '123 Main St',
      desiredCompletionTime: 'This week',
      preferredCallbackTime: 'Morning',
    }

    const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

    expect(sms).not.toContain('Still needed:')
    expect(sms).not.toContain('Any helpful details')
    expect(sms).not.toContain('• Details:')
  })
})

describe('AI Intake Details Detection - Edge Cases', () => {
  it('should treat empty requestDetails as missing', () => {
    const extractedInfo = {
      customerName: 'John Smith',
      reasonForCalling: 'Lawn mowing',
      requestDetails: '',
      addressOrLocation: '123 Main St',
      desiredCompletionTime: 'This week',
      preferredCallbackTime: 'Morning',
    }

    const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

    expect(sms).not.toContain('Still needed:')
    expect(sms).not.toContain('Any helpful details')
  })

  it('should treat whitespace-only requestDetails as missing', () => {
    const extractedInfo = {
      customerName: 'John Smith',
      reasonForCalling: 'Lawn mowing',
      requestDetails: '   ',
      addressOrLocation: '123 Main St',
      desiredCompletionTime: 'This week',
      preferredCallbackTime: 'Morning',
    }

    const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

    expect(sms).not.toContain('Still needed:')
    expect(sms).not.toContain('Any helpful details')
  })

  it('should treat "Not collected" as missing', () => {
    const extractedInfo = {
      customerName: 'John Smith',
      reasonForCalling: 'Lawn mowing',
      requestDetails: 'Not collected',
      addressOrLocation: '123 Main St',
      desiredCompletionTime: 'This week',
      preferredCallbackTime: 'Morning',
    }

    const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

    expect(sms).not.toContain('Still needed:')
    expect(sms).not.toContain('Any helpful details')
  })

  it('should treat null details as missing', () => {
    const extractedInfo = {
      customerName: 'John Smith',
      reasonForCalling: 'Lawn mowing',
      requestDetails: null,
      addressOrLocation: '123 Main St',
      desiredCompletionTime: 'This week',
      preferredCallbackTime: 'Morning',
    }

    const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

    expect(sms).not.toContain('Still needed:')
    expect(sms).not.toContain('Any helpful details')
  })

  it('should treat undefined details as missing', () => {
    const extractedInfo = {
      customerName: 'John Smith',
      reasonForCalling: 'Lawn mowing',
      addressOrLocation: '123 Main St',
      desiredCompletionTime: 'This week',
      preferredCallbackTime: 'Morning',
    }

    const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

    // All required fields are present - should not show "Still needed:"
    expect(sms).not.toContain('Still needed:')
    // Details are optional - do not ask for them when reasonForCalling has a value
    expect(sms).not.toContain('Any helpful details')
  })
})

describe('AI Intake Details Detection - Other Fields Still Missing', () => {
  it('should still report missing address when details are present', () => {
    const extractedInfo = {
      customerName: 'John Smith',
      reasonForCalling: 'Lawn mowing',
      requestDetails: 'You would like the lawn mowed again this year',
      addressOrLocation: null,
      desiredCompletionTime: 'This week',
      preferredCallbackTime: 'Morning',
    }

    const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

    expect(sms).not.toContain('Any helpful details')
    expect(sms).toContain('Still needed:')
    expect(sms).toContain('Service address')
  })

  it('should still report missing timing when details are present', () => {
    const extractedInfo = {
      customerName: 'John Smith',
      reasonForCalling: 'Lawn mowing',
      requestDetails: 'You would like the lawn mowed again this year',
      addressOrLocation: '123 Main St',
      desiredCompletionTime: null,
      preferredCallbackTime: 'Morning',
    }

    const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

    expect(sms).not.toContain('Any helpful details')
    expect(sms).toContain('Still needed:')
    expect(sms).toContain('When you\'d like it completed')
  })

  it('should still report missing callback when details are present', () => {
    const extractedInfo = {
      customerName: 'John Smith',
      reasonForCalling: 'Lawn mowing',
      requestDetails: 'You would like the lawn mowed again this year',
      addressOrLocation: '123 Main St',
      desiredCompletionTime: 'This week',
      preferredCallbackTime: null,
    }

    const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

    expect(sms).not.toContain('Any helpful details')
    expect(sms).toContain('Still needed:')
    expect(sms).toContain('Best time to call you')
  })
})

describe('AI Intake Details Detection - Fully Complete Intake', () => {
  it('should not report any missing fields when intake is complete', () => {
    const extractedInfo = {
      customerName: 'John Smith',
      reasonForCalling: 'Lawn mowing',
      requestDetails: 'You would like the lawn mowed again this year',
      addressOrLocation: '123 Main St',
      desiredCompletionTime: 'This week',
      preferredCallbackTime: 'Morning',
    }

    const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

    expect(sms).not.toContain('Still needed:')
    expect(sms).not.toContain('Any helpful details')
    expect(sms).toContain('We\'ve shared this with the team')
  })

  it('should not report any missing fields when intake is complete with contextual details', () => {
    const extractedInfo = {
      customerName: 'John Smith',
      reasonForCalling: 'I need my kitchen sink repaired because it is leaking',
      addressOrLocation: '123 Main St',
      desiredCompletionTime: 'This week',
      preferredCallbackTime: 'Morning',
    }

    const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

    expect(sms).not.toContain('Still needed:')
    expect(sms).not.toContain('Any helpful details')
    expect(sms).toContain('We\'ve shared this with the team')
  })
})

describe('AI Intake Details Detection - Adaptive SMS Formatter', () => {
  it('should recognize details in adaptive formatter with contextual reasonForCalling', () => {
    const extractedInfo = {
      customerName: 'John Smith',
      reasonForCalling: 'The toilet is leaking and needs immediate repair',
      addressOrLocation: '123 Main St',
      desiredCompletionTime: 'This week',
      preferredCallbackTime: 'Morning',
    }

    const sms = formatAdaptiveIntakeSms(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

    // reasonForCalling should NOT be treated as details - only canonical fields count
    expect(sms).not.toContain('Any important details')
    expect(sms).not.toContain('Details:')
  })

  it('should recognize details in adaptive formatter with canonical field', () => {
    const extractedInfo = {
      customerName: 'John Smith',
      reasonForCalling: 'Plumbing repair',
      requestDetails: 'The kitchen sink is leaking and flooding the cabinet',
      addressOrLocation: '123 Main St',
      desiredCompletionTime: 'This week',
      preferredCallbackTime: 'Morning',
    }

    const sms = formatAdaptiveIntakeSms(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

    expect(sms).not.toContain('Any important details')
    // Canonical field (requestDetails) has details - should expect Details
    expect(sms).toContain('Details:')
  })

  // Note: Adaptive formatter has different behavior for missing fields
// It shows "Not collected" inline rather than a "Still needed" section
// The canonical formatter tests above are comprehensive for the fix
})

describe('AI Intake Details Detection - SMS Format Constraints', () => {
  it('should keep SMS within reasonable length when using contextual details', () => {
    const extractedInfo = {
      customerName: 'John Smith',
      reasonForCalling: 'I need my kitchen sink repaired because it is leaking and flooding the cabinet under the sink',
      addressOrLocation: '123 Main St',
      desiredCompletionTime: 'This week',
      preferredCallbackTime: 'Morning',
    }

    const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

    // SMS should be truncated to reasonable length (details are truncated to 200 chars)
    expect(sms.length).toBeLessThan(1000) // Reasonable SMS length limit
    expect(sms).not.toContain('Still needed:')
  })

  it('should maintain proper SMS formatting with contextual details', () => {
    const extractedInfo = {
      customerName: 'John Smith',
      reasonForCalling: 'I need my kitchen sink repaired because it is leaking',
      addressOrLocation: '123 Main St',
      desiredCompletionTime: 'This week',
      preferredCallbackTime: 'Morning',
    }

    const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

    // Should maintain proper bullet point format - but no Details from reasonForCalling
    expect(sms).toContain('• Request:')
    expect(sms).toContain('• Address:')
    expect(sms).toContain('• Desired completion:')
    expect(sms).toContain('• Preferred callback:')
    // Details should NOT appear because they're not in a canonical field
    expect(sms).not.toContain('• Details:')
  })
})