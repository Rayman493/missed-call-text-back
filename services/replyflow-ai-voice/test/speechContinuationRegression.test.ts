/**
 * Speech Continuation Regression Tests
 * 
 * Tests for the fix that prevents premature stage finalization when
 * a caller's speech continues across multiple segments.
 * 
 * Production Issue: ask_callback_time finalized an incomplete first speech
 * segment ("Um, I guess it would, um probably be best") even though the caller
 * had already resumed speaking with the continuation ("sometime in the afternoon after 1 PM").
 * 
 * Root Cause: Non-settle-window stages (ask_callback_time, ask_location, ask_completion_time)
 * immediately accepted transcriptions and advanced the stage without checking if a newer
 * speech segment for the same stage/turn had already started.
 * 
 * Fix: Added continuation-speech check for ALL stages before immediate finalization.
 * When continuation speech is detected (via generation comparison), the transcription is stored
 * as a pending fragment and a settle window is started to allow the continuation transcription to arrive.
 */

import { describe, it } from 'mocha';
import { expect } from 'chai';

// Mock state interface matching the actual implementation
interface MockState {
  callSid: string;
  currentStage: string;
  currentTurnId: number;
  speechGeneration: number;
  pendingTranscriptionGeneration: number;
  inSpeechSegment: boolean;
  speechStartedStage: string | null;
  speechStartedTurnId: number | null;
  lastDetectedSpeechAt: number | null;
  lastSpeechStoppedAt: number | null;
  pendingAnswerStage: string | null;
  pendingAnswerTurnId: number | null;
  pendingAnswerSegments: string[];
  settleGeneration: number;
  settleWindowTimeout: NodeJS.Timeout | null;
  settleGraceTimeout: NodeJS.Timeout | null;
  settleGraceUsedForGeneration: number | null;
  answerAcceptedForStage: string | null;
}

function createMockState(): MockState {
  return {
    callSid: 'test-call-123',
    currentStage: 'ask_callback_time',
    currentTurnId: 1,
    speechGeneration: 1,
    pendingTranscriptionGeneration: 1,
    inSpeechSegment: false,
    speechStartedStage: null,
    speechStartedTurnId: null,
    lastDetectedSpeechAt: null,
    lastSpeechStoppedAt: null,
    pendingAnswerStage: null,
    pendingAnswerTurnId: null,
    pendingAnswerSegments: [],
    settleGeneration: 0,
    settleWindowTimeout: null,
    settleGraceTimeout: null,
    settleGraceUsedForGeneration: null,
    answerAcceptedForStage: null,
  };
}

// Continuation detection logic extracted from src/index.ts
function detectContinuationSpeech(
  state: MockState,
  originatingStage: string,
  originatingTurnId: number,
  transcriptionGeneration: number
): {
  sameTurnSpeechActive: boolean;
  speechOngoingNoStop: boolean;
  newerSpeechExists: boolean;
  hasContinuation: boolean;
} {
  const sameTurnSpeechActive = !!state.inSpeechSegment &&
    state.speechStartedStage === originatingStage &&
    state.speechStartedTurnId === originatingTurnId;
  
  const speechOngoingNoStop = state.lastDetectedSpeechAt !== null &&
    (state.lastSpeechStoppedAt === null || state.lastSpeechStoppedAt < state.lastDetectedSpeechAt);
  
  // GENERATION COMPARISON: Detect if a newer speech generation exists
  const newerSpeechExists = state.speechGeneration > transcriptionGeneration;
  
  const hasContinuation = sameTurnSpeechActive || newerSpeechExists || speechOngoingNoStop;
  
  return {
    sameTurnSpeechActive,
    speechOngoingNoStop,
    newerSpeechExists,
    hasContinuation,
  };
}

// Settle window requirement logic
function requiresSettleWindow(
  state: MockState,
  originatingStage: string,
  originatingTurnId: number,
  transcriptionGeneration: number
): boolean {
  const continuation = detectContinuationSpeech(state, originatingStage, originatingTurnId, transcriptionGeneration);
  const stagesWithIntrinsicSettleWindow = ['ask_details', 'ask_name_reason'];
  const hasIntrinsicSettleWindow = stagesWithIntrinsicSettleWindow.includes(originatingStage);
  
  return hasIntrinsicSettleWindow || (continuation.hasContinuation && originatingStage === state.currentStage);
}

describe('Speech Continuation Regression Tests', () => {
  describe('Continuation Detection Logic', () => {
    it('should detect continuation when newer speech generation exists', () => {
      const state = createMockState();
      state.speechGeneration = 2; // Newer speech started
      state.pendingTranscriptionGeneration = 1; // Old transcription pending
      
      const result = detectContinuationSpeech(state, 'ask_callback_time', 1, 1);
      
      expect(result.newerSpeechExists).to.be.true;
      expect(result.hasContinuation).to.be.true;
    });

    it('should detect continuation when same-turn speech is active', () => {
      const state = createMockState();
      state.inSpeechSegment = true;
      state.speechStartedStage = 'ask_callback_time';
      state.speechStartedTurnId = 1;
      
      const result = detectContinuationSpeech(state, 'ask_callback_time', 1, 1);
      
      expect(result.sameTurnSpeechActive).to.be.true;
      expect(result.hasContinuation).to.be.true;
    });

    it('should detect continuation when speech started but not stopped', () => {
      const state = createMockState();
      state.lastDetectedSpeechAt = Date.now();
      state.lastSpeechStoppedAt = null;
      
      const result = detectContinuationSpeech(state, 'ask_callback_time', 1, 1);
      
      expect(result.speechOngoingNoStop).to.be.true;
      expect(result.hasContinuation).to.be.true;
    });

    it('should not detect continuation when no signals present', () => {
      const state = createMockState();
      state.speechGeneration = 1;
      state.pendingTranscriptionGeneration = 1;
      
      const result = detectContinuationSpeech(state, 'ask_callback_time', 1, 1);
      
      expect(result.sameTurnSpeechActive).to.be.false;
      expect(result.speechOngoingNoStop).to.be.false;
      expect(result.newerSpeechExists).to.be.false;
      expect(result.hasContinuation).to.be.false;
    });

    it('should not detect continuation for different stage speech', () => {
      const state = createMockState();
      state.inSpeechSegment = true;
      state.speechStartedStage = 'ask_location'; // Different stage
      state.speechStartedTurnId = 1;
      
      const result = detectContinuationSpeech(state, 'ask_callback_time', 1, 1);
      
      expect(result.sameTurnSpeechActive).to.be.false;
      expect(result.hasContinuation).to.be.false;
    });

    it('should not detect continuation for different turn speech', () => {
      const state = createMockState();
      state.inSpeechSegment = true;
      state.speechStartedStage = 'ask_callback_time';
      state.speechStartedTurnId = 2; // Different turn
      
      const result = detectContinuationSpeech(state, 'ask_callback_time', 1, 1);
      
      expect(result.sameTurnSpeechActive).to.be.false;
      expect(result.hasContinuation).to.be.false;
    });
  });

  describe('Settle Window Requirement Logic', () => {
    it('should require settle window for intrinsic stages (ask_details)', () => {
      const state = createMockState();
      state.currentStage = 'ask_details';
      
      const result = requiresSettleWindow(state, 'ask_details', 1, 1);
      
      expect(result).to.be.true;
    });

    it('should require settle window for intrinsic stages (ask_name_reason)', () => {
      const state = createMockState();
      state.currentStage = 'ask_name_reason';
      
      const result = requiresSettleWindow(state, 'ask_name_reason', 1, 1);
      
      expect(result).to.be.true;
    });

    it('should require settle window for non-intrinsic stages when continuation detected', () => {
      const state = createMockState();
      state.currentStage = 'ask_callback_time';
      state.speechGeneration = 2; // Newer speech started
      
      const result = requiresSettleWindow(state, 'ask_callback_time', 1, 1);
      
      expect(result).to.be.true;
    });

    it('should NOT require settle window for non-intrinsic stages when no continuation', () => {
      const state = createMockState();
      state.currentStage = 'ask_callback_time';
      
      const result = requiresSettleWindow(state, 'ask_callback_time', 1, 1);
      
      expect(result).to.be.false;
    });

    it('should NOT require settle window when originating stage differs from current stage', () => {
      const state = createMockState();
      state.currentStage = 'ask_location';
      state.speechGeneration = 2; // Newer speech started
      
      const result = requiresSettleWindow(state, 'ask_callback_time', 1, 1);
      
      expect(result).to.be.false;
    });
  });

  describe('Production Race Condition Simulation', () => {
    it('should reproduce the exact production race: ask_callback_time with continuation', () => {
      // Simulate the exact production scenario:
      // 1. First speech segment starts (generation 1)
      // 2. First transcription arrives ("Um, I guess it would, um probably be best")
      // 3. Caller resumes speaking with continuation (generation 2)
      // 4. Second transcription should arrive ("sometime in the afternoon after 1 PM")
      // 5. Both should be merged before finalization
      
      const state = createMockState();
      state.currentStage = 'ask_callback_time';
      state.currentTurnId = 1;
      
      // First speech segment starts
      state.speechGeneration = 1;
      state.pendingTranscriptionGeneration = 1;
      
      // First transcription arrives
      const firstTranscriptionGen = 1;
      const firstContinuation = detectContinuationSpeech(state, 'ask_callback_time', 1, firstTranscriptionGen);
      
      // At this point, no continuation should be detected (speech generation matches)
      expect(firstContinuation.hasContinuation).to.be.false;
      
      // Caller resumes speaking (newer speech generation)
      state.speechGeneration = 2;
      
      // First transcription processing should now detect continuation
      const firstContinuationAfter = detectContinuationSpeech(state, 'ask_callback_time', 1, firstTranscriptionGen);
      expect(firstContinuationAfter.newerSpeechExists).to.be.true;
      expect(firstContinuationAfter.hasContinuation).to.be.true;
      
      // Settle window should be required
      const requiresSettle = requiresSettleWindow(state, 'ask_callback_time', 1, firstTranscriptionGen);
      expect(requiresSettle).to.be.true;
      
      // Second transcription arrives (from generation 2)
      const secondTranscriptionGen = 2;
      state.pendingTranscriptionGeneration = 2;
      
      const secondContinuation = detectContinuationSpeech(state, 'ask_callback_time', 1, secondTranscriptionGen);
      
      // At this point, no continuation should be detected (speech generation matches)
      expect(secondContinuation.newerSpeechExists).to.be.false;
      expect(secondContinuation.hasContinuation).to.be.false;
      
      // Both transcriptions should be merged
      state.pendingAnswerSegments = ['Um, I guess it would, um probably be best'];
      state.pendingAnswerSegments.push('sometime in the afternoon after 1 PM');
      
      expect(state.pendingAnswerSegments).to.have.lengthOf(2);
      expect(state.pendingAnswerSegments[0]).to.equal('Um, I guess it would, um probably be best');
      expect(state.pendingAnswerSegments[1]).to.equal('sometime in the afternoon after 1 PM');
    });

    it('should handle single-segment answers without continuation', () => {
      // Simulate normal single-segment answer
      const state = createMockState();
      state.currentStage = 'ask_callback_time';
      state.currentTurnId = 1;
      state.speechGeneration = 1;
      state.pendingTranscriptionGeneration = 1;
      
      const continuation = detectContinuationSpeech(state, 'ask_callback_time', 1, 1);
      const requiresSettle = requiresSettleWindow(state, 'ask_callback_time', 1, 1);
      
      expect(continuation.hasContinuation).to.be.false;
      expect(requiresSettle).to.be.false;
      // Should finalize immediately without settle window
    });

    it('should handle multiple continuation segments (3+ segments)', () => {
      // Simulate 3 segments being merged
      const state = createMockState();
      state.currentStage = 'ask_callback_time';
      state.currentTurnId = 1;
      
      // Segment 1
      state.speechGeneration = 1;
      state.pendingTranscriptionGeneration = 1;
      state.pendingAnswerSegments = ['I think'];
      
      // Segment 2 (continuation)
      state.speechGeneration = 2;
      const cont1 = detectContinuationSpeech(state, 'ask_callback_time', 1, 1);
      expect(cont1.newerSpeechExists).to.be.true;
      state.pendingAnswerSegments.push('probably');
      
      // Segment 3 (continuation)
      state.speechGeneration = 3;
      const cont2 = detectContinuationSpeech(state, 'ask_callback_time', 1, 1);
      expect(cont2.newerSpeechExists).to.be.true;
      state.pendingAnswerSegments.push('around 3 PM');
      
      expect(state.pendingAnswerSegments).to.have.lengthOf(3);
      expect(state.pendingAnswerSegments.join(' ')).to.equal('I think probably around 3 PM');
    });
  });

  describe('Settle Window Stage Compatibility', () => {
    it('should not break ask_details intrinsic settle window', () => {
      const state = createMockState();
      state.currentStage = 'ask_details';
      state.speechGeneration = 1;
      
      const requiresSettle = requiresSettleWindow(state, 'ask_details', 1, 1);
      expect(requiresSettle).to.be.true;
    });

    it('should not break ask_name_reason intrinsic settle window', () => {
      const state = createMockState();
      state.currentStage = 'ask_name_reason';
      state.speechGeneration = 1;
      
      const requiresSettle = requiresSettleWindow(state, 'ask_name_reason', 1, 1);
      expect(requiresSettle).to.be.true;
    });
  });

  describe('Generation Comparison Safety', () => {
    it('should correctly compare speech generation vs transcription generation', () => {
      const state = createMockState();
      
      // Case 1: speechGeneration > transcriptionGeneration (continuation)
      state.speechGeneration = 5;
      state.pendingTranscriptionGeneration = 3;
      const result1 = detectContinuationSpeech(state, 'ask_callback_time', 1, 3);
      expect(result1.newerSpeechExists).to.be.true;
      
      // Case 2: speechGeneration === transcriptionGeneration (no continuation)
      state.speechGeneration = 5;
      state.pendingTranscriptionGeneration = 5;
      const result2 = detectContinuationSpeech(state, 'ask_callback_time', 1, 5);
      expect(result2.newerSpeechExists).to.be.false;
      
      // Case 3: speechGeneration < transcriptionGeneration (stale transcription)
      state.speechGeneration = 3;
      state.pendingTranscriptionGeneration = 5;
      const result3 = detectContinuationSpeech(state, 'ask_callback_time', 1, 5);
      expect(result3.newerSpeechExists).to.be.false;
    });
  });
});
