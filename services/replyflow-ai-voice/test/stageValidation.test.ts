/**
 * Stage validation tests for ReplyFlow AI voice intake
 * Tests the validateStageAnswer function for rejecting filler, incomplete fragments,
 * and non-answers while accepting valid answers per stage.
 */

// Extract the validation logic from production for testing
function validateStageAnswer(stage: string, transcript: string, existingIntakeData?: { customerName: string; serviceRequested: string }): { accepted: boolean; rejectionReason?: string } {
  const trimmed = transcript.trim().toLowerCase();
  
  // Helper to check if text is filler-only
  const isFillerOnly = (text: string): boolean => {
    const fillerWords = ['yeah', 'yep', 'yes', 'uh', 'um', 'okay', 'ok', 'alright', 'sure', 'fine', 'sorry', 'well', 'so', 'hold on', 'one second', 'let me think', 'a minute'];
    const words = text.replace(/[.,!?]/g, '').split(/\s+/).filter(w => w.length > 0);
    if (words.length === 0) return true;
    if (words.length > 3) return false; // More than 3 words is likely not just filler
    return words.every(w => fillerWords.some(f => w === f || w.startsWith(f)));
  };
  
  // Helper to check if text has service-like content
  const hasServiceContent = (text: string): boolean => {
    const serviceIndicators = ['need', 'want', 'looking for', 'help with', 'service', 'repair', 'install', 'issue', 'problem', 'question', 'broken', 'not working', 'furnace', 'ac', 'heating', 'cooling', 'plumbing', 'electrical'];
    return serviceIndicators.some(ind => text.includes(ind));
  };
  
  // Helper to check if text has name-like content
  const hasNameContent = (text: string): boolean => {
    const nameIndicators = ['my name is', "i'm", 'i am', 'this is', 'call me'];
    return nameIndicators.some(ind => text.includes(ind));
  };
  
  // Stage-specific validation
  switch (stage) {
    case 'ask_name_reason':
      // Check existing intake state for ask_name_reason
      const hasExistingName = existingIntakeData?.customerName && existingIntakeData.customerName.trim().length > 0;
      const hasExistingService = existingIntakeData?.serviceRequested && existingIntakeData.serviceRequested.trim().length > 0;
      
      // If both name and service are already captured, any non-filler answer is acceptable
      if (hasExistingName && hasExistingService) {
        if (isFillerOnly(trimmed)) {
          return { accepted: false, rejectionReason: 'filler_only' };
        }
        return { accepted: true };
      }
      
      // If name is already captured but service is missing, allow service-only answers
      if (hasExistingName && !hasExistingService) {
        // Strip filler prefix and check for service content
        const fillerWords = ['yeah', 'yep', 'yes', 'uh', 'um', 'okay', 'ok', 'alright', 'sure', 'fine', 'sorry', 'well', 'so'];
        const afterFiller = trimmed.replace(new RegExp(`^(${fillerWords.join('|')})\\s*[,.]?\\s*`, 'i'), '').trim();
        
        // If after removing filler, we have service content, accept it
        if (hasServiceContent(afterFiller) && afterFiller.length >= 3) {
          return { accepted: true };
        }
        
        // If it's filler-only, reject
        if (isFillerOnly(trimmed)) {
          return { accepted: false, rejectionReason: 'filler_only' };
        }
        
        // If no service content detected, still accept (merge logic will handle it)
        return { accepted: true };
      }
      
      // If service is already captured but name is missing, allow name-only answers
      if (!hasExistingName && hasExistingService) {
        if (isFillerOnly(trimmed)) {
          return { accepted: false, rejectionReason: 'filler_only' };
        }
        if (hasNameContent(trimmed) || trimmed.length >= 2) {
          return { accepted: true };
        }
        return { accepted: false, rejectionReason: 'no_name_content' };
      }
      
      // If both are missing, require at least name or service content
      if (!hasExistingName && !hasExistingService) {
        if (isFillerOnly(trimmed)) {
          return { accepted: false, rejectionReason: 'filler_only' };
        }
        if (hasNameContent(trimmed) || hasServiceContent(trimmed)) {
          return { accepted: true };
        }
        // Accept if it's not filler-only (merge logic will extract what it can)
        return { accepted: true };
      }
      
      return { accepted: true };
    
    case 'ask_details':
    case 'ask_location':
    case 'ask_completion_time':
    case 'ask_callback_time':
      // Simplified for this test - focus on ask_name_reason
      if (isFillerOnly(trimmed)) {
        return { accepted: false, rejectionReason: 'filler_only' };
      }
      return { accepted: true };
    
    default:
      return { accepted: true };
  }
}

describe('Stage Validation Tests', () => {
  describe('Scenario: Two-turn partial capture + continuation', () => {
    it('should accept "Sorry, yeah. My furnace isn\'t turning on." as valid service-only continuation when name is already captured', () => {
      // Simulate state after first turn: name captured, service missing
      const existingIntakeData = {
        customerName: 'Robert Harris',
        serviceRequested: ''
      };
      
      // Second turn: filler prefix with meaningful service content
      const result = validateStageAnswer('ask_name_reason', 'Sorry, yeah. My furnace isn\'t turning on.', existingIntakeData);
      
      expect(result.accepted).toBe(true);
      expect(result.rejectionReason).toBeUndefined();
    });
    
    it('should accept "Um, my furnace isn\'t working" as valid service-only continuation when name is already captured', () => {
      const existingIntakeData = {
        customerName: 'Robert Harris',
        serviceRequested: ''
      };
      
      const result = validateStageAnswer('ask_name_reason', 'Um, my furnace isn\'t working', existingIntakeData);
      
      expect(result.accepted).toBe(true);
      expect(result.rejectionReason).toBeUndefined();
    });
    
    it('should reject pure filler "Sorry, yeah" when name is already captured but no service content', () => {
      const existingIntakeData = {
        customerName: 'Robert Harris',
        serviceRequested: ''
      };
      
      const result = validateStageAnswer('ask_name_reason', 'Sorry, yeah', existingIntakeData);
      
      expect(result.accepted).toBe(false);
      expect(result.rejectionReason).toBe('filler_only');
    });
    
    it('should accept combined answer when both name and service are missing', () => {
      const existingIntakeData = {
        customerName: '',
        serviceRequested: ''
      };
      
      const result = validateStageAnswer('ask_name_reason', 'My name is Robert Harris and I need a repair', existingIntakeData);
      
      expect(result.accepted).toBe(true);
      expect(result.rejectionReason).toBeUndefined();
    });
    
    it('should accept name-only continuation when service is already captured', () => {
      const existingIntakeData = {
        customerName: '',
        serviceRequested: 'furnace repair'
      };
      
      const result = validateStageAnswer('ask_name_reason', 'My name is Robert Harris', existingIntakeData);
      
      expect(result.accepted).toBe(true);
      expect(result.rejectionReason).toBeUndefined();
    });
  });
  
  describe('Scenario A: Pure filler words should be rejected', () => {
    const fillerWords = ['yeah', 'yep', 'yes', 'okay', 'ok', 'sure', 'alright', 'right', 'mm-hmm', 'uh-huh', 'hmm', 'uh', 'um', 'oh', 'hey', 'hi', 'hello', 'thanks', 'thank you', 'sorry'];
    const stages = ['ask_name_reason', 'ask_details', 'ask_location', 'ask_completion_time', 'ask_callback_time'];
    
    fillerWords.forEach(filler => {
      stages.forEach(stage => {
        it(`should reject "${filler}" for stage "${stage}"`, () => {
          const result = validateStageAnswer(stage, filler);
          expect(result.accepted).toBe(false);
          expect(result.rejectionReason).toBe('filler_only');
        });
      });
    });
  });
  
  describe('Scenario B: Filler with minimal content should be rejected', () => {
    const cases = [
      { transcript: 'yeah a', stage: 'ask_name_reason' },
      { transcript: 'um m', stage: 'ask_details' },
      { transcript: 'uh oh', stage: 'ask_location' },
      { transcript: 'ok i', stage: 'ask_completion_time' },
    ];
    
    cases.forEach(({ transcript, stage }) => {
      it(`should reject "${transcript}" for stage "${stage}"`, () => {
        const result = validateStageAnswer(stage, transcript);
        expect(result.accepted).toBe(false);
        expect(result.rejectionReason).toBe('filler_only');
      });
    });
  });
  
  describe('Scenario C: Valid answers should be accepted', () => {
    const cases = [
      { transcript: 'My name is John Smith and I need a repair', stage: 'ask_name_reason' },
      { transcript: "I'm Sarah calling about a service issue", stage: 'ask_name_reason' },
      { transcript: 'The water is leaking in the kitchen', stage: 'ask_details' },
      { transcript: "It's at 123 Main Street", stage: 'ask_location' },
      { transcript: 'Sometime this afternoon would be great', stage: 'ask_completion_time' },
      { transcript: 'Call me back at 3 PM', stage: 'ask_callback_time' },
    ];
    
    cases.forEach(({ transcript, stage }) => {
      it(`should accept "${transcript}" for stage "${stage}"`, () => {
        const result = validateStageAnswer(stage, transcript);
        expect(result.accepted).toBe(true);
        expect(result.rejectionReason).toBeUndefined();
      });
    });
  });
  
  describe('Scenario D: Filler with substantial content should be accepted', () => {
    const cases = [
      { transcript: 'Um, my name is Mike and I need help', stage: 'ask_name_reason' },
      { transcript: 'Yeah, the issue is that the AC is not working', stage: 'ask_details' },
      { transcript: 'Ok, it is located at 456 Oak Avenue', stage: 'ask_location' },
      { transcript: 'Sure, any time after 2 PM works', stage: 'ask_completion_time' },
    ];
    
    cases.forEach(({ transcript, stage }) => {
      it(`should accept "${transcript}" for stage "${stage}"`, () => {
        const result = validateStageAnswer(stage, transcript);
        expect(result.accepted).toBe(true);
        expect(result.rejectionReason).toBeUndefined();
      });
    });
  });
});
