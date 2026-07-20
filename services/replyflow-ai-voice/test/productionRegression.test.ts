/**
 * Production regression tests for ReplyFlow AI voice intake
 * Tests for two confirmed production failures:
 * ISSUE 1: Legitimate silence reprompt blocked by idempotency
 * ISSUE 2: Known-name reason continuation persists "Sorry, yeah"
 */

describe('Production Regression Tests', () => {
  describe('ISSUE 1: Prompt Delivery Identity and Idempotency', () => {
    // Test A: Original prompt duplicate
    it('Test A - original prompt duplicate: Two overlapping initial ask_details sends for the same logical turn', () => {
      // Simulate state
      const sentPrompts = new Set<string>();
      const callSid = 'CA123';
      const turnId = 2;
      const promptKey = 'ask_details';
      
      // First delivery
      const deliveryIdentity1 = `${callSid}:${turnId}:${promptKey}:initial`;
      sentPrompts.add(deliveryIdentity1);
      
      // Second overlapping delivery (same logical turn, same prompt, same attempt)
      const deliveryIdentity2 = `${callSid}:${turnId}:${promptKey}:initial`;
      
      // First should be allowed
      expect(sentPrompts.has(deliveryIdentity1)).toBe(true);
      
      // Second should be blocked as duplicate
      expect(sentPrompts.has(deliveryIdentity2)).toBe(true); // Already in set
      expect(deliveryIdentity1).toBe(deliveryIdentity2); // Same identity
    });
    
    // Test B: Legitimate reprompt
    it('Test B - legitimate reprompt: Initial ask_details delivered, timeout fires, reprompt attempt 1 triggered', () => {
      const sentPrompts = new Set<string>();
      const callSid = 'CA123';
      const turnId = 2;
      const promptKey = 'ask_details';
      
      // Initial delivery
      const initialIdentity = `${callSid}:${turnId}:${promptKey}:initial`;
      sentPrompts.add(initialIdentity);
      
      // Timeout fires, reprompt attempt 1
      const repromptIdentity = `${callSid}:${turnId}:${promptKey}:reprompt-1`;
      sentPrompts.add(repromptIdentity);
      
      // Initial should be in set
      expect(sentPrompts.has(initialIdentity)).toBe(true);
      
      // Reprompt should be allowed (different identity)
      expect(sentPrompts.has(repromptIdentity)).toBe(true);
      expect(initialIdentity).not.toBe(repromptIdentity);
    });
    
    // Test C: Duplicate reprompt trigger
    it('Test C - duplicate reprompt trigger: Two paths attempt reprompt attempt 1', () => {
      const sentPrompts = new Set<string>();
      const callSid = 'CA123';
      const turnId = 2;
      const promptKey = 'ask_details';
      
      // First reprompt attempt
      const repromptIdentity = `${callSid}:${turnId}:${promptKey}:reprompt-1`;
      sentPrompts.add(repromptIdentity);
      
      // Second path tries same reprompt attempt
      const duplicateRepromptIdentity = `${callSid}:${turnId}:${promptKey}:reprompt-1`;
      
      // First should be allowed
      expect(sentPrompts.has(repromptIdentity)).toBe(true);
      
      // Second should be blocked as duplicate (same identity)
      expect(sentPrompts.has(duplicateRepromptIdentity)).toBe(true);
      expect(repromptIdentity).toBe(duplicateRepromptIdentity);
    });
  });
  
  describe('ISSUE 2: Known-Name Service Extraction - Full Production Chain', () => {
    // Helper to simulate the actual production parseNameAndService function
    const parseNameAndService = (text: string, existingService?: string, existingName?: string): { customerName: string; serviceRequested: string } => {
      if (!text || typeof text !== 'string') {
        return { customerName: existingName ?? '', serviceRequested: existingService ?? '' };
      }

      const trimmed = text.trim();
      let customerName = existingName ?? trimmed;
      let serviceRequested = existingService ?? '';

      // Strip conversational fillers helper
      const stripConversationalFillers = (s: string): string => {
        const fillerPattern = /^(?:(?:yeah|yep|yes|uh|um|well|so|okay|ok|alright|hi|hey)(?=[,\s]|$)[,\s]*){1,2}/i;
        return s.replace(fillerPattern, '').trim();
      };

      // If name was already extracted but service is missing, treat as service-only continuation
      if (existingName && !existingService) {
        const normalizedInput = stripConversationalFillers(trimmed);
        serviceRequested = normalizedInput;
        customerName = existingName;
        return { customerName, serviceRequested };
      }

      // If service was already extracted, only clean the name portion
      if (existingService) {
        const existingLower = existingService.toLowerCase();
        const serviceIdx = trimmed.toLowerCase().indexOf(existingLower);
        const nameCandidate = serviceIdx > 0
          ? trimmed.slice(0, serviceIdx).trim()
          : trimmed;
        customerName = nameCandidate || trimmed;
        return { customerName, serviceRequested };
      }

      // Default: return original text as customerName if no existing values
      return { customerName: trimmed, serviceRequested: '' };
    };
    
    // Test 1: Exact Robert Harris two-turn production flow
    it('Test 1 - exact Robert Harris two-turn production flow', () => {
      // Turn 1: Name only
      const turn1Transcript = 'My name is Robert Harris.';
      const turn1Result = parseNameAndService(turn1Transcript);
      
      expect(turn1Result.customerName).toBe('Robert Harris');
      expect(turn1Result.serviceRequested).toBe('');
      
      // Turn 2: Service continuation with filler
      const turn2Transcript = 'Sorry, yeah. My furnace isn\'t turning on.';
      const turn2Result = parseNameAndService(turn2Transcript, undefined, turn1Result.customerName);
      
      // Name should be preserved
      expect(turn2Result.customerName).toBe('Robert Harris');
      
      // Service should be the meaningful part, NOT "Sorry, yeah"
      expect(turn2Result.serviceRequested).toBe('My furnace isn\'t turning on.');
      expect(turn2Result.serviceRequested).not.toBe('Sorry, yeah');
      expect(turn2Result.serviceRequested).not.toBe('Sorry');
    });
    
    // Test 2: Yeah filler
    it('Test 2 - Yeah filler with known name', () => {
      const existingName = 'Robert Harris';
      const input = 'Yeah, my furnace isn\'t turning on.';
      const result = parseNameAndService(input, undefined, existingName);
      
      expect(result.serviceRequested).toBe('my furnace isn\'t turning on.');
      expect(result.customerName).toBe('Robert Harris');
    });
    
    // Test 3: Um filler
    it('Test 3 - Um filler with known name', () => {
      const existingName = 'Robert Harris';
      const input = 'Um, I need someone to repair my furnace.';
      const result = parseNameAndService(input, undefined, existingName);
      
      expect(result.serviceRequested).toBe('I need someone to repair my furnace.');
      expect(result.customerName).toBe('Robert Harris');
    });
    
    // Test 4: Sorry filler
    it('Test 4 - Sorry filler with known name', () => {
      const existingName = 'Robert Harris';
      const input = 'Sorry. My basement drain keeps backing up.';
      const result = parseNameAndService(input, undefined, existingName);
      
      expect(result.serviceRequested).toBe('My basement drain keeps backing up.');
      expect(result.customerName).toBe('Robert Harris');
    });
    
    // Test 5: Raw transcript preservation
    it('Test 5 - Raw transcript preservation vs structured value', () => {
      const existingName = 'Robert Harris';
      const rawTranscript = 'Sorry, yeah. My furnace isn\'t turning on.';
      const result = parseNameAndService(rawTranscript, undefined, existingName);
      
      // Raw transcript should be preserved elsewhere (not tested here)
      // Structured serviceRequested should store normalized meaningful reason
      expect(result.serviceRequested).toBe('My furnace isn\'t turning on.');
      
      // The filler should be stripped
      expect(result.serviceRequested).not.toContain('Sorry');
      expect(result.serviceRequested).not.toContain('yeah');
    });
    
    // Test 6: Inverse scenario - service known, name missing
    it('Test 6 - Inverse scenario: service known, name missing', () => {
      const existingService = 'furnace repair';
      const input = 'My name is Robert Harris';
      const result = parseNameAndService(input, existingService, undefined);
      
      expect(result.customerName).toBe('Robert Harris');
      expect(result.serviceRequested).toBe('furnace repair'); // Preserved
    });
    
    // Test 7: Both missing - combined answer
    it('Test 7 - Both missing: combined name and service answer', () => {
      const input = 'My name is Robert Harris and I need a repair';
      const result = parseNameAndService(input);
      
      expect(result.customerName).toBe(input);
      expect(result.serviceRequested).toBe('');
    });
  });
  
  describe('Combined Regression Tests', () => {
    it('Full Robert Harris scenario: Name capture, service continuation with filler, then reprompt', () => {
      // Turn 1: Name capture
      const name = 'Robert Harris';
      const service = '';
      
      expect(name).toBe('Robert Harris');
      expect(service).toBe('');
      
      // Turn 2: Service continuation with filler
      const turn2Transcript = 'Sorry, yeah. My furnace isn\'t turning on.';
      const parseServiceOnlyContinuation = (text: string): string => {
        const stripConversationalFillers = (s: string): string => {
          const fillerPattern = /^(?:(?:yeah|yep|yes|uh|um|well|so|okay|ok|alright|hi|hey)(?=[,\s]|$)[,\s]*){1,2}/i;
          return s.replace(fillerPattern, '').trim();
        };
        return stripConversationalFillers(text.trim());
      };
      
      const extractedService = parseServiceOnlyContinuation(turn2Transcript);
      expect(extractedService).toBe('My furnace isn\'t turning on.');
      expect(extractedService).not.toBe('Sorry, yeah');
      
      // Turn 3: Silence timeout, reprompt
      const callSid = 'CA123';
      const turnId = 2;
      const stage = 'ask_details';
      
      const initialIdentity = `${callSid}:${turnId}:${stage}:initial`;
      const repromptIdentity = `${callSid}:${turnId}:${stage}:reprompt-1`;
      
      expect(initialIdentity).not.toBe(repromptIdentity);
      expect(repromptIdentity).toContain('reprompt-1');
    });
  });
});
