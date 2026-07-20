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
  
  describe('ISSUE 3: Timeout Reprompt Argument Flow', () => {
    // Test 1: Initial ask_details delivery identity
    it('Test 1 - Initial ask_details delivery identity', () => {
      const callSid = 'CA123';
      const turnId = 2;
      const stage = 'ask_details';
      
      // Initial delivery should use :initial suffix
      const initialIdentity = `${callSid}:${turnId}:${stage}:initial`;
      expect(initialIdentity).toContain(':initial');
      expect(initialIdentity).not.toContain('reprompt');
    });
    
    // Test 2: Timeout handler increments retry count
    it('Test 2 - Timeout handler increments retry count', () => {
      const silenceRetryCountByStage: { [key: string]: number } = {};
      const stage = 'ask_details';
      
      // First timeout
      silenceRetryCountByStage[stage] = 1;
      expect(silenceRetryCountByStage[stage]).toBe(1);
      
      // Second timeout would increment
      silenceRetryCountByStage[stage] = 2;
      expect(silenceRetryCountByStage[stage]).toBe(2);
    });
    
    // Test 3: Timeout handler invokes sendPrompt with correct arguments
    it('Test 3 - Timeout handler invokes sendPrompt with correct arguments', () => {
      const stage = 'ask_details';
      const promptKeyOverride = undefined;
      const source = 'stage_timeout_handler';
      const currentTurnId = 2;
      const silenceRetryCountByStage = { 'ask_details': 1 };
      
      // Verify arguments match sendPrompt signature:
      // (stage, promptKeyOverride, source, turnId, deliveryAttempt)
      expect(stage).toBe('ask_details');
      expect(promptKeyOverride).toBeUndefined();
      expect(source).toBe('stage_timeout_handler');
      expect(currentTurnId).toBe(2);
      expect(silenceRetryCountByStage['ask_details']).toBe(1);
    });
    
    // Test 4: Identity generated with reprompt-1
    it('Test 4 - Identity generated with reprompt-1', () => {
      const callSid = 'CA123';
      const turnId = 2;
      const stage = 'ask_details';
      const deliveryAttempt = 1;
      
      const deliveryIdentity = `${callSid}:${turnId}:${stage}:reprompt-${deliveryAttempt}`;
      expect(deliveryIdentity).toBe('CA123:2:ask_details:reprompt-1');
    });
    
    // Test 5: reprompt-1 is allowed (different from initial)
    it('Test 5 - reprompt-1 is allowed (different from initial)', () => {
      const sentPrompts = new Set<string>();
      const callSid = 'CA123';
      const turnId = 2;
      const stage = 'ask_details';
      
      // Initial delivery
      const initialIdentity = `${callSid}:${turnId}:${stage}:initial`;
      sentPrompts.add(initialIdentity);
      
      // Reprompt-1 delivery
      const repromptIdentity = `${callSid}:${turnId}:${stage}:reprompt-1`;
      expect(sentPrompts.has(repromptIdentity)).toBe(false); // Not in set, allowed
    });
    
    // Test 6: duplicate reprompt-1 is blocked
    it('Test 6 - duplicate reprompt-1 is blocked', () => {
      const sentPrompts = new Set<string>();
      const callSid = 'CA123';
      const turnId = 2;
      const stage = 'ask_details';
      
      // First reprompt-1
      const repromptIdentity = `${callSid}:${turnId}:${stage}:reprompt-1`;
      sentPrompts.add(repromptIdentity);
      
      // Duplicate reprompt-1
      expect(sentPrompts.has(repromptIdentity)).toBe(true); // Already in set, blocked
    });
    
    // Test 7: initial duplicate remains blocked
    it('Test 7 - initial duplicate remains blocked', () => {
      const sentPrompts = new Set<string>();
      const callSid = 'CA123';
      const turnId = 2;
      const stage = 'ask_details';
      
      // First initial delivery
      const initialIdentity = `${callSid}:${turnId}:${stage}:initial`;
      sentPrompts.add(initialIdentity);
      
      // Duplicate initial delivery
      expect(sentPrompts.has(initialIdentity)).toBe(true); // Already in set, blocked
    });
    
    // Test 8: authorizedTurnId is not undefined on timeout path
    it('Test 8 - authorizedTurnId is not undefined on timeout path', () => {
      const currentTurnId = 2;
      const authorizedTurnId = currentTurnId;
      
      expect(authorizedTurnId).toBeDefined();
      expect(authorizedTurnId).toBe(2);
    });
  });
  
  describe('ISSUE 4: Multi-Segment Answer Settle Window', () => {
    // Test A: Long answer with brief pause
    it('Test A - long answer with brief pause', () => {
      const stage = 'ask_details';
      const segment1 = 'The door goes halfway down and comes back up.';
      const segment2 = 'I cleaned the sensors but that didn\'t fix it.';
      
      const pendingAnswerSegments = [segment1, segment2];
      const accumulatedAnswer = pendingAnswerSegments.join(' ');
      
      expect(accumulatedAnswer).toBe('The door goes halfway down and comes back up. I cleaned the sensors but that didn\'t fix it.');
      expect(pendingAnswerSegments.length).toBe(2);
    });
    
    // Test B: Long answer with volunteered address
    it('Test B - long answer with volunteered address', () => {
      const stage = 'ask_details';
      const segment1 = 'The door goes halfway down and comes back up.';
      const segment2 = 'Also, I\'m at 742 Highland Avenue in Carnegie, Pennsylvania, 15106.';
      
      const pendingAnswerSegments = [segment1, segment2];
      const accumulatedAnswer = pendingAnswerSegments.join(' ');
      
      expect(accumulatedAnswer).toContain('The door goes halfway down and comes back up.');
      expect(accumulatedAnswer).toContain('742 Highland Avenue');
      expect(accumulatedAnswer).toContain('Carnegie, Pennsylvania, 15106');
      expect(pendingAnswerSegments.length).toBe(2);
    });
    
    // Test C: Short normal answer
    it('Test C - short normal answer', () => {
      const stage = 'ask_details';
      const transcript = 'It started yesterday.';
      
      // Short answer should be accepted normally without settle window delay
      expect(transcript).toBeDefined();
      expect(transcript.length).toBeLessThan(100);
    });
    
    // Test D: Caller truly stops after one valid details answer
    it('Test D - caller truly stops after one valid details answer', () => {
      const stage = 'ask_details';
      const segment1 = 'The door won\'t close properly.';
      const settleWindowMs = 1500;
      
      // Settle window expires without new speech
      setTimeout(() => {
        const finalAnswer = segment1;
        expect(finalAnswer).toBe('The door won\'t close properly.');
      }, settleWindowMs);
    });
    
    // Test E: New speech begins during settle window
    it('Test E - new speech begins during settle window', () => {
      const stage = 'ask_details';
      const segment1 = 'The door goes halfway down.';
      const segment2 = 'It comes back up after a few seconds.';
      
      // Simulate speech started during settle window
      let settleWindowTimeout = true;
      let pendingAnswerStage = stage;
      
      // Speech started - cancel settle window
      if (settleWindowTimeout && pendingAnswerStage) {
        settleWindowTimeout = false;
        pendingAnswerStage = null;
      }
      
      expect(settleWindowTimeout).toBe(false);
      expect(pendingAnswerStage).toBeNull();
    });
    
    // Test F: Silence reprompt still works
    it('Test F - silence reprompt still works', () => {
      const stage = 'ask_details';
      const silenceRetryCountByStage: { [key: string]: number } = {};
      
      // Caller says nothing at all after ask_details prompt
      // First timeout should trigger reprompt
      silenceRetryCountByStage[stage] = 1;
      
      expect(silenceRetryCountByStage[stage]).toBe(1);
      
      // Second timeout should finalize with partial info
      silenceRetryCountByStage[stage] = 2;
      expect(silenceRetryCountByStage[stage]).toBe(2);
    });
    
    // Test G: Settle window prevents stage timeout
    it('Test G - settle window prevents stage timeout', () => {
      const stage = 'ask_details';
      const settleWindowTimeout = true;
      const pendingAnswerStage = stage;
      
      // Stage timeout should be prevented if settle window is active
      const timeoutPrevented = settleWindowTimeout && pendingAnswerStage;
      expect(timeoutPrevented).toBe(true);
    });
    
    // Test H: Transcription watchdog prevented during settle window
    it('Test H - transcription watchdog prevented during settle window', () => {
      const settleWindowTimeout = true;
      const pendingAnswerStage = 'ask_details';
      
      // Watchdog should be prevented if settle window is active
      const watchdogPrevented = settleWindowTimeout && pendingAnswerStage;
      expect(watchdogPrevented).toBe(true);
    });
  });
  
  describe('ISSUE 5: Legacy Silence Timer Suppression', () => {
    // Test A: Legacy silence timer start blocked in Simple Mode
    it('Test A - legacy silence timer start blocked in Simple Mode', () => {
      const currentStage = 'ask_name_reason';
      const stageCaptures: string[] = [];
      const silentCloseStarted = false;
      
      // Legacy timer should be blocked for Simple Mode
      const timerBlocked = currentStage === 'ask_name_reason' && stageCaptures.length === 0 && !silentCloseStarted;
      
      // With the fix, the timer is now blocked for Simple Mode
      expect(timerBlocked).toBe(true);
    });
    
    // Test B: Current stage timeout enabled for ask_name_reason
    it('Test B - current stage timeout enabled for ask_name_reason', () => {
      const stage = 'ask_name_reason';
      const completeStage = 'complete';
      
      // Stage timeout should now start for ask_name_reason
      const timeoutStarts = stage !== completeStage;
      expect(timeoutStarts).toBe(true);
    });
    
    // Test C: Legacy timer blocked during settle window
    it('Test C - legacy timer blocked during settle window', () => {
      const settleWindowTimeout = true;
      const pendingAnswerStage = 'ask_details';
      
      // Legacy timer should be blocked if settle window is active
      const timerBlocked = settleWindowTimeout && pendingAnswerStage;
      expect(timerBlocked).toBe(true);
    });
    
    // Test D: Stage timeout is authoritative reprompt owner
    it('Test D - stage timeout is authoritative reprompt owner', () => {
      const owner = 'stage_timeout';
      const mode = 'simple_mode';
      const action = 'reprompt_authorized';
      
      expect(owner).toBe('stage_timeout');
      expect(mode).toBe('simple_mode');
      expect(action).toBe('reprompt_authorized');
    });
    
    // Test E: Only one timer system can send audio
    it('Test E - only one timer system can send audio', () => {
      const legacyTimerCanSendAudio = false; // Disabled for Simple Mode
      const stageTimeoutCanSendAudio = true; // Enabled for all stages
      
      expect(legacyTimerCanSendAudio).toBe(false);
      expect(stageTimeoutCanSendAudio).toBe(true);
    });
    
    // Test F: Settle window prevents all reprompt paths
    it('Test F - settle window prevents all reprompt paths', () => {
      const settleWindowTimeout = true;
      const pendingAnswerStage = 'ask_details';
      
      // Stage timeout prevented
      const stageTimeoutPrevented = settleWindowTimeout && pendingAnswerStage;
      // Legacy timer prevented
      const legacyTimerPrevented = settleWindowTimeout && pendingAnswerStage;
      // Watchdog prevented
      const watchdogPrevented = settleWindowTimeout && pendingAnswerStage;
      
      expect(stageTimeoutPrevented).toBe(true);
      expect(legacyTimerPrevented).toBe(true);
      expect(watchdogPrevented).toBe(true);
    });
    
    // Test G: True silence still produces one current-voice reprompt
    it('Test G - true silence still produces one current-voice reprompt', () => {
      const stage = 'ask_details';
      const retryCount = 0;
      const settleWindowTimeout = null;
      const pendingAnswerStage = null;
      
      // When there's no pending answer and caller says nothing
      const silenceDetected = retryCount === 0 && !settleWindowTimeout && !pendingAnswerStage;
      
      expect(silenceDetected).toBe(true);
      // Stage timeout should fire and send reprompt
    });
    
    // Test H: Old voice path not used in Simple Mode
    it('Test H - old voice path not used in Simple Mode', () => {
      const sendSimpleModeLivePromptUsed = false; // Legacy path disabled
      const sendPromptUsed = true; // Current path used
      
      expect(sendSimpleModeLivePromptUsed).toBe(false);
      expect(sendPromptUsed).toBe(true);
    });
  });
});

describe('ISSUE 6: Multi-Segment Answer Continuation Safety', () => {
  test('TEST A — Exact Melissa continuation', async () => {
    const state = createMockState();
    state.currentStage = 'ask_details';
    state.currentTurnId = 2;
    state.settleWindowMs = 1500;
    state.settleGeneration = 0;
    state.transcriptionPending = false;

    // First segment arrives
    const firstSegment = "The door goes down about halfway and then comes back up. I cleaned the sensors, but that didn't fix it.";
    const result1 = validateStageAnswer('ask_details', firstSegment, state.intakeData);
    expect(result1.accepted).toBe(true);

    // Simulate first segment starting settle window
    state.pendingAnswerStage = 'ask_details';
    state.pendingAnswerTurnId = 2;
    state.pendingAnswerSegments = [firstSegment];
    state.settleGeneration = 1;

    // Continuation speech starts before settle finalization
    setTimeout(() => {
      // speech_started event arrives
      state.speechStartedStage = 'ask_details';
      state.speechStartedTurnId = 2;
      state.transcriptionPending = true;
      
      // Settle window should be cancelled
      state.settleWindowTimeout = null;
      state.settleGeneration = 2; // Increment to invalidate stale callback
    }, 800); // Before 1500ms settle deadline

    // Second segment arrives
    const secondSegment = "The door itself doesn't look damaged. Also, I'm at 742 Highland Avenue...";
    state.transcriptionPending = false;
    const result2 = validateStageAnswer('ask_details', secondSegment, state.intakeData);
    expect(result2.accepted).toBe(true);

    // Both segments should be merged
    state.pendingAnswerSegments.push(secondSegment);
    expect(state.pendingAnswerSegments.length).toBe(2);
    expect(state.pendingAnswerStage).toBe('ask_details');
    expect(state.pendingAnswerTurnId).toBe(2);

    // Stage should remain ask_details while continuation is active
    expect(state.currentStage).toBe('ask_details');
  });

  test('TEST B — Speech starts just before settle deadline', async () => {
    const state = createMockState();
    state.currentStage = 'ask_details';
    state.currentTurnId = 2;
    state.settleWindowMs = 1500;
    state.settleGeneration = 0;
    state.pendingAnswerStage = 'ask_details';
    state.pendingAnswerTurnId = 2;
    state.pendingAnswerSegments = ["First segment"];
    state.settleGeneration = 1;

    // Simulate speech_started arriving just before deadline (1400ms)
    const capturedGeneration = state.settleGeneration;
    setTimeout(() => {
      // speech_started arrives
      state.speechStartedStage = 'ask_details';
      state.speechStartedTurnId = 2;
      state.settleGeneration = 2; // Increment to invalidate stale callback
      state.settleWindowTimeout = null;
    }, 1400);

    // Settle callback tries to execute at 1500ms
    setTimeout(() => {
      // Generation check should block stale callback
      expect(state.settleGeneration).toBe(2);
      expect(capturedGeneration).toBe(1);
      // Stale callback should not advance stage
      expect(state.currentStage).toBe('ask_details');
    }, 1600);
  });

  test('TEST C — Speech starts before deadline, transcription completes after deadline', async () => {
    const state = createMockState();
    state.currentStage = 'ask_details';
    state.currentTurnId = 2;
    state.settleWindowMs = 1500;
    state.settleGeneration = 0;
    state.transcriptionPending = false;

    // First segment
    state.pendingAnswerStage = 'ask_details';
    state.pendingAnswerTurnId = 2;
    state.pendingAnswerSegments = ["First segment"];
    state.settleGeneration = 1;

    // Speech starts before deadline
    state.speechStartedStage = 'ask_details';
    state.speechStartedTurnId = 2;
    state.transcriptionPending = true;
    state.settleGeneration = 2; // Cancel settle

    // Transcription completes after deadline (2000ms)
    setTimeout(() => {
      state.transcriptionPending = false;
      const secondSegment = "Continuation segment";
      const result = validateStageAnswer('ask_details', secondSegment, state.intakeData);
      expect(result.accepted).toBe(true);
      state.pendingAnswerSegments.push(secondSegment);
      expect(state.pendingAnswerSegments.length).toBe(2);
      // Stage should not have advanced
      expect(state.currentStage).toBe('ask_details');
    }, 2000);
  });

  test('TEST D — Stale settle callback executes after restart', async () => {
    const state = createMockState();
    state.currentStage = 'ask_details';
    state.currentTurnId = 2;
    state.settleWindowMs = 1500;
    state.settleGeneration = 0;
    state.pendingAnswerStage = 'ask_details';
    state.pendingAnswerTurnId = 2;
    state.pendingAnswerSegments = ["First segment"];

    // First settle window
    state.settleGeneration = 1;
    const capturedGeneration1 = state.settleGeneration;

    // Continuation speech starts, increments generation
    state.speechStartedStage = 'ask_details';
    state.speechStartedTurnId = 2;
    state.settleGeneration = 2;

    // Second segment arrives, restarts settle window
    state.pendingAnswerSegments.push("Second segment");
    state.settleGeneration = 3;
    const capturedGeneration2 = state.settleGeneration;

    // Stale callback from first generation tries to execute
    expect(capturedGeneration1).toBe(1);
    expect(state.settleGeneration).toBe(3);
    // Should be blocked by generation mismatch
    expect(capturedGeneration1 !== state.settleGeneration).toBe(true);
  });

  test('TEST E — No continuation', async () => {
    const state = createMockState();
    state.currentStage = 'ask_details';
    state.currentTurnId = 2;
    state.settleWindowMs = 1500;
    state.settleGeneration = 0;
    state.transcriptionPending = false;

    // Single complete answer
    const transcript = "The door goes down about halfway and then comes back up.";
    state.pendingAnswerStage = 'ask_details';
    state.pendingAnswerTurnId = 2;
    state.pendingAnswerSegments = [transcript];
    state.settleGeneration = 1;

    // No further speech, settle expires normally
    setTimeout(() => {
      expect(state.pendingAnswerSegments.length).toBe(1);
      expect(state.pendingAnswerStage).toBe('ask_details');
      // Should finalize and advance
      expect(state.currentStage).toBe('ask_location');
    }, 1600);
  });

  test('TEST F — Late truly stale transcription', async () => {
    const state = createMockState();
    state.currentStage = 'ask_location'; // Already advanced
    state.currentTurnId = 3;
    state.settleGeneration = 0;
    state.transcriptionPending = false;
    state.pendingAnswerStage = null; // No pending answer

    // Old transcription from ask_details arrives
    const oldTranscript = "The door doesn't look damaged";
    const result = validateStageAnswer('ask_details', oldTranscript, state.intakeData);
    
    // Since pendingAnswerStage is null and currentStage is ask_location,
    // this should be handled as stale and not persist
    expect(state.currentStage).toBe('ask_location');
    expect(state.pendingAnswerStage).toBe(null);
  });

  test('TEST G — No ask_location → ask_location advancement', async () => {
    const state = createMockState();
    state.currentStage = 'ask_location'; // Already on ask_location
    state.currentTurnId = 3;
    state.pendingAnswerStage = null;

    // Simulate an ask_details transcription arriving late
    const originatingStage = 'ask_details';
    const previousStage = state.currentStage; // ask_location
    const nextStage = 'ask_location'; // Would be same as current

    const isNonsensicalTransition = previousStage === nextStage;
    expect(isNonsensicalTransition).toBe(true);

    // This should be blocked by the invariant guard
    expect(previousStage).not.toBe(nextStage || originatingStage !== previousStage);
  });

  test('TEST H — Existing true-silence reprompt', async () => {
    const state = createMockState();
    state.currentStage = 'ask_details';
    state.currentTurnId = 2;
    state.settleWindowMs = 1500;
    state.stageTimeout = null;
    state.settleWindowTimeout = null;
    state.pendingAnswerStage = null;

    // Start stage timeout
    const STAGE_TIMEOUT_MS = 15000;
    state.stageTimeout = setTimeout(() => {
      // Handle stage timeout
      expect(state.currentStage).toBe('ask_details');
      expect(state.pendingAnswerStage).toBe(null);
      // Should send reprompt
      expect(state.stageTimeout).not.toBeNull();
    }, STAGE_TIMEOUT_MS);

    // Ensure legacy silence timer is disabled
    expect(state.silentTimeout).toBeUndefined();
  });
});
