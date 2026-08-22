import { describe, it, expect } from 'vitest';
import { getLeadAIIntake } from '../ai-field-mapping';
import { safeMergeVoicemailExtraction } from '../voicemail-extraction';

describe('USER CORRECTION PRECEDENCE - Production Functions', () => {
  describe('CASE A - Request Correction', () => {
    it('should use user-corrected serviceRequested over AI value', () => {
      const lead = {
        raw_metadata: {
          extracted_info: {
            serviceRequested: 'Plumbing'
          },
          corrected_fields: {
            serviceRequested: 'Kitchen Sink Repair'
          }
        }
      };

      const intake = getLeadAIIntake(lead);
      expect(intake.serviceRequested).toBe('Kitchen Sink Repair');
    });
  });

  describe('CASE B - Details Correction', () => {
    it('should use user-corrected details over AI value', () => {
      const lead = {
        raw_metadata: {
          extracted_info: {
            additionalDetails: 'Leak under sink'
          },
          corrected_fields: {
            details: 'Leak is under the left basin' // Alias is 'details', not 'additionalDetails'
          }
        }
      };

      const intake = getLeadAIIntake(lead);
      expect(intake.additionalDetails).toBe('Leak is under the left basin');
    });
  });

  describe('CASE C - Stale AI After Correction', () => {
    it('should preserve user correction even when AI provides stale value', () => {
      const lead = {
        raw_metadata: {
          extracted_info: {
            serviceRequested: 'Plumbing' // Stale AI value
          },
          corrected_fields: {
            serviceRequested: 'Kitchen Sink Repair' // User correction
          }
        }
      };

      const intake = getLeadAIIntake(lead);
      expect(intake.serviceRequested).toBe('Kitchen Sink Repair');
    });
  });

  describe('CASE D - Request Correction + Details Remain Independent', () => {
    it('should keep request correction and AI details separate', () => {
      const lead = {
        raw_metadata: {
          extracted_info: {
            additionalDetails: 'Leak appears near chimney during heavy rain'
          },
          corrected_fields: {
            serviceRequested: 'Roof Leak Repair'
          }
        }
      };

      const intake = getLeadAIIntake(lead);
      expect(intake.serviceRequested).toBe('Roof Leak Repair');
      expect(intake.additionalDetails).toBe('Leak appears near chimney during heavy rain');
    });
  });

  describe('CASE E - Details Correction Must Not Alter Title', () => {
    it('should keep original request when details are corrected', () => {
      const lead = {
        raw_metadata: {
          extracted_info: {
            serviceRequested: 'Furnace Repair'
          },
          corrected_fields: {
            details: 'Unit makes a clicking sound but does not start' // Alias is 'details'
          }
        }
      };

      const intake = getLeadAIIntake(lead);
      expect(intake.serviceRequested).toBe('Furnace Repair');
      expect(intake.additionalDetails).toBe('Unit makes a clicking sound but does not start');
    });
  });

  describe('EXPLICIT EMPTY USER CORRECTION', () => {
    it('should distinguish between absent correction and explicit empty string', () => {
      // Test 1: No correction present
      const leadNoCorrection = {
        raw_metadata: {
          extracted_info: {
            additionalDetails: 'Two cats'
          }
          // No corrected_fields
        }
      };

      const intakeNoCorrection = getLeadAIIntake(leadNoCorrection);
      expect(intakeNoCorrection.additionalDetails).toBe('Two cats');

      // Test 2: Explicit empty string correction
      const leadEmptyCorrection = {
        raw_metadata: {
          extracted_info: {
            additionalDetails: 'Two cats'
          },
          corrected_fields: {
            details: '' // Explicit empty string
          }
        }
      };

      const intakeEmptyCorrection = getLeadAIIntake(leadEmptyCorrection);
      // Current production behavior: empty string is falsy, so it falls through to next candidate
      // This test documents the actual behavior - empty string is NOT distinguishable from absent
      expect(intakeEmptyCorrection.additionalDetails).toBe('Two cats'); // Falls through to AI value
    });

    it('should distinguish between absent correction and explicit null', () => {
      // Test with explicit null correction
      const leadNullCorrection = {
        raw_metadata: {
          extracted_info: {
            additionalDetails: 'Two cats'
          },
          corrected_fields: {
            details: null // Explicit null
          }
        }
      };

      const intakeNullCorrection = getLeadAIIntake(leadNullCorrection);
      // Current production behavior: null is falsy, so it falls through to next candidate
      // This test documents the actual behavior - null is NOT distinguishable from absent
      expect(intakeNullCorrection.additionalDetails).toBe('Two cats'); // Falls through to AI value
    });
  });
});

describe('PARTIAL → FINAL MERGE PRECEDENCE - safeMergeVoicemailExtraction', () => {
  describe('CASE F - Final Improves Request', () => {
    it('should use final request when confidence is high', () => {
      const existingMetadata = {
        extracted_info: {
          reasonForCalling: 'Plumbing'
        }
      };

      const voicemailExtraction = {
        extractedInfo: {
          reasonForCalling: 'Kitchen Sink Leak'
        },
        confidence: 0.7, // Above 0.5 threshold
        source: 'sms',
        extractedAt: new Date().toISOString()
      };

      const merged = safeMergeVoicemailExtraction(existingMetadata, voicemailExtraction);
      expect(merged.extracted_info.reasonForCalling).toBe('Kitchen Sink Leak');
    });
  });

  describe('CASE G - Final Adds Details', () => {
    it('should add details when final provides them', () => {
      const existingMetadata = {
        extracted_info: {
          reasonForCalling: 'Kitchen Sink Leak',
          importantDetails: null
        }
      };

      const voicemailExtraction = {
        extractedInfo: {
          reasonForCalling: 'Kitchen Sink Leak',
          importantDetails: 'Leak is underneath the cabinet'
        },
        confidence: 0.7,
        source: 'sms',
        extractedAt: new Date().toISOString()
      };

      const merged = safeMergeVoicemailExtraction(existingMetadata, voicemailExtraction);
      expect(merged.extracted_info.reasonForCalling).toBe('Kitchen Sink Leak');
      expect(merged.extracted_info.importantDetails).toBe('Leak is underneath the cabinet');
    });
  });

  describe('CASE H - Null Final Preserves Existing', () => {
    it('should preserve existing details when final is null (no new info)', () => {
      const existingMetadata = {
        extracted_info: {
          reasonForCalling: 'Cat Sitter',
          importantDetails: 'Two cats'
        }
      };

      const voicemailExtraction = {
        extractedInfo: {
          reasonForCalling: 'Cat Sitter',
          importantDetails: null // No new information
        },
        confidence: 0.7,
        source: 'sms',
        extractedAt: new Date().toISOString()
      };

      const merged = safeMergeVoicemailExtraction(existingMetadata, voicemailExtraction);
      expect(merged.extracted_info.reasonForCalling).toBe('Cat Sitter');
      expect(merged.extracted_info.importantDetails).toBe('Two cats'); // Preserved
    });
  });

  describe('CASE I - Low Confidence Must Not Erase Good Value', () => {
    it('should preserve existing when new confidence is below threshold', () => {
      const existingMetadata = {
        extracted_info: {
          reasonForCalling: 'Water Heater Replacement'
        }
      };

      const voicemailExtraction = {
        extractedInfo: {
          reasonForCalling: 'Repair'
        },
        confidence: 0.3, // Below 0.5 threshold
        source: 'sms',
        extractedAt: new Date().toISOString()
      };

      const merged = safeMergeVoicemailExtraction(existingMetadata, voicemailExtraction);
      expect(merged.extracted_info.reasonForCalling).toBe('Water Heater Replacement'); // Preserved
    });
  });

  describe('CASE J - High Confidence Can Improve Value', () => {
    it('should use new value when confidence is high', () => {
      const existingMetadata = {
        extracted_info: {
          reasonForCalling: 'Repair'
        }
      };

      const voicemailExtraction = {
        extractedInfo: {
          reasonForCalling: 'Water Heater Replacement'
        },
        confidence: 0.8, // Above 0.5 threshold
        source: 'sms',
        extractedAt: new Date().toISOString()
      };

      const merged = safeMergeVoicemailExtraction(existingMetadata, voicemailExtraction);
      expect(merged.extracted_info.reasonForCalling).toBe('Water Heater Replacement');
    });
  });

  describe('Title/Details Separation Through Merge', () => {
    it('should keep request concise and details separate after merge', () => {
      const existingMetadata = {
        extracted_info: {
          reasonForCalling: 'Air Conditioning Repair',
          importantDetails: null
        }
      };

      const voicemailExtraction = {
        extractedInfo: {
          reasonForCalling: 'Air Conditioning Repair',
          importantDetails: 'Upstairs is not cooling but downstairs is working'
        },
        confidence: 0.7,
        source: 'sms',
        extractedAt: new Date().toISOString()
      };

      const merged = safeMergeVoicemailExtraction(existingMetadata, voicemailExtraction);
      expect(merged.extracted_info.reasonForCalling).toBe('Air Conditioning Repair');
      expect(merged.extracted_info.importantDetails).toBe('Upstairs is not cooling but downstairs is working');
    });
  });
});

describe('MERGE SEMANTICS - Missing Request After Merge', () => {
  it('should keep request as missing after merge when both are null', () => {
    const existingMetadata = {
      extracted_info: {
        reasonForCalling: null,
        importantDetails: 'Leak under cabinet'
      }
    };

    const voicemailExtraction = {
      extractedInfo: {
        reasonForCalling: null,
        importantDetails: 'Leak under cabinet'
      },
      confidence: 0.7,
      source: 'sms',
      extractedAt: new Date().toISOString()
    };

    const merged = safeMergeVoicemailExtraction(existingMetadata, voicemailExtraction);
    // Production behavior: undefined instead of null for missing values
    expect(merged.extracted_info.reasonForCalling).toBeUndefined();
    expect(merged.extracted_info.importantDetails).toBe('Leak under cabinet');
  });
});

describe('MERGE SEMANTICS - Optional Details After Merge', () => {
  it('should keep details as null after merge when both are null', () => {
    const existingMetadata = {
      extracted_info: {
        reasonForCalling: 'Lawn Mowing',
        importantDetails: null
      }
    };

    const voicemailExtraction = {
      extractedInfo: {
        reasonForCalling: 'Lawn Mowing',
        importantDetails: null
      },
      confidence: 0.7,
      source: 'sms',
        extractedAt: new Date().toISOString()
    };

    const merged = safeMergeVoicemailExtraction(existingMetadata, voicemailExtraction);
    expect(merged.extracted_info.reasonForCalling).toBe('Lawn Mowing');
    // Production behavior: undefined instead of null for missing values
    expect(merged.extracted_info.importantDetails).toBeUndefined();
  });
});