import { strict as assert } from 'assert';
import { finalizeIncompleteOnWebsocketCloseSimple } from '../src/index';

describe('Simple Mode - WebSocket close finalization handoff', () => {
  it('awaits finalizeIncompleteIntake with required context and is idempotent by existing guard', async () => {
    const calls: any[] = [];
    const state: any = {
      callSid: 'CA_123',
      businessId: 'biz_1',
      callerPhone: '+15551234567',
      businessName: 'Biz',
      forwardedFrom: '',
      intakeData: { customerName: 'Ryan', serviceRequested: 'lawn mowing', issueDescription: '', serviceAddress: '', desiredCompletionTime: '', callbackTime: '' },
      stageCaptures: [ { stage: 'ask_name', rawTranscript: 'My name is Ryan', capturedAnswer: 'Ryan', extractedField: 'customerName', source: 'test', timestamp: new Date().toISOString() } ],
      transcript: 'My name is Ryan',
      completionPersistenceStarted: false,
    };

    const deps = {
      supabase: {} as any,
      finalizeIncompleteIntake: async (
        transcript: Array<{ role: string; text: string }>,
        intakeData: any,
        businessId: string,
        callerPhone: string,
        callSid: string,
        businessName: string,
        forwardedFrom: string,
        _supabase: any,
      ) => {
        calls.push({ transcript, intakeData, businessId, callerPhone, callSid, businessName, forwardedFrom });
      }
    };

    await finalizeIncompleteOnWebsocketCloseSimple(state, deps);
    assert.equal(calls.length, 1, 'persistence invoked exactly once');
    const c = calls[0];
    assert.equal(c.callSid, 'CA_123');
    assert.equal(c.businessId, 'biz_1');
    assert.equal(c.callerPhone, '+15551234567');
    assert.ok(Array.isArray(c.transcript) && c.transcript.length >= 1, 'transcript array persisted');

    // Simulate duplicate close source with idempotency already engaged
    state.completionPersistenceStarted = true;
    await finalizeIncompleteOnWebsocketCloseSimple(state, deps);
    assert.equal(calls.length, 1, 'persistence not invoked twice');
  });
});
