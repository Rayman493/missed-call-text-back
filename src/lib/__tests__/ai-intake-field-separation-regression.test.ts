import { describe, it, expect } from 'vitest';
import { formatAiIntakeSummary, formatAdaptiveIntakeSms, generateCanonicalRequestTitle } from '../ai-intake-formatter';
import { applyCorrection } from '../ai-correction-engine';
import { isCompleteAIIntake } from '../ai-intake-completion';

describe('AI INTAKE FIELD SEPARATION REGRESSION - Request/Details Isolation', () => {
  describe('Test 1: Request only → Additional Details = Not Collected', () => {
    it('should not copy simple request into details field', () => {
      const intakeData = {
        customerName: 'John',
        serviceRequested: 'I need my grass cut',
        additionalDetails: null,
        serviceAddress: '123 Main St',
        desiredCompletionTime: 'Next week',
        callbackTime: 'Morning',
        serviceLocationType: 'onsite'
      };

      const sms = formatAdaptiveIntakeSms(intakeData, '+15551234567', 'Test Business');

      // Request should be canonicalized
      expect(sms).toContain('Lawn Mowing');
      expect(sms).toContain('Service:');

      // Details should NOT appear
      expect(sms).not.toContain('Details:');
      expect(sms).not.toContain('grass cut');
    });

    it('should handle empty string details as Not Collected', () => {
      const intakeData = {
        customerName: 'Jane',
        serviceRequested: 'I need my grass cut',
        additionalDetails: '',
        serviceAddress: '456 Oak Ave',
        desiredCompletionTime: 'ASAP',
        callbackTime: 'Afternoon',
        serviceLocationType: 'onsite'
      };

      const sms = formatAdaptiveIntakeSms(intakeData, '+15551234567', 'Test Business');

      // Request should appear
      expect(sms).toContain('Lawn Mowing');
      expect(sms).toContain('Service:');

      // Details should NOT appear (empty string = Not Collected)
      expect(sms).not.toContain('Details:');
    });
  });

  describe('Test 2: Request + real details → details preserved', () => {
    it('should preserve actual additional details', () => {
      const intakeData = {
        customerName: 'John',
        serviceRequested: 'I need my grass cut',
        additionalDetails: 'The yard is half an acre and has a locked gate',
        serviceAddress: '123 Main St',
        desiredCompletionTime: 'Next week',
        callbackTime: 'Morning',
        serviceLocationType: 'onsite'
      };

      const sms = formatAdaptiveIntakeSms(intakeData, '+15551234567', 'Test Business');

      // Request should be canonicalized
      expect(sms).toContain('Lawn Mowing');
      expect(sms).toContain('Service:');

      // Details should appear and contain the actual details
      expect(sms).toContain('Details:');
      expect(sms).toContain('half an acre');
      expect(sms).toContain('locked gate');
    });

    it('should not leak request into details when both exist', () => {
      const intakeData = {
        customerName: 'Mary',
        serviceRequested: 'I need my grass cut',
        additionalDetails: 'Yard is overgrown with weeds',
        serviceAddress: '789 Pine Rd',
        desiredCompletionTime: 'This week',
        callbackTime: 'Evening',
        serviceLocationType: 'onsite'
      };

      const sms = formatAdaptiveIntakeSms(intakeData, '+15551234567', 'Test Business');

      // Details should only contain the actual details, not the request
      expect(sms).toContain('Details:');
      expect(sms).toContain('overgrown with weeds');
      expect(sms).not.toContain('grass cut');
    });
  });

  describe('Test 3: Request + scheduling info only → details remain Not Collected', () => {
    it('should not treat scheduling info as details', () => {
      const intakeData = {
        customerName: 'Bob',
        serviceRequested: 'I need my grass cut next week',
        additionalDetails: null,
        serviceAddress: '321 Elm St',
        desiredCompletionTime: 'Next week',
        callbackTime: 'Morning',
        serviceLocationType: 'onsite'
      };

      const sms = formatAdaptiveIntakeSms(intakeData, '+15551234567', 'Test Business');

      // Request should be canonicalized
      expect(sms).toContain('Lawn Mowing');
      expect(sms).toContain('Service:');

      // Desired completion should appear
      expect(sms).toContain('Next week');

      // Details should NOT appear
      expect(sms).not.toContain('Details:');
    });

    it('should separate timing from request in display', () => {
      const intakeData = {
        customerName: 'Alice',
        serviceRequested: 'I need piano lessons tomorrow',
        additionalDetails: null,
        serviceAddress: null,
        desiredCompletionTime: 'Tomorrow',
        callbackTime: 'Afternoon',
        serviceLocationType: 'customer_comes_to_business'
      };

      const sms = formatAdaptiveIntakeSms(intakeData, '+15551234567', 'Test Business');

      // Request should be canonicalized
      expect(sms).toContain('Piano');
      expect(sms).toContain('Service:');

      // Timing should appear separately
      expect(sms).toContain('Tomorrow');

      // Details should NOT appear
      expect(sms).not.toContain('Details:');
    });
  });

  describe('Test 4: Empty details never borrow from Request', () => {
    it('should not use reasonForCalling when additionalDetails is null', () => {
      const intakeData = {
        customerName: 'Tom',
        reasonForCalling: 'I need my grass cut',
        additionalDetails: null,
        serviceAddress: '555 Maple Dr',
        desiredCompletionTime: 'ASAP',
        callbackTime: 'Anytime',
        serviceLocationType: 'onsite'
      };

      const sms = formatAiIntakeSummary(intakeData, '+15551234567', 'Test Business');

      // Request should appear
      expect(sms).toContain('Lawn Mowing');

      // Details should NOT appear
      expect(sms).not.toContain('Details:');
    });

    it('should not use serviceRequested when additionalDetails is empty string', () => {
      const intakeData = {
        customerName: 'Sara',
        serviceRequested: 'I need my grass cut',
        additionalDetails: '',
        serviceAddress: '999 Cedar Ln',
        desiredCompletionTime: 'This weekend',
        callbackTime: 'Morning',
        serviceLocationType: 'onsite'
      };

      const sms = formatAiIntakeSummary(intakeData, '+15551234567', 'Test Business');

      // Request should appear
      expect(sms).toContain('Lawn Mowing');

      // Details should NOT appear
      expect(sms).not.toContain('Details:');
    });

    it('should not use request when importantDetails is Not collected', () => {
      const intakeData = {
        customerName: 'Mike',
        request: 'I need my grass cut',
        importantDetails: 'Not collected',
        serviceAddress: '111 Birch St',
        desiredCompletionTime: 'Next month',
        callbackTime: 'Evening',
        serviceLocationType: 'onsite'
      };

      const sms = formatAiIntakeSummary(intakeData, '+15551234567', 'Test Business');

      // Request should appear
      expect(sms).toContain('Lawn Mowing');

      // Details should NOT appear
      expect(sms).not.toContain('Details:');
    });
  });

  describe('Test 5: Existing multi-part details continue to display', () => {
    it('should preserve multi-part details when canonical field is populated', () => {
      const intakeData = {
        customerName: 'Lisa',
        serviceRequested: 'I need my grass cut',
        additionalDetails: 'The yard is half an acre. There is a locked gate on the side. Please call before arriving.',
        serviceAddress: '222 Willow Way',
        desiredCompletionTime: 'Next week',
        callbackTime: 'Morning',
        serviceLocationType: 'onsite'
      };

      const sms = formatAdaptiveIntakeSms(intakeData, '+15551234567', 'Test Business');

      // Request should appear
      expect(sms).toContain('Lawn Mowing');
      expect(sms).toContain('Service:');

      // All details should appear
      expect(sms).toContain('Details:');
      expect(sms).toContain('half an acre');
      expect(sms).toContain('locked gate');
      expect(sms).toContain('call before arriving');
    });

    it('should preserve complex problem descriptions', () => {
      const intakeData = {
        customerName: 'David',
        serviceRequested: 'Plumbing issue',
        additionalDetails: 'Kitchen sink is leaking underneath the cabinet. Water is dripping onto the floor. Has been happening for 3 days.',
        serviceAddress: '333 Spruce St',
        desiredCompletionTime: 'ASAP',
        callbackTime: 'Morning',
        serviceLocationType: 'onsite'
      };

      const sms = formatAdaptiveIntakeSms(intakeData, '+15551234567', 'Test Business');

      // Request should appear
      expect(sms).toContain('Plumbing');
      expect(sms).toContain('Service:');

      // Complex details should be preserved
      expect(sms).toContain('Details:');
      expect(sms).toContain('Kitchen sink');
      expect(sms).toContain('leaking');
      expect(sms).toContain('underneath the cabinet');
    });

    it('should handle requestDetails alias', () => {
      const intakeData = {
        customerName: 'Karen',
        serviceRequested: 'I need my grass cut',
        requestDetails: 'Yard has steep slope. Equipment must be able to handle incline.',
        serviceAddress: '444 Aspen Ave',
        desiredCompletionTime: 'This week',
        callbackTime: 'Afternoon',
        serviceLocationType: 'onsite'
      };

      const sms = formatAdaptiveIntakeSms(intakeData, '+15551234567', 'Test Business');

      // Request should appear
      expect(sms).toContain('Lawn Mowing');
      expect(sms).toContain('Service:');

      // Details from requestDetails should appear
      expect(sms).toContain('Details:');
      expect(sms).toContain('steep slope');
      expect(sms).toContain('incline');
    });

    it('should handle additional_details alias', () => {
      const intakeData = {
        customerName: 'Steve',
        serviceRequested: 'I need my grass cut',
        additional_details: 'Backyard only. Front yard is already maintained by HOA.',
        serviceAddress: '555 Cherry Blvd',
        desiredCompletionTime: 'Next week',
        callbackTime: 'Morning',
        serviceLocationType: 'onsite'
      };

      const sms = formatAdaptiveIntakeSms(intakeData, '+15551234567', 'Test Business');

      // Request should appear
      expect(sms).toContain('Lawn Mowing');
      expect(sms).toContain('Service:');

      // Details from additional_details should appear
      expect(sms).toContain('Details:');
      expect(sms).toContain('Backyard only');
      expect(sms).toContain('HOA');
    });
  });

  describe('Edge Cases', () => {
    it('should handle whitespace-only details as Not Collected', () => {
      const intakeData = {
        customerName: 'Paul',
        serviceRequested: 'I need my grass cut',
        additionalDetails: '   ',
        serviceAddress: '666 Oak St',
        desiredCompletionTime: 'Next week',
        callbackTime: 'Morning',
        serviceLocationType: 'onsite'
      };

      const sms = formatAdaptiveIntakeSms(intakeData, '+15551234567', 'Test Business');

      // Request should appear
      expect(sms).toContain('Lawn Mowing');

      // Whitespace-only details should NOT appear
      expect(sms).not.toContain('Details:');
    });

    it('should handle null canonical details with populated reasonForCalling', () => {
      const intakeData = {
        customerName: 'Nancy',
        reasonForCalling: 'I need my grass cut. The gate code is 1234.',
        additionalDetails: null,
        requestDetails: null,
        importantDetails: null,
        serviceAddress: '777 Pine Rd',
        desiredCompletionTime: 'Next week',
        callbackTime: 'Morning',
        serviceLocationType: 'onsite'
      };

      const sms = formatAdaptiveIntakeSms(intakeData, '+15551234567', 'Test Business');

      // Request should appear
      expect(sms).toContain('Lawn Mowing');

      // Details should NOT appear even though reasonForCalling has extra info
      // (because it's not in a canonical details field)
      expect(sms).not.toContain('Details:');
      expect(sms).not.toContain('gate code');
    });

    it('should prioritize canonical details over reasonForCalling', () => {
      const intakeData = {
        customerName: 'George',
        reasonForCalling: 'I need my grass cut. The yard is huge.',
        additionalDetails: 'Backyard only. Front is done by HOA.',
        serviceAddress: '888 Elm St',
        desiredCompletionTime: 'Next week',
        callbackTime: 'Morning',
        serviceLocationType: 'onsite'
      };

      const sms = formatAdaptiveIntakeSms(intakeData, '+15551234567', 'Test Business');

      // Request should appear
      expect(sms).toContain('Lawn Mowing');

      // Details should come from canonical field, not reasonForCalling
      expect(sms).toContain('Details:');
      expect(sms).toContain('Backyard only');
      expect(sms).toContain('HOA');
      expect(sms).not.toContain('huge');
    });
  });

  describe('AI Intake Extraction Layer - Field Separation', () => {
    it('Test 1: Simple request only → Additional Details = Not Collected', () => {
      const extractedInfo = {
        customerName: 'John Smith',
        reasonForCalling: 'I need my grass cut',
        serviceAddress: '123 Main St',
        desiredCompletionTime: 'Next Tuesday',
        callbackTime: 'Morning',
        serviceLocationType: 'onsite'
      };

      const sms = formatAdaptiveIntakeSms(extractedInfo, '+15551234567', 'Test Business');

      // Request should appear
      expect(sms).toContain('Lawn Mowing');
      expect(sms).toContain('• Service:');

      // Additional Details should be Not Collected (not duplicated from request)
      expect(sms).not.toContain('Details:');
      expect(sms).not.toContain('grass cut');
    });

    it('Test 2: Request + real details → details preserved', () => {
      const extractedInfo = {
        customerName: 'John Smith',
        reasonForCalling: 'I need my grass cut',
        additionalDetails: 'The yard is about half an acre and the gate is locked.',
        serviceAddress: '123 Main St',
        desiredCompletionTime: 'Next Tuesday',
        callbackTime: 'Morning',
        serviceLocationType: 'onsite'
      };

      const sms = formatAdaptiveIntakeSms(extractedInfo, '+15551234567', 'Test Business');

      // Request should appear
      expect(sms).toContain('Lawn Mowing');
      expect(sms).toContain('• Service:');

      // Additional Details should appear with actual details
      expect(sms).toContain('Details:');
      expect(sms).toContain('half an acre');
      expect(sms).toContain('gate is locked');
    });

    it('Test 3: Request + scheduling info only → details remain Not Collected', () => {
      const extractedInfo = {
        customerName: 'John Smith',
        reasonForCalling: 'I need my grass cut next Tuesday',
        serviceAddress: '123 Main St',
        desiredCompletionTime: 'Next Tuesday',
        callbackTime: 'Morning',
        serviceLocationType: 'onsite'
      };

      const sms = formatAdaptiveIntakeSms(extractedInfo, '+15551234567', 'Test Business');

      // Request should appear
      expect(sms).toContain('Lawn Mowing');
      expect(sms).toContain('• Service:');

      // Timing should appear in timing field, not details
      expect(sms).toContain('Next tuesday');
      expect(sms).toContain('• Preferred timing:');

      // Additional Details should be Not Collected
      expect(sms).not.toContain('Details:');
    });

    it('Test 4: Request + special instructions → details preserved', () => {
      const extractedInfo = {
        customerName: 'John Smith',
        reasonForCalling: 'I need my grass cut',
        additionalDetails: 'My dog is usually outside so please call first.',
        serviceAddress: '123 Main St',
        desiredCompletionTime: 'Next Tuesday',
        callbackTime: 'Morning',
        serviceLocationType: 'onsite'
      };

      const sms = formatAdaptiveIntakeSms(extractedInfo, '+15551234567', 'Test Business');

      // Request should appear
      expect(sms).toContain('Lawn Mowing');
      expect(sms).toContain('• Service:');

      // Additional Details should appear with special instructions
      expect(sms).toContain('Details:');
      expect(sms).toContain('dog');
      expect(sms).toContain('call first');
    });
  });

  describe('AI Correction Engine - Field Separation', () => {
    it('Test 1: Details correction should not merge into request', () => {
      // Original: "I need my grass cut"
      // Correction: "The yard is half an acre and the gate is locked"
      const extractedInfo = {
        customerName: 'John Smith',
        reasonForCalling: 'I need my grass cut',
        serviceAddress: '123 Main St',
        desiredCompletionTime: 'Next Tuesday',
        callbackTime: 'Morning',
        serviceLocationType: 'onsite'
      };

      // Simulate a details correction
      const correction = {
        field: 'importantDetails',
        value: 'The yard is half an acre and the gate is locked'
      };

      const updated = applyCorrection(extractedInfo, correction.field, correction.value, 'addition');

      // Request should remain unchanged
      expect(updated.reasonForCalling).toBe('I need my grass cut');

      // Details should be added
      expect(updated.importantDetails).toBe('The yard is half an acre and the gate is locked');

      // When formatted, request should not include details
      const sms = formatAdaptiveIntakeSms(updated, '+15551234567', 'Test Business');
      expect(sms).toContain('Lawn Mowing');
      expect(sms).toContain('Details:');
      expect(sms).toContain('half an acre');
      expect(sms).toContain('gate');
    });

    it('Test 2: Service request correction should update request only', () => {
      // Original: "I need my grass cut"
      // Correction: "Actually I need tree trimming"
      const extractedInfo = {
        customerName: 'John Smith',
        reasonForCalling: 'I need my grass cut',
        serviceAddress: '123 Main St',
        desiredCompletionTime: 'Next Tuesday',
        callbackTime: 'Morning',
        serviceLocationType: 'onsite'
      };

      // Simulate a request correction
      const correction = {
        field: 'reasonForCalling',
        value: 'Actually I need tree trimming'
      };

      const updated = applyCorrection(extractedInfo, correction.field, correction.value, 'correction');

      // Request should be updated
      expect(updated.reasonForCalling).toBe('Actually I need tree trimming');

      // Details should remain Not Collected
      expect(updated.importantDetails).toBeUndefined();

      // When formatted, should show new service
      const sms = formatAdaptiveIntakeSms(updated, '+15551234567', 'Test Business');
      expect(sms).toContain('Tree Service');
      expect(sms).not.toContain('Details:');
    });

    it('Test 3: Details addition should update details only', () => {
      // Original: "I need my grass cut"
      // Correction: "Also my dog is usually outside"
      const extractedInfo = {
        customerName: 'John Smith',
        reasonForCalling: 'I need my grass cut',
        serviceAddress: '123 Main St',
        desiredCompletionTime: 'Next Tuesday',
        callbackTime: 'Morning',
        serviceLocationType: 'onsite'
      };

      // Simulate a details addition
      const correction = {
        field: 'importantDetails',
        value: 'Also my dog is usually outside'
      };

      const updated = applyCorrection(extractedInfo, correction.field, correction.value, 'addition');

      // Request should remain unchanged
      expect(updated.reasonForCalling).toBe('I need my grass cut');

      // Details should be added
      expect(updated.importantDetails).toBe('Also my dog is usually outside');

      // When formatted, details should appear
      const sms = formatAdaptiveIntakeSms(updated, '+15551234567', 'Test Business');
      expect(sms).toContain('Lawn Mowing');
      expect(sms).toContain('Details:');
      expect(sms).toContain('dog');
    });

    it('Test 4: Timing correction should update timing only', () => {
      // Original: "I need my grass cut"
      // Correction: "Next Tuesday works"
      const extractedInfo = {
        customerName: 'John Smith',
        reasonForCalling: 'I need my grass cut',
        serviceAddress: '123 Main St',
        callbackTime: 'Morning',
        serviceLocationType: 'onsite'
      };

      // Simulate a timing correction
      const correction = {
        field: 'desiredCompletionTime',
        value: 'Next Tuesday'
      };

      const updated = applyCorrection(extractedInfo, correction.field, correction.value, 'correction');

      // Request should remain unchanged
      expect(updated.reasonForCalling).toBe('I need my grass cut');

      // Timing should be updated
      expect(updated.desiredCompletionTime).toBe('Next Tuesday');

      // Details should remain Not Collected
      expect(updated.importantDetails).toBeUndefined();

      // When formatted, timing should appear but details should not
      const sms = formatAdaptiveIntakeSms(updated, '+15551234567', 'Test Business');
      expect(sms).toContain('Lawn Mowing');
      expect(sms).toContain('Next tuesday');
      expect(sms).not.toContain('Details:');
    });

    it('Test 5: Callback time correction should update callback time only', () => {
      // Original: "I need my grass cut"
      // Correction: "Call me after 4"
      const extractedInfo = {
        customerName: 'John Smith',
        reasonForCalling: 'I need my grass cut',
        serviceAddress: '123 Main St',
        desiredCompletionTime: 'Next Tuesday',
        serviceLocationType: 'onsite'
      };

      // Simulate a callback time correction
      const correction = {
        field: 'preferredCallbackTime',
        value: 'Call me after 4'
      };

      const updated = applyCorrection(extractedInfo, correction.field, correction.value, 'correction');

      // Request should remain unchanged
      expect(updated.reasonForCalling).toBe('I need my grass cut');

      // Callback time should be updated
      expect(updated.preferredCallbackTime).toBe('Call me after 4');

      // Details should remain Not Collected
      expect(updated.importantDetails).toBeUndefined();

      // When formatted, callback time should appear but details should not
      const sms = formatAdaptiveIntakeSms(updated, '+15551234567', 'Test Business');
      expect(sms).toContain('Lawn Mowing');
      expect(sms).toContain('After 4');
      expect(sms).not.toContain('Details:');
    });
  });

  describe('SMS Intake - Details Optional Field', () => {
    it('Test 1: Missing details does not create "Still needed"', () => {
      const extractedInfo = {
        customerName: 'John Smith',
        reasonForCalling: 'I need my grass cut',
        serviceAddress: '123 Main St',
        desiredCompletionTime: 'Next Tuesday',
        callbackTime: 'Morning',
        serviceLocationType: 'onsite'
      };

      const sms = formatAdaptiveIntakeSms(extractedInfo, '+15551234567', 'Test Business');

      // Request should appear
      expect(sms).toContain('Lawn Mowing');

      // Details should NOT be in "Still needed"
      expect(sms).not.toContain('Still needed:');
      expect(sms).not.toContain('Additional details');
      expect(sms).not.toContain('Details:');
    });

    it('Test 2: Missing details does not trigger AI follow-up', () => {
      const extractedInfo = {
        customerName: 'John Smith',
        reasonForCalling: 'I need my grass cut',
        serviceAddress: '123 Main St',
        desiredCompletionTime: 'Next Tuesday',
        callbackTime: 'Morning',
        serviceLocationType: 'onsite'
      };

      // Check AI completion - should be complete even without details
      const isComplete = isCompleteAIIntake(extractedInfo, 'onsite');

      // Should be complete because all required fields are present
      expect(isComplete).toBe(true);
    });

    it('Test 3: Real details still display correctly', () => {
      const extractedInfo = {
        customerName: 'John Smith',
        reasonForCalling: 'I need my grass cut',
        additionalDetails: 'The yard is half an acre and there is a locked gate',
        serviceAddress: '123 Main St',
        desiredCompletionTime: 'Next Tuesday',
        callbackTime: 'Morning',
        serviceLocationType: 'onsite'
      };

      const sms = formatAdaptiveIntakeSms(extractedInfo, '+15551234567', 'Test Business');

      // Request should appear
      expect(sms).toContain('Lawn Mowing');

      // Details should appear when provided
      expect(sms).toContain('Details:');
      expect(sms).toContain('half an acre');
      expect(sms).toContain('locked gate');

      // Should not show "Still needed"
      expect(sms).not.toContain('Still needed:');
    });

    it('Test 4: Details correction still updates details only', () => {
      const extractedInfo = {
        customerName: 'John Smith',
        reasonForCalling: 'I need my grass cut',
        serviceAddress: '123 Main St',
        desiredCompletionTime: 'Next Tuesday',
        callbackTime: 'Morning',
        serviceLocationType: 'onsite'
      };

      // Simulate a details correction
      const updated = applyCorrection(extractedInfo, 'importantDetails', 'The gate is locked', 'addition');

      // Request should remain unchanged
      expect(updated.reasonForCalling).toBe('I need my grass cut');

      // Details should be added
      expect(updated.importantDetails).toBe('The gate is locked');

      // When formatted, should show details
      const sms = formatAdaptiveIntakeSms(updated, '+15551234567', 'Test Business');
      expect(sms).toContain('Details:');
      expect(sms).toContain('gate is locked');
    });
  });
});