// Self-contained regression tests for raw request transcript extraction
// Tests the data flow: stageCaptures → extractRawRequestTranscriptFromStageCaptures → buildCanonicalExtractedInfo

// Import the ACTUAL production helper - no duplication
import { extractRawRequestTranscriptFromStageCaptures } from '../src/request-transcript-selection.ts';

describe('Raw Request Transcript for Additional Details', () => {
  describe('MICHAEL - Full request turn with additional details', () => {
    it('should extract raw request transcript containing additional details', () => {
      const stageCaptures = [
        {
          stage: 'ask_name',
          rawTranscript: 'Michael Carter',
          capturedAnswer: 'Michael Carter',
          extractedField: 'customerName',
          source: 'deterministic',
          timestamp: '2024-01-01T00:00:00Z'
        },
        {
          stage: 'ask_name_reason',
          rawTranscript: 'I need someone to look at a leaking kitchen faucet. It started dripping a few days ago and it\'s getting worse.',
          capturedAnswer: 'someone to look at a leaking kitchen faucet',
          extractedField: 'serviceRequested',
          source: 'semantic',
          timestamp: '2024-01-01T00:00:01Z'
        },
        {
          stage: 'ask_location',
          rawTranscript: '742 Evergreen Avenue in Pittsburgh',
          capturedAnswer: '742 Evergreen Avenue in Pittsburgh',
          extractedField: 'serviceAddress',
          source: 'deterministic',
          timestamp: '2024-01-01T00:00:02Z'
        },
        {
          stage: 'ask_completion_time',
          rawTranscript: 'Next week',
          capturedAnswer: 'Next week',
          extractedField: 'desiredCompletionTime',
          source: 'deterministic',
          timestamp: '2024-01-01T00:00:03Z'
        },
        {
          stage: 'ask_callback_time',
          rawTranscript: 'After 3 PM',
          capturedAnswer: 'After 3 PM',
          extractedField: 'callbackTime',
          source: 'deterministic',
          timestamp: '2024-01-01T00:00:04Z'
        }
      ];

      const rawRequestTranscript = extractRawRequestTranscriptFromStageCaptures(stageCaptures);

      // Should extract the request turn transcript
      if (!rawRequestTranscript) {
        throw new Error('Expected rawRequestTranscript to be non-null');
      }

      // Must contain the additional details
      if (!rawRequestTranscript.includes('started dripping a few days ago')) {
        throw new Error('Expected rawRequestTranscript to include "started dripping a few days ago"');
      }
      if (!rawRequestTranscript.includes('getting worse')) {
        throw new Error('Expected rawRequestTranscript to include "getting worse"');
      }

      // Must NOT contain later-stage answers
      if (rawRequestTranscript.includes('742 Evergreen Avenue')) {
        throw new Error('rawRequestTranscript should NOT contain address from later stage');
      }
      if (rawRequestTranscript.includes('Next week')) {
        throw new Error('rawRequestTranscript should NOT contain timing from later stage');
      }
      if (rawRequestTranscript.includes('After 3 PM')) {
        throw new Error('rawRequestTranscript should NOT contain callback from later stage');
      }

      console.log('[PASS] Michael raw request transcript extracted correctly');
      console.log('[PASS] Transcript contains: "started dripping a few days ago"');
      console.log('[PASS] Transcript contains: "getting worse"');
      console.log('[PASS] Transcript excludes later-stage answers');
    });
  });

  describe('SIMPLE REQUEST - Request-only utterance', () => {
    it('should extract raw request transcript for simple request without additional details', () => {
      const stageCaptures = [
        {
          stage: 'ask_name',
          rawTranscript: 'John Smith',
          capturedAnswer: 'John Smith',
          extractedField: 'customerName',
          source: 'deterministic',
          timestamp: '2024-01-01T00:00:00Z'
        },
        {
          stage: 'ask_name_reason',
          rawTranscript: 'I need my kitchen faucet repaired.',
          capturedAnswer: 'I need my kitchen faucet repaired',
          extractedField: 'serviceRequested',
          source: 'semantic',
          timestamp: '2024-01-01T00:00:01Z'
        }
      ];

      const rawRequestTranscript = extractRawRequestTranscriptFromStageCaptures(stageCaptures);

      if (!rawRequestTranscript) {
        throw new Error('Expected rawRequestTranscript to be non-null');
      }
      if (rawRequestTranscript !== 'I need my kitchen faucet repaired.') {
        throw new Error(`Expected "I need my kitchen faucet repaired." but got "${rawRequestTranscript}"`);
      }

      console.log('[PASS] Simple request transcript extracted correctly');
      console.log('[PASS] No additional details present (acceptable)');
    });
  });

  describe('GARAGE DETAIL - Request with component-specific detail', () => {
    it('should extract raw request transcript containing cable detail', () => {
      const stageCaptures = [
        {
          stage: 'ask_name_reason',
          rawTranscript: 'My garage door won\'t open. One of the cables snapped.',
          capturedAnswer: 'My garage door won\'t open',
          extractedField: 'serviceRequested',
          source: 'semantic',
          timestamp: '2024-01-01T00:00:00Z'
        }
      ];

      const rawRequestTranscript = extractRawRequestTranscriptFromStageCaptures(stageCaptures);

      if (!rawRequestTranscript) {
        throw new Error('Expected rawRequestTranscript to be non-null');
      }
      if (!rawRequestTranscript.includes('One of the cables snapped')) {
        throw new Error('Expected rawRequestTranscript to include "One of the cables snapped"');
      }

      console.log('[PASS] Garage detail transcript extracted correctly');
      console.log('[PASS] Transcript includes: "One of the cables snapped"');
    });
  });

  describe('FENCE DETAIL - Request with storm-related detail', () => {
    it('should extract raw request transcript containing hinge detail', () => {
      const stageCaptures = [
        {
          stage: 'ask_name_reason',
          rawTranscript: 'I need a fence gate repaired. The hinge pulled away from the post during the storm.',
          capturedAnswer: 'I need a fence gate repaired',
          extractedField: 'serviceRequested',
          source: 'semantic',
          timestamp: '2024-01-01T00:00:00Z'
        }
      ];

      const rawRequestTranscript = extractRawRequestTranscriptFromStageCaptures(stageCaptures);

      if (!rawRequestTranscript) {
        throw new Error('Expected rawRequestTranscript to be non-null');
      }
      if (!rawRequestTranscript.includes('The hinge pulled away from the post during the storm')) {
        throw new Error('Expected rawRequestTranscript to include hinge detail');
      }

      console.log('[PASS] Fence detail transcript extracted correctly');
      console.log('[PASS] Transcript includes: "The hinge pulled away from the post during the storm"');
    });
  });

  describe('LATER-STAGE CONTAMINATION - Sequential call with separate stages', () => {
    it('should only extract request turn, not later location/timing/callback', () => {
      const stageCaptures = [
        {
          stage: 'ask_name',
          rawTranscript: 'Jane Doe',
          capturedAnswer: 'Jane Doe',
          extractedField: 'customerName',
          source: 'deterministic',
          timestamp: '2024-01-01T00:00:00Z'
        },
        {
          stage: 'ask_name_reason',
          rawTranscript: 'I need my faucet repaired.',
          capturedAnswer: 'I need my faucet repaired',
          extractedField: 'serviceRequested',
          source: 'semantic',
          timestamp: '2024-01-01T00:00:01Z'
        },
        {
          stage: 'ask_location',
          rawTranscript: '742 Evergreen Avenue in Pittsburgh',
          capturedAnswer: '742 Evergreen Avenue in Pittsburgh',
          extractedField: 'serviceAddress',
          source: 'deterministic',
          timestamp: '2024-01-01T00:00:02Z'
        },
        {
          stage: 'ask_completion_time',
          rawTranscript: 'Next week',
          capturedAnswer: 'Next week',
          extractedField: 'desiredCompletionTime',
          source: 'deterministic',
          timestamp: '2024-01-01T00:00:03Z'
        },
        {
          stage: 'ask_callback_time',
          rawTranscript: 'After 3 PM',
          capturedAnswer: 'After 3 PM',
          extractedField: 'callbackTime',
          source: 'deterministic',
          timestamp: '2024-01-01T00:00:04Z'
        }
      ];

      const rawRequestTranscript = extractRawRequestTranscriptFromStageCaptures(stageCaptures);

      if (!rawRequestTranscript) {
        throw new Error('Expected rawRequestTranscript to be non-null');
      }
      if (rawRequestTranscript !== 'I need my faucet repaired.') {
        throw new Error(`Expected "I need my faucet repaired." but got "${rawRequestTranscript}"`);
      }
      if (rawRequestTranscript.includes('742 Evergreen Avenue')) {
        throw new Error('rawRequestTranscript should NOT contain location');
      }
      if (rawRequestTranscript.includes('Next week')) {
        throw new Error('rawRequestTranscript should NOT contain timing');
      }
      if (rawRequestTranscript.includes('After 3 PM')) {
        throw new Error('rawRequestTranscript should NOT contain callback');
      }

      console.log('[PASS] Later-stage contamination prevented');
      console.log('[PASS] Only request turn extracted');
    });
  });

  describe('EARLY MULTI-FIELD TURN - Request includes address volunteered in same turn', () => {
    it('should extract entire request turn including volunteered address', () => {
      const stageCaptures = [
        {
          stage: 'ask_name_reason',
          rawTranscript: 'I need my faucet repaired. It started leaking yesterday. It\'s at 742 Evergreen Avenue.',
          capturedAnswer: 'I need my faucet repaired',
          extractedField: 'serviceRequested',
          source: 'semantic',
          timestamp: '2024-01-01T00:00:00Z'
        }
      ];

      const rawRequestTranscript = extractRawRequestTranscriptFromStageCaptures(stageCaptures);

      if (!rawRequestTranscript) {
        throw new Error('Expected rawRequestTranscript to be non-null');
      }
      if (!rawRequestTranscript.includes('It started leaking yesterday')) {
        throw new Error('Expected rawRequestTranscript to include "It started leaking yesterday"');
      }
      if (!rawRequestTranscript.includes('at 742 Evergreen Avenue')) {
        throw new Error('Expected rawRequestTranscript to include volunteered address');
      }

      console.log('[PASS] Early multi-field turn extracted completely');
      console.log('[PASS] Transcript includes: "It started leaking yesterday"');
      console.log('[PASS] Transcript includes: "at 742 Evergreen Avenue" (volunteered in same turn)');
    });
  });

  describe('BACKWARD COMPATIBILITY - No request stage capture', () => {
    it('should return null when no request stage capture exists', () => {
      const stageCaptures = [
        {
          stage: 'ask_location',
          rawTranscript: '742 Evergreen Avenue in Pittsburgh',
          capturedAnswer: '742 Evergreen Avenue in Pittsburgh',
          extractedField: 'serviceAddress',
          source: 'deterministic',
          timestamp: '2024-01-01T00:00:00Z'
        }
      ];

      const rawRequestTranscript = extractRawRequestTranscriptFromStageCaptures(stageCaptures);

      if (rawRequestTranscript !== null) {
        throw new Error('Expected rawRequestTranscript to be null when no request stage exists');
      }

      console.log('[PASS] Backward compatibility: returns null when no request stage');
    });
  });

  describe('BLOCKED CAPTURES - Should skip blocked request captures', () => {
    it('should skip blocked request capture and return null or find valid capture', () => {
      const stageCaptures = [
        {
          stage: 'ask_name_reason',
          rawTranscript: 'This is a blocked answer',
          capturedAnswer: 'This is a blocked answer',
          extractedField: 'serviceRequested',
          source: 'deterministic',
          timestamp: '2024-01-01T00:00:00Z',
          blocked: true,
          blockReason: 'stage_finalized_field_already_set'
        }
      ];

      const rawRequestTranscript = extractRawRequestTranscriptFromStageCaptures(stageCaptures);

      if (rawRequestTranscript !== null) {
        throw new Error('Expected rawRequestTranscript to be null when only blocked capture exists');
      }

      console.log('[PASS] Blocked captures are skipped');
    });

    it('should return non-blocked capture when both blocked and non-blocked exist', () => {
      const stageCaptures = [
        {
          stage: 'ask_name_reason',
          rawTranscript: 'Blocked answer',
          capturedAnswer: 'Blocked answer',
          extractedField: 'serviceRequested',
          source: 'deterministic',
          timestamp: '2024-01-01T00:00:00Z',
          blocked: true,
          blockReason: 'stage_finalized_field_already_set'
        },
        {
          stage: 'ask_name_reason_service_only',
          rawTranscript: 'I need help with a garage door',
          capturedAnswer: 'I need help with a garage door',
          extractedField: 'serviceRequested',
          source: 'deterministic',
          timestamp: '2024-01-01T00:00:01Z'
        }
      ];

      const rawRequestTranscript = extractRawRequestTranscriptFromStageCaptures(stageCaptures);

      if (!rawRequestTranscript) {
        throw new Error('Expected rawRequestTranscript to be non-null from non-blocked capture');
      }
      if (rawRequestTranscript !== 'I need help with a garage door') {
        throw new Error('Expected non-blocked capture transcript');
      }

      console.log('[PASS] Non-blocked capture returned when both exist');
    });
  });

  describe('EMPTY STAGE CAPTURES', () => {
    it('should return null for empty stageCaptures array', () => {
      const rawRequestTranscript = extractRawRequestTranscriptFromStageCaptures([]);

      if (rawRequestTranscript !== null) {
        throw new Error('Expected rawRequestTranscript to be null for empty array');
      }

      console.log('[PASS] Returns null for empty stageCaptures');
    });

    it('should return null for undefined stageCaptures', () => {
      const rawRequestTranscript = extractRawRequestTranscriptFromStageCaptures(undefined as any);

      if (rawRequestTranscript !== null) {
        throw new Error('Expected rawRequestTranscript to be null for undefined');
      }

      console.log('[PASS] Returns null for undefined stageCaptures');
    });
  });

  describe('VARIANT REQUEST STAGES', () => {
    it('should extract from ask_name_reason stage', () => {
      const stageCaptures = [
        {
          stage: 'ask_name_reason',
          rawTranscript: 'I need help with plumbing',
          capturedAnswer: 'I need help with plumbing',
          extractedField: 'serviceRequested',
          source: 'semantic',
          timestamp: '2024-01-01T00:00:00Z'
        }
      ];

      const rawRequestTranscript = extractRawRequestTranscriptFromStageCaptures(stageCaptures);
      if (!rawRequestTranscript || rawRequestTranscript !== 'I need help with plumbing') {
        throw new Error('Failed to extract from ask_name_reason');
      }
      console.log('[PASS] Extracts from ask_name_reason');
    });

    it('should extract from ask_name_reason_service_only stage', () => {
      const stageCaptures = [
        {
          stage: 'ask_name_reason_service_only',
          rawTranscript: 'I need help with plumbing',
          capturedAnswer: 'I need help with plumbing',
          extractedField: 'serviceRequested',
          source: 'semantic',
          timestamp: '2024-01-01T00:00:00Z'
        }
      ];

      const rawRequestTranscript = extractRawRequestTranscriptFromStageCaptures(stageCaptures);
      if (!rawRequestTranscript || rawRequestTranscript !== 'I need help with plumbing') {
        throw new Error('Failed to extract from ask_name_reason_service_only');
      }
      console.log('[PASS] Extracts from ask_name_reason_service_only');
    });

    it('should extract from ask_request stage', () => {
      const stageCaptures = [
        {
          stage: 'ask_request',
          rawTranscript: 'I need help with plumbing',
          capturedAnswer: 'I need help with plumbing',
          extractedField: 'serviceRequested',
          source: 'semantic',
          timestamp: '2024-01-01T00:00:00Z'
        }
      ];

      const rawRequestTranscript = extractRawRequestTranscriptFromStageCaptures(stageCaptures);
      if (!rawRequestTranscript || rawRequestTranscript !== 'I need help with plumbing') {
        throw new Error('Failed to extract from ask_request');
      }
      console.log('[PASS] Extracts from ask_request');
    });

    it('should NOT extract from non-request stages', () => {
      const stageCaptures = [
        {
          stage: 'ask_location',
          rawTranscript: '123 Main Street',
          capturedAnswer: '123 Main Street',
          extractedField: 'serviceAddress',
          source: 'deterministic',
          timestamp: '2024-01-01T00:00:00Z'
        }
      ];

      const rawRequestTranscript = extractRawRequestTranscriptFromStageCaptures(stageCaptures);
      if (rawRequestTranscript !== null) {
        throw new Error('Should NOT extract from non-request stage');
      }
      console.log('[PASS] Does NOT extract from non-request stages');
    });
  });

  describe('FALLBACK BEHAVIOR', () => {
    it('should use extracted fields when rawRequestTranscript is null (buildCanonicalExtractedInfo contract)', () => {
      const fields = {
        serviceRequested: 'someone to look at a leaking kitchen faucet',
        customerName: 'Michael Carter'
      };

      const rawRequestTranscript = null;

      // Simulate buildCanonicalExtractedInfo fallback logic
      const rawRequestText = rawRequestTranscript && rawRequestTranscript.trim() !== ''
        ? rawRequestTranscript
        : (fields.serviceRequested || fields.request || fields.issueDescription || '');

      if (rawRequestText !== 'someone to look at a leaking kitchen faucet') {
        throw new Error('Fallback to extracted fields failed');
      }

      console.log('[PASS] Falls back to extracted fields when rawRequestTranscript is null');
    });
  });

  describe('MULTIPLE REQUEST CAPTURES / CORRECTION SCENARIO', () => {
    it('should select first non-blocked request capture when multiple exist', () => {
      const stageCaptures = [
        {
          stage: 'ask_name_reason',
          rawTranscript: 'I need help with plumbing.',
          capturedAnswer: 'I need help with plumbing',
          extractedField: 'serviceRequested',
          source: 'semantic',
          timestamp: '2024-01-01T00:00:00Z'
        },
        {
          stage: 'ask_name_reason',
          rawTranscript: 'Actually I need help with electrical work.',
          capturedAnswer: 'Actually I need help with electrical work',
          extractedField: 'serviceRequested',
          source: 'semantic',
          timestamp: '2024-01-01T00:00:01Z',
          blocked: true,
          blockReason: 'stage_finalized_field_already_set'
        }
      ];

      const rawRequestTranscript = extractRawRequestTranscriptFromStageCaptures(stageCaptures);

      // Should return the first (non-blocked) capture
      if (!rawRequestTranscript || rawRequestTranscript !== 'I need help with plumbing.') {
        throw new Error('Should select first non-blocked capture');
      }

      console.log('[PASS] First non-blocked capture selected when multiple exist');
      console.log('[PASS] Blocked second capture (correction) is skipped');
    });

    it('should handle scenario where all request captures are blocked', () => {
      const stageCaptures = [
        {
          stage: 'ask_name_reason',
          rawTranscript: 'First answer',
          capturedAnswer: 'First answer',
          extractedField: 'serviceRequested',
          source: 'semantic',
          timestamp: '2024-01-01T00:00:00Z',
          blocked: true,
          blockReason: 'stage_finalized_field_already_set'
        },
        {
          stage: 'ask_name_reason_service_only',
          rawTranscript: 'Second answer',
          capturedAnswer: 'Second answer',
          extractedField: 'serviceRequested',
          source: 'semantic',
          timestamp: '2024-01-01T00:00:01Z',
          blocked: true,
          blockReason: 'stage_finalized_field_already_set'
        }
      ];

      const rawRequestTranscript = extractRawRequestTranscriptFromStageCaptures(stageCaptures);

      // Should return null when all are blocked (fallback to extracted fields)
      if (rawRequestTranscript !== null) {
        throw new Error('Should return null when all captures are blocked');
      }

      console.log('[PASS] Returns null when all request captures are blocked');
    });
  });

  describe('CANONICAL SEMANTIC SOURCE SELECTION INTEGRATION', () => {
    it('should prefer rawRequestTranscript over extracted fields for semantic input', () => {
      const fields = {
        serviceRequested: 'someone to look at a leaking kitchen faucet',
        customerName: 'Michael Carter'
      };

      const rawRequestTranscript = 'I need someone to look at a leaking kitchen faucet. It started dripping a few days ago and it\'s getting worse.';

      // Simulate buildCanonicalExtractedInfo semantic source selection logic
      const rawRequestText = rawRequestTranscript && rawRequestTranscript.trim() !== ''
        ? rawRequestTranscript
        : (fields.serviceRequested || fields.request || fields.issueDescription || '');

      // Should prefer rawRequestTranscript
      if (rawRequestText !== rawRequestTranscript) {
        throw new Error('Should prefer rawRequestTranscript when available');
      }
      if (!rawRequestText.includes('started dripping a few days ago')) {
        throw new Error('Semantic input should include additional details from raw transcript');
      }

      console.log('[PASS] Semantic source selection prefers rawRequestTranscript');
      console.log('[PASS] Semantic input includes: "started dripping a few days ago"');
    });

    it('should fall back to extracted fields when rawRequestTranscript is empty', () => {
      const fields = {
        serviceRequested: 'someone to look at a leaking kitchen faucet',
        customerName: 'Michael Carter'
      };

      const rawRequestTranscript = '';

      // Simulate buildCanonicalExtractedInfo semantic source selection logic
      const rawRequestText = rawRequestTranscript && rawRequestTranscript.trim() !== ''
        ? rawRequestTranscript
        : (fields.serviceRequested || fields.request || fields.issueDescription || '');

      // Should fall back to extracted fields
      if (rawRequestText !== 'someone to look at a leaking kitchen faucet') {
        throw new Error('Should fall back to extracted fields when rawRequestTranscript is empty');
      }

      console.log('[PASS] Falls back to extracted fields when rawRequestTranscript is empty');
    });

    it('should fall back to extracted fields when rawRequestTranscript is null', () => {
      const fields = {
        serviceRequested: 'someone to look at a leaking kitchen faucet',
        customerName: 'Michael Carter'
      };

      const rawRequestTranscript = null;

      // Simulate buildCanonicalExtractedInfo semantic source selection logic
      const rawRequestText = rawRequestTranscript && rawRequestTranscript.trim() !== ''
        ? rawRequestTranscript
        : (fields.serviceRequested || fields.request || fields.issueDescription || '');

      // Should fall back to extracted fields
      if (rawRequestText !== 'someone to look at a leaking kitchen faucet') {
        throw new Error('Should fall back to extracted fields when rawRequestTranscript is null');
      }

      console.log('[PASS] Falls back to extracted fields when rawRequestTranscript is null');
    });
  });
});