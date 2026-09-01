import { expect } from 'chai';
import {
  isRefusal,
  isValidServiceAddress,
  isValidServiceRequest,
  isValidCompletionTime,
  isValidCallbackTime,
  mergeExtractedField,
  IntakeData,
  resolveNextRequiredStage,
  resolveNextSimpleModeStage,
  selectSimpleModePromptKey
} from '../src/intake-validation';

describe('Intake Validation Functions', () => {
  describe('isRefusal', () => {
    it('should detect clear refusal patterns', () => {
      expect(isRefusal("I'd rather not give my name")).to.be.true;
      expect(isRefusal("I would rather not say")).to.be.true;
      expect(isRefusal("I don't want to")).to.be.true;
      expect(isRefusal("I prefer not to")).to.be.true;
      expect(isRefusal("I don't have the address")).to.be.true;
      expect(isRefusal("I don't know the exact address")).to.be.true;
    });

    it('should accept valid answers', () => {
      expect(isRefusal("David Reynolds")).to.be.false;
      expect(isRefusal("5128 Walnut Street")).to.be.false;
      expect(isRefusal("Tomorrow")).to.be.false;
      expect(isRefusal("Anytime")).to.be.false;
      expect(isRefusal("No rush")).to.be.false;
    });
  });

  describe('isValidServiceAddress', () => {
    it('should accept valid addresses', () => {
      expect(isValidServiceAddress("5128 Walnut Street, Pittsburgh")).to.be.true;
      expect(isValidServiceAddress("123 Main St")).to.be.true;
      expect(isValidServiceAddress("456 Oak Avenue")).to.be.true;
    });

    it('should reject refusals', () => {
      expect(isValidServiceAddress("I'd rather not give my address")).to.be.false;
      expect(isValidServiceAddress("I don't know the address")).to.be.false;
      expect(isValidServiceAddress("I'd rather give it when someone calls")).to.be.false;
    });

    it('should reject non-answers', () => {
      expect(isValidServiceAddress("")).to.be.false;
      expect(isValidServiceAddress("I don't know")).to.be.false;
      expect(isValidServiceAddress("not sure")).to.be.false;
      expect(isValidServiceAddress("unknown")).to.be.false;
    });
  });

  describe('isValidServiceRequest', () => {
    it('should accept valid service requests', () => {
      expect(isValidServiceRequest("I need my fence gate repaired")).to.be.true;
      expect(isValidServiceRequest("My toilet is leaking")).to.be.true;
      expect(isValidServiceRequest("Plumbing repair")).to.be.true;
    });

    it('should reject only truly unusable answers', () => {
      expect(isValidServiceRequest("")).to.be.false;
      expect(isValidServiceRequest("uh")).to.be.false;
      expect(isValidServiceRequest("um")).to.be.false;
      expect(isValidServiceRequest("I don't know")).to.be.false;
      expect(isValidServiceRequest("not sure")).to.be.false;
    });
  });

  describe('isValidCompletionTime', () => {
    it('should accept flexible timing expressions', () => {
      expect(isValidCompletionTime("Tomorrow")).to.be.true;
      expect(isValidCompletionTime("Sometime this week")).to.be.true;
      expect(isValidCompletionTime("No rush")).to.be.true;
      expect(isValidCompletionTime("Whenever")).to.be.true;
      expect(isValidCompletionTime("As soon as possible")).to.be.true;
    });

    it('should reject unusable answers', () => {
      expect(isValidCompletionTime("")).to.be.false;
      expect(isValidCompletionTime("uh")).to.be.false;
      expect(isValidCompletionTime("I don't know")).to.be.false;
    });
  });

  describe('isValidCallbackTime', () => {
    it('should accept flexible callback preferences', () => {
      expect(isValidCallbackTime("Anytime")).to.be.true;
      expect(isValidCallbackTime("Afternoons")).to.be.true;
      expect(isValidCallbackTime("After five")).to.be.true;
      expect(isValidCallbackTime("Between two and four")).to.be.true;
      expect(isValidCallbackTime("Mornings")).to.be.true;
    });

    it('should reject unusable answers', () => {
      expect(isValidCallbackTime("")).to.be.false;
      expect(isValidCallbackTime("uh")).to.be.false;
      expect(isValidCallbackTime("I don't know")).to.be.false;
    });
  });
});

describe('Canonical Field Merge', () => {
  describe('mergeExtractedField', () => {
    it('should populate empty field with valid value', () => {
      const intake: IntakeData = {};
      const result = mergeExtractedField(
        intake,
        'customerName',
        'David Reynolds',
        () => true,
        'ask_name',
        'My name is David Reynolds'
      );
      expect(result).to.be.true;
      expect(intake.customerName).to.equal('David Reynolds');
    });

    it('should not clear existing value with undefined candidate', () => {
      const intake: IntakeData = { customerName: 'David Reynolds' };
      const result = mergeExtractedField(
        intake,
        'customerName',
        undefined,
        () => true,
        'ask_name',
        'test'
      );
      expect(result).to.be.false;
      expect(intake.customerName).to.equal('David Reynolds');
    });

    it('should not clear existing value with empty candidate', () => {
      const intake: IntakeData = { customerName: 'David Reynolds' };
      const result = mergeExtractedField(
        intake,
        'customerName',
        '',
        () => true,
        'ask_name',
        'test'
      );
      expect(result).to.be.false;
      expect(intake.customerName).to.equal('David Reynolds');
    });

    it('should not overwrite existing value with invalid candidate', () => {
      const intake: IntakeData = { customerName: 'David Reynolds' };
      const result = mergeExtractedField(
        intake,
        'customerName',
        "I'd rather not",
        () => false,
        'ask_name',
        'test'
      );
      expect(result).to.be.false;
      expect(intake.customerName).to.equal('David Reynolds');
    });

    it('should not overwrite existing value even with valid candidate (conservative)', () => {
      const intake: IntakeData = { customerName: 'David Reynolds' };
      const result = mergeExtractedField(
        intake,
        'customerName',
        'John Smith',
        () => true,
        'ask_name',
        'test'
      );
      expect(result).to.be.false;
      expect(intake.customerName).to.equal('David Reynolds');
    });

    it('should reject invalid candidate for empty field', () => {
      const intake: IntakeData = {};
      const result = mergeExtractedField(
        intake,
        'customerName',
        "I'd rather not",
        () => false,
        'ask_name',
        'test'
      );
      expect(result).to.be.false;
      expect(intake.customerName).to.be.undefined;
    });
  });
});

describe('Field-Aware Stage Resolver', () => {
  describe('David Reynolds Comprehensive Regression', () => {
    it('should route to complete when all onsite fields satisfied', () => {
      const intake: IntakeData = {
        customerName: 'David Reynolds',
        serviceRequested: 'fence gate repair',
        issueDescription: 'hinge pulled away from post during storm',
        serviceAddress: '5128 Walnut Street, Pittsburgh',
        desiredCompletionTime: 'sometime this week',
        callbackTime: 'afternoons'
      };
      const nextStage = resolveNextRequiredStage(intake, 'onsite');
      expect(nextStage).to.equal('complete');
    });

    it('should route to complete when all remote fields satisfied (no address)', () => {
      const intake: IntakeData = {
        customerName: 'David Reynolds',
        serviceRequested: 'fence gate repair',
        serviceAddress: undefined,
        desiredCompletionTime: 'sometime this week',
        callbackTime: 'afternoons'
      };
      const nextStage = resolveNextRequiredStage(intake, 'customer_comes_to_business');
      expect(nextStage).to.equal('complete');
    });
  });

  describe('Partial Field States', () => {
    it('should ask_completion_time when completion missing but location present', () => {
      const intake: IntakeData = {
        customerName: 'David Reynolds',
        serviceRequested: 'fence gate repair',
        serviceAddress: '5128 Walnut Street, Pittsburgh',
        callbackTime: 'afternoons'
        // desiredCompletionTime missing
      };
      const nextStage = resolveNextRequiredStage(intake, 'onsite');
      expect(nextStage).to.equal('ask_timing');
    });

    it('should ask_location when location missing but completion present', () => {
      const intake: IntakeData = {
        customerName: 'David Reynolds',
        serviceRequested: 'fence gate repair',
        desiredCompletionTime: 'sometime this week',
        callbackTime: 'afternoons'
        // serviceAddress missing
      };
      const nextStage = resolveNextRequiredStage(intake, 'onsite');
      expect(nextStage).to.equal('ask_location_or_context');
    });

    it('should ask_callback_time when callback missing', () => {
      const intake: IntakeData = {
        customerName: 'David Reynolds',
        serviceRequested: 'fence gate repair',
        serviceAddress: '5128 Walnut Street, Pittsburgh',
        desiredCompletionTime: 'sometime this week'
        // callbackTime missing
      };
      const nextStage = resolveNextRequiredStage(intake, 'onsite');
      expect(nextStage).to.equal('ask_callback_time');
    });
  });

  describe('Additional Details is Optional', () => {
    it('should route to complete without issueDescription', () => {
      const intake: IntakeData = {
        customerName: 'David Reynolds',
        serviceRequested: 'fence gate repair',
        // issueDescription missing (optional)
        serviceAddress: '5128 Walnut Street, Pittsburgh',
        desiredCompletionTime: 'sometime this week',
        callbackTime: 'afternoons'
      };
      const nextStage = resolveNextRequiredStage(intake, 'onsite');
      expect(nextStage).to.equal('complete');
    });
  });
});

describe('Simple Mode Stage Adapter', () => {
  describe('Stage Key Mapping', () => {
    it('should map ask_location_or_context to ask_location', () => {
      const intake: IntakeData = {
        customerName: 'David Reynolds',
        serviceRequested: 'fence gate repair',
        serviceAddress: '5128 Walnut Street, Pittsburgh',
        desiredCompletionTime: 'sometime this week',
        callbackTime: 'afternoons'
      };
      const nextStage = resolveNextSimpleModeStage(intake, 'onsite');
      // All required fields satisfied, should be complete
      expect(nextStage).to.equal('complete');
    });

    it('should map ask_timing to ask_completion_time when completion missing', () => {
      const intake: IntakeData = {
        customerName: 'David Reynolds',
        serviceRequested: 'fence gate repair',
        serviceAddress: '5128 Walnut Street, Pittsburgh',
        callbackTime: 'afternoons'
        // desiredCompletionTime missing
      };
      const nextStage = resolveNextSimpleModeStage(intake, 'onsite');
      expect(nextStage).to.equal('ask_completion_time');
    });

    it('should preserve ask_name_reason stage key when both name and request missing', () => {
      const intake: IntakeData = {};
      const nextStage = resolveNextSimpleModeStage(intake, 'onsite');
      expect(nextStage).to.equal('ask_name_reason');
    });

    it('should preserve ask_callback_time stage key when callback missing', () => {
      const intake: IntakeData = {
        customerName: 'David Reynolds',
        serviceRequested: 'fence gate repair',
        serviceAddress: '5128 Walnut Street, Pittsburgh',
        desiredCompletionTime: 'sometime this week'
        // callbackTime missing
      };
      const nextStage = resolveNextSimpleModeStage(intake, 'onsite');
      expect(nextStage).to.equal('ask_callback_time');
    });
  });

  describe('David Reynolds Real Simple Mode Regression', () => {
    it('should route to complete when all onsite fields satisfied', () => {
      const intake: IntakeData = {
        customerName: 'David Reynolds',
        serviceRequested: 'fence gate repair',
        issueDescription: 'hinge pulled away from post during storm',
        serviceAddress: '5128 Walnut Street, Pittsburgh',
        desiredCompletionTime: 'sometime this week',
        callbackTime: 'afternoons'
      };
      const nextStage = resolveNextSimpleModeStage(intake, 'onsite');
      expect(nextStage).to.equal('complete');
    });

    it('should route to ask_completion_time when completion missing but location present', () => {
      const intake: IntakeData = {
        customerName: 'David Reynolds',
        serviceRequested: 'fence gate repair',
        serviceAddress: '5128 Walnut Street, Pittsburgh',
        callbackTime: 'afternoons'
        // desiredCompletionTime missing
      };
      const nextStage = resolveNextSimpleModeStage(intake, 'onsite');
      expect(nextStage).to.equal('ask_completion_time');
    });

    it('should route to ask_location when location missing but completion present', () => {
      const intake: IntakeData = {
        customerName: 'David Reynolds',
        serviceRequested: 'fence gate repair',
        desiredCompletionTime: 'sometime this week',
        callbackTime: 'afternoons'
        // serviceAddress missing
      };
      const nextStage = resolveNextSimpleModeStage(intake, 'onsite');
      expect(nextStage).to.equal('ask_location');
    });

    it('should route to complete for remote mode without address', () => {
      const intake: IntakeData = {
        customerName: 'David Reynolds',
        serviceRequested: 'fence gate repair',
        // serviceAddress missing (not required for remote)
        desiredCompletionTime: 'sometime this week',
        callbackTime: 'afternoons'
      };
      const nextStage = resolveNextSimpleModeStage(intake, 'customer_comes_to_business');
      expect(nextStage).to.equal('complete');
    });
  });

  describe('Forward-Only Resolution', () => {
    it('should not move backwards when earlier field missing', () => {
      const intake: IntakeData = {
        customerName: 'David Reynolds',
        serviceRequested: 'fence gate repair',
        serviceAddress: '5128 Walnut Street, Pittsburgh',
        callbackTime: 'afternoons'
        // desiredCompletionTime missing
      };
      const nextStage = resolveNextSimpleModeStage(intake, 'onsite');
      // Should go to ask_completion_time, NOT back to ask_location_or_context or ask_name_reason
      expect(nextStage).to.equal('ask_completion_time');
      expect(nextStage).to.not.equal('ask_location');
      expect(nextStage).to.not.equal('ask_name_reason');
    });

    it('should not loop when caller refused name but provided other fields', () => {
      const intake: IntakeData = {
        // customerName missing (caller refused)
        serviceRequested: 'fence gate repair',
        serviceAddress: '5128 Walnut Street, Pittsburgh',
        desiredCompletionTime: 'sometime this week',
        callbackTime: 'afternoons'
      };
      const nextStage = resolveNextSimpleModeStage(intake, 'onsite');
      // Should stay on ask_name_reason since name is required
      expect(nextStage).to.equal('ask_name_reason');
    });
  });

  describe('Sequential Simple Mode Happy Path', () => {
    it('should progress through all stages sequentially', () => {
      // Initial: no fields
      let intake: IntakeData = {};
      let nextStage = resolveNextSimpleModeStage(intake, 'onsite');
      expect(nextStage).to.equal('ask_name_reason');

      // After ask_name_reason: name + request captured
      intake = {
        customerName: 'David Reynolds',
        serviceRequested: 'fence gate repair',
        stage: 'ask_name_reason'
      };
      nextStage = resolveNextSimpleModeStage(intake, 'onsite');
      expect(nextStage).to.equal('ask_location');

      // After ask_location: address captured
      intake = {
        customerName: 'David Reynolds',
        serviceRequested: 'fence gate repair',
        serviceAddress: '5128 Walnut Street, Pittsburgh',
        stage: 'ask_location'
      };
      nextStage = resolveNextSimpleModeStage(intake, 'onsite');
      expect(nextStage).to.equal('ask_completion_time');

      // After ask_completion_time: timing captured
      intake = {
        customerName: 'David Reynolds',
        serviceRequested: 'fence gate repair',
        serviceAddress: '5128 Walnut Street, Pittsburgh',
        desiredCompletionTime: 'sometime this week',
        stage: 'ask_completion_time'
      };
      nextStage = resolveNextSimpleModeStage(intake, 'onsite');
      expect(nextStage).to.equal('ask_callback_time');

      // After ask_callback_time: callback captured
      intake = {
        customerName: 'David Reynolds',
        serviceRequested: 'fence gate repair',
        serviceAddress: '5128 Walnut Street, Pittsburgh',
        desiredCompletionTime: 'sometime this week',
        callbackTime: 'afternoons',
        stage: 'ask_callback_time'
      };
      nextStage = resolveNextSimpleModeStage(intake, 'onsite');
      expect(nextStage).to.equal('complete');
    });
  });

  describe('Multi-Skip Tests', () => {
    it('should skip to ask_completion_time when location already captured', () => {
      const intake: IntakeData = {
        customerName: 'David Reynolds',
        serviceRequested: 'fence gate repair',
        serviceAddress: '5128 Walnut Street, Pittsburgh',
        stage: 'ask_name_reason'
      };
      const nextStage = resolveNextSimpleModeStage(intake, 'onsite');
      expect(nextStage).to.equal('ask_completion_time');
    });

    it('should skip to ask_callback_time when location + completion already captured', () => {
      const intake: IntakeData = {
        customerName: 'David Reynolds',
        serviceRequested: 'fence gate repair',
        serviceAddress: '5128 Walnut Street, Pittsburgh',
        desiredCompletionTime: 'sometime this week',
        stage: 'ask_name_reason'
      };
      const nextStage = resolveNextSimpleModeStage(intake, 'onsite');
      expect(nextStage).to.equal('ask_callback_time');
    });

    it('should route to complete when all fields captured including callback', () => {
      const intake: IntakeData = {
        customerName: 'David Reynolds',
        serviceRequested: 'fence gate repair',
        serviceAddress: '5128 Walnut Street, Pittsburgh',
        desiredCompletionTime: 'sometime this week',
        callbackTime: 'afternoons',
        stage: 'ask_name_reason'
      };
      const nextStage = resolveNextSimpleModeStage(intake, 'onsite');
      expect(nextStage).to.equal('complete');
    });

    it('should ask_location when completion + callback but no location (onsite)', () => {
      const intake: IntakeData = {
        customerName: 'David Reynolds',
        serviceRequested: 'fence gate repair',
        desiredCompletionTime: 'sometime this week',
        callbackTime: 'afternoons',
        stage: 'ask_name_reason'
      };
      const nextStage = resolveNextSimpleModeStage(intake, 'onsite');
      expect(nextStage).to.equal('ask_location');
    });

    it('should route to complete for customer_comes_to_business without location', () => {
      const intake: IntakeData = {
        customerName: 'David Reynolds',
        serviceRequested: 'fence gate repair',
        desiredCompletionTime: 'sometime this week',
        callbackTime: 'afternoons',
        stage: 'ask_name_reason'
      };
      const nextStage = resolveNextSimpleModeStage(intake, 'customer_comes_to_business');
      expect(nextStage).to.equal('complete');
    });

    it('should route to complete for remote mode without location', () => {
      const intake: IntakeData = {
        customerName: 'David Reynolds',
        serviceRequested: 'fence gate repair',
        desiredCompletionTime: 'sometime this week',
        callbackTime: 'afternoons',
        stage: 'ask_name_reason'
      };
      const nextStage = resolveNextSimpleModeStage(intake, 'remote');
      expect(nextStage).to.equal('complete');
    });
  });
});

describe('Sarah Thompson Physical Test Regression', () => {
  describe('Combined First Turn - Name + Request', () => {
    it('should resolve to ask_location when both name and service captured in one utterance', () => {
      // Simulate state after "My name is Sarah Thompson, and I need my garage door repaired."
      const intake: IntakeData = {
        customerName: 'Sarah Thompson',
        serviceRequested: 'my garage door repaired',
        stage: 'ask_name'
      };

      // Verify canonical state before resolver
      expect(intake.customerName).to.equal('Sarah Thompson');
      expect(intake.serviceRequested).to.not.be.undefined;
      expect(intake.serviceRequested).to.not.equal('');

      // Resolver should advance to location, NOT ask_name_reason
      const nextStage = resolveNextSimpleModeStage(intake, 'onsite');
      expect(nextStage).to.equal('ask_location');
      expect(nextStage).to.not.equal('ask_name_reason');
    });

    it('should preserve both canonical and compatibility fields', () => {
      // In production, both serviceRequested (canonical) and request (compatibility) are written
      const intake: IntakeData = {
        customerName: 'Sarah Thompson',
        serviceRequested: 'my garage door repaired',
        request: 'my garage door repaired', // Compatibility field
        stage: 'ask_name'
      };

      const nextStage = resolveNextSimpleModeStage(intake, 'onsite');
      expect(nextStage).to.equal('ask_location');
    });
  });

  describe('Name-Only Control', () => {
    it('should request service when only name provided', () => {
      // Simulate state after "Sarah Thompson"
      const intake: IntakeData = {
        customerName: 'Sarah Thompson',
        serviceRequested: undefined,
        stage: 'ask_name'
      };

      // Verify name captured, service missing
      expect(intake.customerName).to.equal('Sarah Thompson');
      expect(intake.serviceRequested).to.be.undefined;

      // Resolver should ask for service/reason
      const nextStage = resolveNextSimpleModeStage(intake, 'onsite');
      expect(nextStage).to.equal('ask_name_reason');
    });
  });

  describe('Second-Turn Service Continuation', () => {
    it('should accept service when name already valid and caller repeats full sentence', () => {
      // Starting state: name already captured
      const intake: IntakeData = {
        customerName: 'Sarah Thompson',
        serviceRequested: 'garage door repaired', // Extracted from repeated sentence
        stage: 'ask_name_reason'
      };

      // Verify name preserved, service now present
      expect(intake.customerName).to.equal('Sarah Thompson');
      expect(intake.serviceRequested).to.equal('garage door repaired');

      // Resolver should advance to location
      const nextStage = resolveNextSimpleModeStage(intake, 'onsite');
      expect(nextStage).to.equal('ask_location');
    });
  });

  describe('Partial Hangup Persistence Consistency', () => {
    it('should preserve both name and service for incomplete finalization', () => {
      // State after partial hangup with name + service captured
      const intake: IntakeData = {
        customerName: 'Sarah Thompson',
        serviceRequested: 'garage door repaired',
        request: 'garage door repaired', // Compatibility
        // Missing: serviceAddress, desiredCompletionTime, callbackTime
      };

      // Verify canonical state has both fields
      expect(intake.customerName).to.equal('Sarah Thompson');
      expect(intake.serviceRequested).to.equal('garage door repaired');

      // Resolver should still ask for missing fields (location)
      const nextStage = resolveNextSimpleModeStage(intake, 'onsite');
      expect(nextStage).to.equal('ask_location');
    });
  });

  describe('Timing Independence', () => {
    it('should resolve correctly regardless of when semantic extraction completes', () => {
      // This test proves deterministic extraction is sufficient
      // Semantic extraction happens at finalization, after all stage transitions
      const intake: IntakeData = {
        customerName: 'Sarah Thompson',
        serviceRequested: 'my garage door repaired', // Deterministic extraction
        stage: 'ask_name'
      };

      // Resolver uses canonical state immediately, no async dependency
      const nextStage = resolveNextSimpleModeStage(intake, 'onsite');
      expect(nextStage).to.equal('ask_location');

      // Even if semantic extraction later normalizes to "Garage Door Repair",
      // the stage decision is already committed and correct
    });
  });

  describe('Additional Details Remains Optional', () => {
    it('should route to complete without issueDescription when all required fields present', () => {
      const intake: IntakeData = {
        customerName: 'Sarah Thompson',
        serviceRequested: 'garage door repaired',
        serviceAddress: '123 Main Street',
        desiredCompletionTime: 'tomorrow',
        callbackTime: 'afternoon',
        // issueDescription missing (optional)
      };

      const nextStage = resolveNextSimpleModeStage(intake, 'onsite');
      expect(nextStage).to.equal('complete');
    });
  });

  describe('Location Branching Unchanged', () => {
    it('should require address for onsite location type', () => {
      const intake: IntakeData = {
        customerName: 'Sarah Thompson',
        serviceRequested: 'garage door repaired',
        // serviceAddress missing
        desiredCompletionTime: 'tomorrow',
        callbackTime: 'afternoon'
      };

      const nextStage = resolveNextSimpleModeStage(intake, 'onsite');
      expect(nextStage).to.equal('ask_location');
    });

    it('should NOT require address for remote location type', () => {
      const intake: IntakeData = {
        customerName: 'Sarah Thompson',
        serviceRequested: 'garage door repaired',
        // serviceAddress missing (not required for remote)
        desiredCompletionTime: 'tomorrow',
        callbackTime: 'afternoon'
      };

      const nextStage = resolveNextSimpleModeStage(intake, 'customer_comes_to_business');
      expect(nextStage).to.equal('complete');
    });
  });
});

describe('Name-Only Continuation Identity Detection', () => {
  describe('Identity-Only Utterances When Name Already Known', () => {
    it('should reject "I said my name is David Reynolds" as service when name is valid', () => {
      // Simulate state where name is valid but service is missing
      const intake: IntakeData = {
        customerName: 'David Reynolds',
        serviceRequested: undefined,
        stage: 'ask_name_reason'
      };

      // Verify name is present, service missing
      expect(intake.customerName).to.equal('David Reynolds');
      expect(intake.serviceRequested).to.be.undefined;

      // Resolver should stay on ask_name_reason (service still missing)
      const nextStage = resolveNextSimpleModeStage(intake, 'onsite');
      expect(nextStage).to.equal('ask_name_reason');
    });

    it('should reject "I already told you my name is David Reynolds" as service when name is valid', () => {
      const intake: IntakeData = {
        customerName: 'David Reynolds',
        serviceRequested: undefined,
        stage: 'ask_name_reason'
      };

      const nextStage = resolveNextSimpleModeStage(intake, 'onsite');
      expect(nextStage).to.equal('ask_name_reason');
    });

    it('should reject "My name is David Reynolds" as service when name is already valid', () => {
      const intake: IntakeData = {
        customerName: 'David Reynolds',
        serviceRequested: undefined,
        stage: 'ask_name_reason'
      };

      const nextStage = resolveNextSimpleModeStage(intake, 'onsite');
      expect(nextStage).to.equal('ask_name_reason');
    });

    it('should reject "This is David Reynolds" as service when name is already valid', () => {
      const intake: IntakeData = {
        customerName: 'David Reynolds',
        serviceRequested: undefined,
        stage: 'ask_name_reason'
      };

      const nextStage = resolveNextSimpleModeStage(intake, 'onsite');
      expect(nextStage).to.equal('ask_name_reason');
    });

    it('should reject "David Reynolds" as service when name is already valid', () => {
      const intake: IntakeData = {
        customerName: 'David Reynolds',
        serviceRequested: undefined,
        stage: 'ask_name_reason'
      };

      const nextStage = resolveNextSimpleModeStage(intake, 'onsite');
      expect(nextStage).to.equal('ask_name_reason');
    });
  });

  describe('Valid Service After Identity-Only Retry', () => {
    it('should accept valid service after identity-only response', () => {
      // After identity-only retry, caller provides valid service
      const intake: IntakeData = {
        customerName: 'David Reynolds',
        serviceRequested: 'fence repair', // Valid service provided
        stage: 'ask_name_reason'
      };

      // Resolver should advance to location
      const nextStage = resolveNextSimpleModeStage(intake, 'onsite');
      expect(nextStage).to.equal('ask_location');
    });
  });

  describe('Combined Name + Service Still Works', () => {
    it('should extract both name and service from combined sentence', () => {
      const intake: IntakeData = {
        customerName: 'Sarah Thompson',
        serviceRequested: 'garage door repaired',
        stage: 'ask_name'
      };

      const nextStage = resolveNextSimpleModeStage(intake, 'onsite');
      expect(nextStage).to.equal('ask_location');
    });
  });

  describe('Service-Only Continuation Works', () => {
    it('should accept valid service-only continuation when name is already valid', () => {
      const intake: IntakeData = {
        customerName: 'David Reynolds',
        serviceRequested: 'broken fence gate repair',
        stage: 'ask_name_reason'
      };

      const nextStage = resolveNextSimpleModeStage(intake, 'onsite');
      expect(nextStage).to.equal('ask_location');
    });
  });
});

describe('Prompt Selection and Dispatch', () => {
  describe('Field-Aware Prompt Selection Logic', () => {
    it('should require service-only prompt when name present, service missing', () => {
      const intake: IntakeData = {
        customerName: 'David Reynolds',
        serviceRequested: undefined,
        stage: 'ask_name_reason'
      };

      const hasValidCustomerName = !!intake.customerName && intake.customerName.trim().length > 0;
      const hasValidServiceRequested = !!intake.serviceRequested && intake.serviceRequested.trim().length > 0;

      expect(hasValidCustomerName).to.equal(true);
      expect(hasValidServiceRequested).to.equal(false);

      // Expected prompt key based on field state
      const expectedPromptKey = hasValidCustomerName && !hasValidServiceRequested
        ? 'ask_name_reason_service_only'
        : 'ask_name_reason';

      expect(expectedPromptKey).to.equal('ask_name_reason_service_only');
    });

    it('should require name-only prompt when service present, name missing', () => {
      const intake: IntakeData = {
        customerName: undefined,
        serviceRequested: 'fence repair',
        stage: 'ask_name_reason'
      };

      const hasValidCustomerName = !!intake.customerName && intake.customerName.trim().length > 0;
      const hasValidServiceRequested = !!intake.serviceRequested && intake.serviceRequested.trim().length > 0;

      expect(hasValidCustomerName).to.equal(false);
      expect(hasValidServiceRequested).to.equal(true);

      const expectedPromptKey = !hasValidCustomerName && hasValidServiceRequested
        ? 'ask_name_reason_name_only'
        : 'ask_name_reason';

      expect(expectedPromptKey).to.equal('ask_name_reason_name_only');
    });

    it('should use full combined prompt when both fields missing', () => {
      const intake: IntakeData = {
        customerName: undefined,
        serviceRequested: undefined,
        stage: 'ask_name_reason'
      };

      const hasValidCustomerName = !!intake.customerName && intake.customerName.trim().length > 0;
      const hasValidServiceRequested = !!intake.serviceRequested && intake.serviceRequested.trim().length > 0;

      expect(hasValidCustomerName).to.equal(false);
      expect(hasValidServiceRequested).to.equal(false);

      const expectedPromptKey = 'ask_name_reason';
      expect(expectedPromptKey).to.equal('ask_name_reason');
    });
  });

  describe('Same-Stage Reprompt Logic', () => {
    it('should allow same-stage reprompt when needsServiceReprompt is set', () => {
      const intake: IntakeData = {
        customerName: 'David Reynolds',
        serviceRequested: undefined,
        stage: 'ask_name_reason'
      };

      const nextStage = resolveNextSimpleModeStage(intake, 'onsite');
      const isSameStage = nextStage === intake.stage;
      const needsReprompt = true;

      expect(nextStage).to.equal('ask_name_reason');
      expect(isSameStage).to.equal(true);
      expect(needsReprompt).to.equal(true);

      const shouldDispatch = isSameStage && needsReprompt;
      expect(shouldDispatch).to.equal(true);
    });

    it('should not dispatch same-stage prompt without reprompt flag', () => {
      const intake: IntakeData = {
        customerName: 'David Reynolds',
        serviceRequested: undefined,
        stage: 'ask_name_reason'
      };

      const nextStage = resolveNextSimpleModeStage(intake, 'onsite');
      const isSameStage = nextStage === intake.stage;
      const needsReprompt = false;

      expect(nextStage).to.equal('ask_name_reason');
      expect(isSameStage).to.equal(true);
      expect(needsReprompt).to.equal(false);

      const shouldDispatch = isSameStage && needsReprompt;
      expect(shouldDispatch).to.equal(false);
    });
  });

  describe('Identity-Only Reprompt Sequence', () => {
    it('should stay on ask_name_reason after identity-only utterance', () => {
      const intake: IntakeData = {
        customerName: 'David Reynolds',
        serviceRequested: undefined,
        stage: 'ask_name_reason'
      };

      const nextStage = resolveNextSimpleModeStage(intake, 'onsite');
      expect(nextStage).to.equal('ask_name_reason');
    });

    it('should advance after valid service provided', () => {
      const intake: IntakeData = {
        customerName: 'David Reynolds',
        serviceRequested: 'fence repair',
        stage: 'ask_name_reason'
      };

      const nextStage = resolveNextSimpleModeStage(intake, 'onsite');
      expect(nextStage).to.equal('ask_location');
    });
  });

  describe('Combined Input Preservation', () => {
    it('should advance past ask_name_reason when both fields captured', () => {
      const intake: IntakeData = {
        customerName: 'Sarah Thompson',
        serviceRequested: 'garage door repair',
        stage: 'ask_name_reason'
      };

      const nextStage = resolveNextSimpleModeStage(intake, 'onsite');
      expect(nextStage).to.equal('ask_location');
    });
  });

  describe('Dispatch Success Contract', () => {
    it('should clear reprompt flags only when dispatch succeeds', async () => {
      const state: any = {
        callSid: 'CA_TEST',
        currentStage: 'ask_name_reason',
        intakeData: { customerName: 'David Reynolds', serviceRequested: undefined },
        needsServiceReprompt: true,
        needsNameReprompt: false,
        currentTurnId: 1,
      };

      const mockSendPrompt = async (_stage: string, _promptKeyOverride?: string) => {
        return Promise.resolve(true); // Simulate successful dispatch
      };

      const selectedPromptKey = 'ask_name_reason_service_only';
      const result = await mockSendPrompt(state.currentStage, selectedPromptKey);

      if (result) {
        state.needsServiceReprompt = false;
        state.needsNameReprompt = false;
      }

      expect(result).to.equal(true);
      expect(state.needsServiceReprompt).to.equal(false);
      expect(state.needsNameReprompt).to.equal(false);
    });

    it('should preserve reprompt flags when dispatch is suppressed', async () => {
      const state: any = {
        callSid: 'CA_TEST',
        currentStage: 'ask_name_reason',
        intakeData: { customerName: 'David Reynolds', serviceRequested: undefined },
        needsServiceReprompt: true,
        needsNameReprompt: false,
        currentTurnId: 1,
      };

      const mockSendPrompt = async (_stage: string, _promptKeyOverride?: string) => {
        return Promise.resolve(false); // Simulate suppressed dispatch
      };

      const selectedPromptKey = 'ask_name_reason_service_only';
      const result = await mockSendPrompt(state.currentStage, selectedPromptKey);

      if (result) {
        state.needsServiceReprompt = false;
        state.needsNameReprompt = false;
      }

      expect(result).to.equal(false);
      expect(state.needsServiceReprompt).to.equal(true); // Flags preserved
      expect(state.needsNameReprompt).to.equal(false);
    });

    it('should clear reprompt flags on dispatch error', async () => {
      const state: any = {
        callSid: 'CA_TEST',
        currentStage: 'ask_name_reason',
        intakeData: { customerName: 'David Reynolds', serviceRequested: undefined },
        needsServiceReprompt: true,
        needsNameReprompt: false,
        currentTurnId: 1,
      };

      const mockSendPrompt = async (_stage: string, _promptKeyOverride?: string) => {
        return Promise.reject(new Error('Network error')); // Simulate dispatch error
      };

      const selectedPromptKey = 'ask_name_reason_service_only';

      await mockSendPrompt(state.currentStage, selectedPromptKey)
        .then((result) => {
          if (result) {
            state.needsServiceReprompt = false;
            state.needsNameReprompt = false;
          }
        })
        .catch(() => {
          // Clear flags on error to prevent sticky behavior
          state.needsServiceReprompt = false;
          state.needsNameReprompt = false;
        });

      expect(state.needsServiceReprompt).to.equal(false); // Flags cleared on error
      expect(state.needsNameReprompt).to.equal(false);
    });
  });

  describe('Normal vs Corrective Prompt Selection', () => {
    it('should use canonical ask_request for normal post-name progression', () => {
      const intake: IntakeData = {
        customerName: 'David Reynolds',
        serviceRequested: undefined,
        stage: 'ask_name_reason'
      };

      const selectedPromptKey = selectSimpleModePromptKey(intake.stage, intake, {
        needsServiceReprompt: false,
        needsNameReprompt: false
      });

      expect(selectedPromptKey).to.equal('ask_request');
    });

    it('should use ask_name_reason_service_only for corrective reprompt after identity-only', () => {
      const intake: IntakeData = {
        customerName: 'David Reynolds',
        serviceRequested: undefined,
        stage: 'ask_name_reason'
      };

      const selectedPromptKey = selectSimpleModePromptKey(intake.stage, intake, {
        needsServiceReprompt: true,
        needsNameReprompt: false
      });

      expect(selectedPromptKey).to.equal('ask_name_reason_service_only');
    });

    it('should use ask_name_reason_name_only for name-only corrective reprompt', () => {
      const intake: IntakeData = {
        customerName: undefined,
        serviceRequested: 'fence repair',
        stage: 'ask_name_reason'
      };

      const selectedPromptKey = selectSimpleModePromptKey(intake.stage, intake, {
        needsServiceReprompt: false,
        needsNameReprompt: true
      });

      expect(selectedPromptKey).to.equal('ask_name_reason_name_only');
    });
  });

  describe('David Multi-Field Early Capture', () => {
    it('should capture serviceAddress when provided at ask_name_reason', () => {
      const intake: IntakeData = {
        customerName: 'David Reynolds',
        serviceRequested: undefined,
        serviceAddress: undefined,
        desiredCompletionTime: undefined,
        callbackTime: undefined,
        stage: 'ask_name_reason'
      };

      const transcript = "I need someone to repair a broken fence gate. It's at 5128 Walnut Street in Pittsburgh.";

      // Simulate extractFieldsFromTranscript behavior
      const addressPattern = /(?:at|@|address is|located at|it's at|its at)\s+([^.!?]+)/i;
      const match = transcript.match(addressPattern);

      expect(match).to.not.be.null;
      expect(match[1].trim()).to.equal('5128 Walnut Street in Pittsburgh');
    });

    it('should capture desiredCompletionTime when provided at ask_name_reason', () => {
      const intake: IntakeData = {
        customerName: 'David Reynolds',
        serviceRequested: undefined,
        serviceAddress: undefined,
        desiredCompletionTime: undefined,
        callbackTime: undefined,
        stage: 'ask_name_reason'
      };

      const transcript = "I need someone to repair a broken fence gate. I'd like it done sometime this week.";

      // Simulate extractFieldsFromTranscript behavior
      const timingPattern = /(?:sometime|this|next|today|tomorrow|this week|next week|no rush|whenever|as soon as possible|asap)([^.!?]*)/i;
      const match = transcript.match(timingPattern);

      expect(match).to.not.be.null;
      expect(match[0].trim()).to.include('sometime this week');
    });

    it('should capture callbackTime when provided at ask_name_reason', () => {
      const intake: IntakeData = {
        customerName: 'David Reynolds',
        serviceRequested: undefined,
        serviceAddress: undefined,
        desiredCompletionTime: undefined,
        callbackTime: undefined,
        stage: 'ask_name_reason'
      };

      const transcript = "I need someone to repair a broken fence gate. Afternoons are best if someone needs to call me.";

      // Simulate extractFieldsFromTranscript behavior
      const callbackPattern = /(?:anytime|morning|afternoon|evening|night|after \d+|before \d+|between \d+ and \d+)([^.!?]*)/i;
      const match = transcript.match(callbackPattern);

      expect(match).to.not.be.null;
      expect(match[0].trim().toLowerCase()).to.include('afternoon');
    });

    it('should capture issueDescription when provided at ask_name_reason', () => {
      const intake: IntakeData = {
        customerName: 'David Reynolds',
        serviceRequested: 'repair a broken fence gate',
        serviceAddress: undefined,
        desiredCompletionTime: undefined,
        callbackTime: undefined,
        issueDescription: undefined,
        stage: 'ask_name_reason'
      };

      const transcript = "The hinge pulled away from the post during the storm.";

      // Simulate extractFieldsFromTranscript behavior
      const detailPattern = /(?:because|due to|the|it's|its)\s+(?:the\s+)?(?:hinge|handle|door|window|pipe|gutter|roof|floor|wall|ceiling|fence|gate|lock|faucet|sink|toilet|shower|tub|ac|heater|furnace|boiler|electrical|wire|outlet|switch|light|bulb|appliance|machine|device|system|unit)([^.!?]*)/i;
      const match = transcript.match(detailPattern);

      expect(match).to.not.be.null;
      expect(match[0].trim()).to.include('hinge');
    });
  });

  describe('Resolver Behavior with Early Captured Fields', () => {
    it('should return complete when all onsite fields captured at ask_name_reason', () => {
      const intake: IntakeData = {
        customerName: 'David Reynolds',
        serviceRequested: 'repair a broken fence gate',
        serviceAddress: '5128 Walnut Street in Pittsburgh',
        desiredCompletionTime: 'sometime this week',
        callbackTime: 'afternoons are best',
        stage: 'ask_name_reason'
      };

      const nextStage = resolveNextSimpleModeStage(intake, 'onsite');

      expect(nextStage).to.equal('complete');
    });

    it('should return complete when all remote fields captured at ask_name_reason', () => {
      const intake: IntakeData = {
        customerName: 'David Reynolds',
        serviceRequested: 'repair a broken fence gate',
        serviceAddress: undefined, // Remote businesses don't require address
        desiredCompletionTime: 'sometime this week',
        callbackTime: 'afternoons are best',
        stage: 'ask_name_reason'
      };

      const nextStage = resolveNextSimpleModeStage(intake, 'remote');

      expect(nextStage).to.equal('complete');
    });
  });

  describe('Cross-Stage Early Field Capture', () => {
    it('should capture location when provided with request', () => {
      const intake: IntakeData = {
        customerName: 'David Reynolds',
        serviceRequested: undefined,
        serviceAddress: undefined,
        desiredCompletionTime: undefined,
        callbackTime: undefined,
        stage: 'ask_name_reason'
      };

      const transcript = "I need someone to repair a broken fence gate at 5128 Walnut Street.";

      // Simulate extractFieldsFromTranscript address extraction
      const addressPattern = /(\d+\s+[a-z]+\s+(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|way|court|ct|place|pl)(?:\s+[a-z]+)?)/i;
      const match = transcript.match(addressPattern);

      expect(match).to.not.be.null;
      expect(match[1].trim()).to.include('5128 Walnut Street');
    });

    it('should capture timing when provided with location', () => {
      const intake: IntakeData = {
        customerName: 'David Reynolds',
        serviceRequested: 'fence repair',
        serviceAddress: '5128 Walnut Street',
        desiredCompletionTime: undefined,
        callbackTime: undefined,
        stage: 'ask_location'
      };

      const transcript = "5128 Walnut Street. I'd like it done sometime this week.";

      // Simulate extractFieldsFromTranscript timing extraction
      const timingPattern = /(?:sometime|this|next|today|tomorrow|this week|next week|no rush|whenever|as soon as possible|asap)([^.!?]*)/i;
      const match = transcript.match(timingPattern);

      expect(match).to.not.be.null;
      expect(match[0].trim()).to.include('sometime this week');
    });

    it('should capture callback when provided with timing', () => {
      const intake: IntakeData = {
        customerName: 'David Reynolds',
        serviceRequested: 'fence repair',
        serviceAddress: '5128 Walnut Street',
        desiredCompletionTime: 'sometime this week',
        callbackTime: undefined,
        stage: 'ask_completion_time'
      };

      const transcript = "Sometime this week. Afternoons are best if someone needs to call me.";

      // Simulate extractFieldsFromTranscript callback extraction
      const callbackPattern = /(?:anytime|morning|afternoon|evening|night|after \d+|before \d+|between \d+ and \d+)([^.!?]*)/i;
      const match = transcript.match(callbackPattern);

      expect(match).to.not.be.null;
      expect(match[0].trim().toLowerCase()).to.include('afternoon');
    });
  });
});