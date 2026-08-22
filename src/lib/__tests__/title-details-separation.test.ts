import { describe, it, expect } from 'vitest';
import { generateCanonicalRequestTitle, formatAdaptiveIntakeSms, formatAiIntakeSummary } from '../ai-intake-formatter';
import { isCompleteAIIntake } from '../ai-intake-completion';

describe('TITLE/DETAILS SEPARATION - CASE A: Simple Request / No Details', () => {
  it('should complete intake with Water Heater Replacement and no details', () => {
    const intakeData = {
      customerName: 'John',
      serviceRequested: 'Water Heater Replacement',
      additionalDetails: null,
      serviceAddress: '123 Main St',
      desiredCompletionTime: 'Next week',
      callbackTime: 'Morning',
      serviceLocationType: 'onsite'
    };

    // Completion check
    const isComplete = isCompleteAIIntake(intakeData, 'onsite');
    expect(isComplete).toBe(true);

    // SMS should not ask for details
    const sms = formatAdaptiveIntakeSms(intakeData, '+15551234567', 'Test Business');
    expect(sms).toContain('Water Heater'); // Canonicalized to "Water Heater Installation"
    expect(sms).not.toContain('Still needed:');
    expect(sms).not.toContain('Any helpful details');
    expect(sms).not.toContain('Any important details');
  });
});

describe('TITLE/DETAILS SEPARATION - CASE B: Cat Sitter / No Details', () => {
  it('should complete intake with Cat Sitter and empty details', () => {
    const intakeData = {
      customerName: 'Amber',
      serviceRequested: 'Cat Sitter',
      additionalDetails: '',
      serviceAddress: '5510 Mifflin Road, 15207',
      desiredCompletionTime: 'September 9th through the 12th',
      callbackTime: 'Anytime after 4 PM but before 9 PM',
      serviceLocationType: 'onsite'
    };

    // Completion check
    const isComplete = isCompleteAIIntake(intakeData, 'onsite');
    expect(isComplete).toBe(true);

    // Request Title should be Cat Sitter
    const title = generateCanonicalRequestTitle('Cat Sitter');
    expect(title).toBe('Cat Sitter');

    // SMS should include Service: Cat Sitter
    const sms = formatAdaptiveIntakeSms(intakeData, '+15551234567', 'Test Business');
    expect(sms).toContain('Service: Cat Sitter');
    
    // SMS should NOT ask for details
    expect(sms).not.toContain('Still needed:');
    expect(sms).not.toContain('Any helpful details');
    expect(sms).not.toContain('Any important details');
    expect(sms).not.toContain('What you\'re looking to have done');
  });
});

describe('TITLE/DETAILS SEPARATION - CASE C: Request + Real Detail', () => {
  it('should keep title concise and details separate', () => {
    const intakeData = {
      customerName: 'John',
      serviceRequested: 'Kitchen Sink Leak',
      additionalDetails: 'Leak is coming from underneath the cabinet',
      serviceAddress: '123 Main St',
      desiredCompletionTime: 'ASAP',
      callbackTime: 'Morning',
      serviceLocationType: 'onsite'
    };

    const isComplete = isCompleteAIIntake(intakeData, 'onsite');
    expect(isComplete).toBe(true);

    const sms = formatAdaptiveIntakeSms(intakeData, '+15551234567', 'Test Business');
    expect(sms).toContain('Kitchen'); // Canonicalized to "Kitchen Leak Repair"
    expect(sms).toContain('Details: Leak is coming from underneath the cabinet');
    expect(sms).not.toContain('Still needed:');
  });
});

describe('TITLE/DETAILS SEPARATION - CASE D: Details Without Request', () => {
  it('should keep details as details, not promote to title', () => {
    const intakeData = {
      customerName: 'John',
      serviceRequested: null,
      additionalDetails: 'Leak is underneath the cabinet',
      serviceAddress: '123 Main St',
      desiredCompletionTime: 'ASAP',
      callbackTime: 'Morning',
      serviceLocationType: 'onsite'
    };

    const isComplete = isCompleteAIIntake(intakeData, 'onsite');
    expect(isComplete).toBe(false); // Missing request

    const sms = formatAdaptiveIntakeSms(intakeData, '+15551234567', 'Test Business');
    expect(sms).not.toContain('Service: Leak is underneath the cabinet');
    expect(sms).toContain('Details: Leak is underneath the cabinet');
    expect(sms).toContain('What you need help with'); // Should ask for request even with details
  });
});

describe('TITLE/DETAILS SEPARATION - CASE E: Duplicated Semantics', () => {
  it('should handle when details repeat title exactly', () => {
    const intakeData = {
      customerName: 'John',
      serviceRequested: 'Furnace Repair',
      additionalDetails: 'Furnace Repair',
      serviceAddress: '123 Main St',
      desiredCompletionTime: 'ASAP',
      callbackTime: 'Morning',
      serviceLocationType: 'onsite'
    };

    const isComplete = isCompleteAIIntake(intakeData, 'onsite');
    expect(isComplete).toBe(true);

    const sms = formatAdaptiveIntakeSms(intakeData, '+15551234567', 'Test Business');
    expect(sms).toContain('Service: Furnace Repair');
    // Details are shown even if they repeat the title (not ideal but not a bug to fix here)
    expect(sms).toContain('Details: Furnace Repair');
  });

  it('should handle when details partially overlap title', () => {
    const intakeData = {
      customerName: 'John',
      serviceRequested: 'Roof Repair',
      additionalDetails: 'Roof leak started after Tuesday\'s storm',
      serviceAddress: '123 Main St',
      desiredCompletionTime: 'ASAP',
      callbackTime: 'Morning',
      serviceLocationType: 'onsite'
    };

    const isComplete = isCompleteAIIntake(intakeData, 'onsite');
    expect(isComplete).toBe(true);

    const sms = formatAdaptiveIntakeSms(intakeData, '+15551234567', 'Test Business');
    expect(sms).toContain('Service: Roof Repair');
    expect(sms).toContain('Details: Roof leak started after Tuesday\'s storm');
  });
});

describe('TITLE/DETAILS SEPARATION - CASE F: Request Embedded in Detail', () => {
  it('should keep title and details separate', () => {
    const intakeData = {
      customerName: 'John',
      serviceRequested: 'Air Conditioning Repair',
      additionalDetails: 'Upstairs is not cooling but downstairs is working',
      serviceAddress: '123 Main St',
      desiredCompletionTime: 'ASAP',
      callbackTime: 'Morning',
      serviceLocationType: 'onsite'
    };

    const isComplete = isCompleteAIIntake(intakeData, 'onsite');
    expect(isComplete).toBe(true);

    const sms = formatAdaptiveIntakeSms(intakeData, '+15551234567', 'Test Business');
    expect(sms).toContain('HVAC'); // Canonicalized from "Air Conditioning Repair"
    expect(sms).toContain('Details: Upstairs is not cooling but downstairs is working');
  });
});

describe('TITLE/DETAILS SEPARATION - CASE G: Short Request Only', () => {
  it('should complete with Plumber and no details', () => {
    const intakeData = {
      customerName: 'John',
      serviceRequested: 'Plumber',
      additionalDetails: null,
      serviceAddress: '123 Main St',
      desiredCompletionTime: 'ASAP',
      callbackTime: 'Morning',
      serviceLocationType: 'onsite'
    };

    const isComplete = isCompleteAIIntake(intakeData, 'onsite');
    expect(isComplete).toBe(true);

    const title = generateCanonicalRequestTitle('Plumber');
    expect(title).toBe('Plumber');

    const sms = formatAdaptiveIntakeSms(intakeData, '+15551234567', 'Test Business');
    expect(sms).toContain('Service: Plumber');
    expect(sms).not.toContain('Still needed:');
    expect(sms).not.toContain('Any helpful details');
    expect(sms).not.toContain('Any important details');
  });
});

describe('TITLE/DETAILS SEPARATION - CASE H: Unknown Both', () => {
  it('should ask for request but not details when both unknown', () => {
    const intakeData = {
      customerName: 'John',
      serviceRequested: null,
      additionalDetails: null,
      serviceAddress: '123 Main St',
      desiredCompletionTime: 'ASAP',
      callbackTime: 'Morning',
      serviceLocationType: 'onsite'
    };

    const isComplete = isCompleteAIIntake(intakeData, 'onsite');
    expect(isComplete).toBe(false);

    const sms = formatAdaptiveIntakeSms(intakeData, '+15551234567', 'Test Business');
    expect(sms).toContain('What you need help with'); // Should ask for request even with other fields
  });
});

describe('COMPLETION LOGIC - Additional Details Are Optional', () => {
  it('should mark intake complete without additionalDetails', () => {
    const intakeData = {
      customerName: 'John',
      serviceRequested: 'Lawn Mowing',
      additionalDetails: null,
      serviceAddress: '123 Main St',
      desiredCompletionTime: 'Next week',
      callbackTime: 'Morning',
      serviceLocationType: 'onsite'
    };

    const isComplete = isCompleteAIIntake(intakeData, 'onsite');
    expect(isComplete).toBe(true);
  });

  it('should mark intake complete with empty additionalDetails', () => {
    const intakeData = {
      customerName: 'John',
      serviceRequested: 'Lawn Mowing',
      additionalDetails: '',
      serviceAddress: '123 Main St',
      desiredCompletionTime: 'Next week',
      callbackTime: 'Morning',
      serviceLocationType: 'onsite'
    };

    const isComplete = isCompleteAIIntake(intakeData, 'onsite');
    expect(isComplete).toBe(true);
  });

  it('should mark intake complete without importantDetails', () => {
    const intakeData = {
      customerName: 'John',
      serviceRequested: 'Lawn Mowing',
      importantDetails: null,
      serviceAddress: '123 Main St',
      desiredCompletionTime: 'Next week',
      callbackTime: 'Morning',
      serviceLocationType: 'onsite'
    };

    const isComplete = isCompleteAIIntake(intakeData, 'onsite');
    expect(isComplete).toBe(true);
  });
});

describe('SMS FORMATTER - Details Should Not Be Required', () => {
  it('should not add "Any helpful details" to still-needed list', () => {
    const intakeData = {
      customerName: 'Amber',
      serviceRequested: 'Cat Sitter',
      additionalDetails: '',
      serviceAddress: '5510 Mifflin Road, 15207',
      desiredCompletionTime: 'September 9th through the 12th',
      callbackTime: 'Anytime after 4 PM but before 9 PM',
      serviceLocationType: 'onsite'
    };

    const sms = formatAiIntakeSummary(intakeData, '+15551234567', 'Test Business', undefined, 'onsite');
    expect(sms).toContain('Request: Cat Sitter');
    expect(sms).not.toContain('Still needed:');
    expect(sms).not.toContain('Any helpful details');
  });

  it('should not add "Any important details" to missing fields list', () => {
    const intakeData = {
      customerName: 'Amber',
      serviceRequested: 'Cat Sitter',
      additionalDetails: null,
      serviceAddress: '5510 Mifflin Road, 15207',
      desiredCompletionTime: 'September 9th through the 12th',
      callbackTime: 'Anytime after 4 PM but before 9 PM',
      serviceLocationType: 'onsite'
    };

    const sms = formatAdaptiveIntakeSms(intakeData, '+15551234567', 'Test Business');
    expect(sms).toContain('Service: Cat Sitter');
    expect(sms).not.toContain('Still needed:');
    expect(sms).not.toContain('Any important details');
    expect(sms).not.toContain('Any helpful details');
  });
});

describe('FIELD ALIAS MAPPING', () => {
  it('should recognize serviceRequested as canonical request field', () => {
    const intakeData = {
      customerName: 'John',
      serviceRequested: 'Furnace Repair',
      serviceAddress: '123 Main St',
      desiredCompletionTime: 'Next week',
      callbackTime: 'Morning',
      serviceLocationType: 'onsite'
    };

    const isComplete = isCompleteAIIntake(intakeData, 'onsite');
    expect(isComplete).toBe(true);
  });

  it('should recognize reasonForCalling as canonical request field', () => {
    const intakeData = {
      customerName: 'John',
      reasonForCalling: 'Furnace Repair',
      serviceAddress: '123 Main St',
      desiredCompletionTime: 'Next week',
      callbackTime: 'Morning',
      serviceLocationType: 'onsite'
    };

    const isComplete = isCompleteAIIntake(intakeData, 'onsite');
    expect(isComplete).toBe(true);
  });

  it('should recognize additionalDetails as canonical details field', () => {
    const intakeData = {
      customerName: 'John',
      serviceRequested: 'Furnace Repair',
      additionalDetails: 'Leak under cabinet',
      serviceAddress: '123 Main St',
      desiredCompletionTime: 'Next week',
      callbackTime: 'Morning',
      serviceLocationType: 'onsite'
    };

    const sms = formatAdaptiveIntakeSms(intakeData, '+15551234567', 'Test Business');
    expect(sms).toContain('Details: Leak under cabinet');
  });

  it('should recognize importantDetails as canonical details field', () => {
    const intakeData = {
      customerName: 'John',
      serviceRequested: 'Furnace Repair',
      importantDetails: 'Leak under cabinet',
      serviceAddress: '123 Main St',
      desiredCompletionTime: 'Next week',
      callbackTime: 'Morning',
      serviceLocationType: 'onsite'
    };

    const sms = formatAdaptiveIntakeSms(intakeData, '+15551234567', 'Test Business');
    expect(sms).toContain('Details: Leak under cabinet');
  });
});

describe('REQUEST-MISSING INVARIANT - Critical Regression Tests', () => {
  it('should ask for request when serviceRequested is null but all other fields are present', () => {
    const intakeData = {
      customerName: 'Amber',
      serviceRequested: null,
      additionalDetails: null,
      serviceAddress: '5510 Mifflin Road, 15207',
      desiredCompletionTime: 'September 9th through the 12th',
      callbackTime: 'Anytime after 4 PM but before 9 PM',
      serviceLocationType: 'onsite'
    };

    const isComplete = isCompleteAIIntake(intakeData, 'onsite');
    expect(isComplete).toBe(false); // Missing request

    const sms = formatAdaptiveIntakeSms(intakeData, '+15551234567', 'Test Business');
    expect(sms).toContain('What you need help with'); // Must ask for request
    expect(sms).not.toContain('We\'ve shared this with the team'); // Should not show complete message
  });

  it('should ask for request when serviceRequested is null but details are present', () => {
    const intakeData = {
      customerName: 'Amber',
      serviceRequested: null,
      additionalDetails: 'Leak is underneath the kitchen cabinet',
      serviceAddress: '5510 Mifflin Road, 15207',
      desiredCompletionTime: 'September 9th through the 12th',
      callbackTime: 'Anytime after 4 PM but before 9 PM',
      serviceLocationType: 'onsite'
    };

    const isComplete = isCompleteAIIntake(intakeData, 'onsite');
    expect(isComplete).toBe(false); // Missing request

    const sms = formatAdaptiveIntakeSms(intakeData, '+15551234567', 'Test Business');
    expect(sms).not.toContain('Service: Leak is underneath the kitchen cabinet'); // Details should NOT become title
    expect(sms).toContain('Details: Leak is underneath the kitchen cabinet'); // Details remain in details field
    expect(sms).toContain('What you need help with'); // Must ask for request
  });

  it('should ask for request in formatAiIntakeSummary when request is null', () => {
    const intakeData = {
      customerName: 'Amber',
      serviceRequested: null,
      additionalDetails: null,
      serviceAddress: '5510 Mifflin Road, 15207',
      desiredCompletionTime: 'September 9th through the 12th',
      callbackTime: 'Anytime after 4 PM but before 9 PM',
      serviceLocationType: 'onsite'
    };

    const sms = formatAiIntakeSummary(intakeData, '+15551234567', 'Test Business', undefined, 'onsite');
    expect(sms).toContain('What you\'re looking to have done');
  });

  it('should not allow details to manufacture request title', () => {
    const intakeData = {
      customerName: 'Amber',
      serviceRequested: null,
      additionalDetails: 'Two cats, morning and evening visits',
      serviceAddress: '5510 Mifflin Road, 15207',
      desiredCompletionTime: 'September 9th through the 12th',
      callbackTime: 'Anytime after 4 PM but before 9 PM',
      serviceLocationType: 'onsite'
    };

    const sms = formatAdaptiveIntakeSms(intakeData, '+15551234567', 'Test Business');
    expect(sms).not.toContain('Service: Cat Sitter');
    expect(sms).not.toContain('Service: Pet Care');
    expect(sms).not.toContain('Service: Two Cats Morning And Evening Visits');
    expect(sms).toContain('Details: Two cats, morning and evening visits');
    expect(sms).toContain('What you need help with'); // Request is still required
  });
});