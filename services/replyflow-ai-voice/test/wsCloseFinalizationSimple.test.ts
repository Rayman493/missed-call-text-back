// Keep the AI voice service from exiting during test load.
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-openai-key';

const assert = require('assert').strict;
const { finalizeIncompleteOnWebsocketCloseSimple } = require('../src/index');

describe('Simple Mode - WebSocket close finalization handoff', () => {
  it('awaits finalizeIncompleteIntake with required context and is idempotent by success flag', async () => {
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
      completionPersistenceSucceeded: false,
      completionPersistenceFailed: false,
      completionPersistencePromise: null,
      currentStage: 'ask_request',
    };

    const deps = {
      supabase: {} as any,
      finalizeIncompleteIntake: async (...args: any[]) => {
        calls.push(args);
      }
    };

    await finalizeIncompleteOnWebsocketCloseSimple(state, deps);
    assert.equal(calls.length, 1, 'persistence invoked exactly once');
    const c = calls[0];
    assert.equal(c[4], 'CA_123');
    assert.equal(c[2], 'biz_1');
    assert.equal(c[3], '+15551234567');
    assert.ok(Array.isArray(c[0]) && c[0].length >= 1, 'transcript array persisted');
    assert.equal(c[8]?.forceCompleteFallback, false, 'does not force complete fallback for incomplete stage');

    // Simulate duplicate close source with durable success already recorded
    state.completionPersistenceSucceeded = true;
    await finalizeIncompleteOnWebsocketCloseSimple(state, deps);
    assert.equal(calls.length, 1, 'persistence not invoked twice after success');
  });

  it('does not invoke fallback when an in-flight completion promise resolves successfully', async () => {
    const calls: any[] = [];
    const state: any = {
      callSid: 'CA_456',
      businessId: 'biz_2',
      callerPhone: '+15557654321',
      businessName: 'Biz',
      forwardedFrom: '',
      intakeData: { customerName: 'Alice', serviceRequested: 'leaky faucet', issueDescription: '', serviceAddress: '123 Main St', desiredCompletionTime: 'this week', callbackTime: 'tomorrow' },
      stageCaptures: [ { stage: 'ask_name', rawTranscript: 'Alice', capturedAnswer: 'Alice', extractedField: 'customerName', source: 'test', timestamp: new Date().toISOString() } ],
      transcript: 'Alice',
      completionPersistenceSucceeded: false,
      completionPersistenceFailed: false,
      completionPersistencePromise: null,
      currentStage: 'complete',
    };

    let resolve: (() => void) | null = null;
    state.completionPersistencePromise = new Promise<void>((res) => { resolve = res; });

    const deps = {
      supabase: {} as any,
      finalizeIncompleteIntake: async (...args: any[]) => {
        calls.push(args);
      }
    };

    const closePromise = finalizeIncompleteOnWebsocketCloseSimple(state, deps);
    assert.equal(calls.length, 0, 'does not call fallback while completion is in flight');

    state.completionPersistenceSucceeded = true;
    if (resolve) resolve();

    await closePromise;
    assert.equal(calls.length, 0, 'does not call fallback after successful completion');
  });

  it('invokes fallback when an in-flight completion promise rejects', async () => {
    const calls: any[] = [];
    const state: any = {
      callSid: 'CA_789',
      businessId: 'biz_3',
      callerPhone: '+15551112222',
      businessName: 'Biz',
      forwardedFrom: '',
      intakeData: { customerName: 'Bob', serviceRequested: 'repair', issueDescription: '', serviceAddress: '', desiredCompletionTime: '', callbackTime: '' },
      stageCaptures: [ { stage: 'ask_name', rawTranscript: 'Bob', capturedAnswer: 'Bob', extractedField: 'customerName', source: 'test', timestamp: new Date().toISOString() } ],
      transcript: 'Bob',
      completionPersistenceSucceeded: false,
      completionPersistenceFailed: false,
      completionPersistencePromise: null,
      currentStage: 'complete',
    };

    state.completionPersistencePromise = Promise.reject(new Error('completion failed'));

    const deps = {
      supabase: {} as any,
      finalizeIncompleteIntake: async (...args: any[]) => {
        calls.push(args);
      }
    };

    await finalizeIncompleteOnWebsocketCloseSimple(state, deps);
    assert.equal(calls.length, 1, 'fallback invoked after rejected completion');
    assert.equal(calls[0][8]?.forceCompleteFallback, true, 'forces complete fallback for failed completion in complete stage');
  });

  it('invokes fallback when no completion was started and data exists', async () => {
    const calls: any[] = [];
    const state: any = {
      callSid: 'CA_000',
      businessId: 'biz_4',
      callerPhone: '+15553334444',
      businessName: 'Biz',
      forwardedFrom: '',
      intakeData: { customerName: 'Carol', serviceRequested: 'cleaning', issueDescription: '', serviceAddress: '', desiredCompletionTime: '', callbackTime: '' },
      stageCaptures: [ { stage: 'ask_name', rawTranscript: 'Carol', capturedAnswer: 'Carol', extractedField: 'customerName', source: 'test', timestamp: new Date().toISOString() } ],
      transcript: 'Carol',
      completionPersistenceSucceeded: false,
      completionPersistenceFailed: false,
      completionPersistencePromise: null,
      currentStage: 'ask_request',
    };

    const deps = {
      supabase: {} as any,
      finalizeIncompleteIntake: async (...args: any[]) => {
        calls.push(args);
      }
    };

    await finalizeIncompleteOnWebsocketCloseSimple(state, deps);
    assert.equal(calls.length, 1, 'fallback invoked when no completion was started');
  });

  it('does not invoke fallback when there is no captured data', async () => {
    const calls: any[] = [];
    const state: any = {
      callSid: 'CA_no_data',
      businessId: 'biz_5',
      callerPhone: '+15555555555',
      businessName: 'Biz',
      forwardedFrom: '',
      intakeData: {},
      stageCaptures: [],
      transcript: '',
      completionPersistenceSucceeded: false,
      completionPersistenceFailed: false,
      completionPersistencePromise: null,
      currentStage: 'ask_name',
    };

    const deps = {
      supabase: {} as any,
      finalizeIncompleteIntake: async (...args: any[]) => {
        calls.push(args);
      }
    };

    await finalizeIncompleteOnWebsocketCloseSimple(state, deps);
    assert.equal(calls.length, 0, 'fallback not invoked when no data captured');
  });
});
