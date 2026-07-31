import { expect } from 'chai';
import { isValidAiCallRecordOutcome, ALLOWED_AI_CALL_RECORD_OUTCOMES } from '../src/lib/ai-call-record-outcome';

describe('ai_call_records outcome contract', () => {
  it('allows completed and completed_intake', () => {
    expect(isValidAiCallRecordOutcome('completed')).to.be.true;
    expect(isValidAiCallRecordOutcome('completed_intake')).to.be.true;
  });

  it('allows partial_intake', () => {
    expect(isValidAiCallRecordOutcome('partial_intake')).to.be.true;
  });

  it('allows early_hangup and no_speech', () => {
    expect(isValidAiCallRecordOutcome('early_hangup')).to.be.true;
    expect(isValidAiCallRecordOutcome('no_speech')).to.be.true;
  });

  it('allows ai_connection_failed, ai_failed, voicemail_fallback, incomplete, caller_hung_up', () => {
    expect(isValidAiCallRecordOutcome('ai_connection_failed')).to.be.true;
    expect(isValidAiCallRecordOutcome('ai_failed')).to.be.true;
    expect(isValidAiCallRecordOutcome('voicemail_fallback')).to.be.true;
    expect(isValidAiCallRecordOutcome('incomplete')).to.be.true;
    expect(isValidAiCallRecordOutcome('caller_hung_up')).to.be.true;
  });

  it('rejects legacy ai_completed, ai_partial, ai_failed_voicemail', () => {
    expect(isValidAiCallRecordOutcome('ai_completed')).to.be.false;
    expect(isValidAiCallRecordOutcome('ai_partial')).to.be.false;
    expect(isValidAiCallRecordOutcome('ai_failed_voicemail')).to.be.false;
  });

  it('rejects empty, null, and arbitrary strings', () => {
    expect(isValidAiCallRecordOutcome('')).to.be.false;
    expect(isValidAiCallRecordOutcome(null)).to.be.false;
    expect(isValidAiCallRecordOutcome(undefined)).to.be.false;
    expect(isValidAiCallRecordOutcome('not_an_outcome')).to.be.false;
  });

  it('contains exactly 10 allowed outcomes', () => {
    expect(ALLOWED_AI_CALL_RECORD_OUTCOMES).to.have.length(10);
  });
});
