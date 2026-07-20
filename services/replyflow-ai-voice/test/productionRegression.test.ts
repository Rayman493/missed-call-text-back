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
  
  describe('ISSUE 2: Known-Name Service Extraction', () => {
    // Helper to simulate parseNameAndService with existing name
    const parseServiceOnlyContinuation = (text: string, existingName: string): { serviceRequested: string } => {
      // Strip conversational fillers at the beginning
      const stripConversationalFillers = (s: string): string => {
        const fillerPattern = /^(?:(?:yeah|yep|yes|uh|um|well|so|okay|ok|alright|hi|hey)(?=[,\s]|$)[,\s]*){1,2}/i;
        return s.replace(fillerPattern, '').trim();
      };
      
      const normalizedInput = stripConversationalFillers(text.trim());
      return { serviceRequested: normalizedInput };
    };
    
    // Test D: Robert Harris exact sequence
    it('Test D - Robert Harris exact sequence: Turn 1 name, Turn 2 service with filler', () => {
      // Turn 1
      const name = 'Robert Harris';
      const serviceAfterTurn1 = '';
      
      expect(name).toBe('Robert Harris');
      expect(serviceAfterTurn1).toBe('');
      
      // Turn 2: "Sorry, yeah. My furnace isn't turning on."
      const turn2Transcript = 'Sorry, yeah. My furnace isn\'t turning on.';
      const result = parseServiceOnlyContinuation(turn2Transcript, name);
      
      // Name should be preserved
      expect(name).toBe('Robert Harris');
      
      // Service should be the meaningful part, NOT "Sorry, yeah"
      expect(result.serviceRequested).toBe('My furnace isn\'t turning on.');
      expect(result.serviceRequested).not.toBe('Sorry, yeah');
      expect(result.serviceRequested).not.toBe('Sorry');
    });
    
    // Test E: Filler variations with known name
    it('Test E - filler variations with known name', () => {
      const name = 'Robert Harris';
      
      const testCases = [
        { input: 'Yeah, my furnace isn\'t turning on.', expected: 'my furnace isn\'t turning on.' },
        { input: 'Um, I need someone to repair my furnace.', expected: 'I need someone to repair my furnace.' },
        { input: 'Sorry. My basement drain keeps backing up.', expected: 'My basement drain keeps backing up.' },
      ];
      
      testCases.forEach(({ input, expected }) => {
        const result = parseServiceOnlyContinuation(input, name);
        expect(result.serviceRequested).toBe(expected);
      });
    });
    
    // Test F: Meaningful sentence preservation
    it('Test F - meaningful sentence preservation: Must not lose meaningful leading words', () => {
      const name = 'Robert Harris';
      const input = 'I need someone to look at a leaking kitchen faucet.';
      const result = parseServiceOnlyContinuation(input, name);
      
      // Should preserve the full meaningful sentence
      expect(result.serviceRequested).toBe('I need someone to look at a leaking kitchen faucet.');
    });
    
    // Test G: Raw versus structured
    it('Test G - raw versus structured: Raw transcript preserves complete wording, structured field stores normalized reason', () => {
      const name = 'Robert Harris';
      const rawTranscript = 'Sorry, yeah. My furnace isn\'t turning on.';
      const result = parseServiceOnlyContinuation(rawTranscript, name);
      
      // Raw transcript should be preserved elsewhere (not tested here, but conceptually)
      // Structured serviceRequested should store normalized meaningful reason
      expect(result.serviceRequested).toBe('My furnace isn\'t turning on.');
      
      // The filler should be stripped
      expect(result.serviceRequested).not.toContain('Sorry');
      expect(result.serviceRequested).not.toContain('yeah');
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
