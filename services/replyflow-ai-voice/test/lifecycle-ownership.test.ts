const { expect } = require('chai');
const { getOrCreateLeadByBusinessAndCaller, finalizeIncompleteOnWebsocketCloseSimple } = require('../src/index');

describe('Lead get-or-create helper', () => {
  it('returns an existing lead when one is found', async () => {
    const existing = { id: 'lead_1', business_id: 'biz', caller_phone: '+15551234567' };
    const supabase: any = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: existing, error: null }),
            }),
          }),
        }),
      }),
    };

    const { data, error } = await getOrCreateLeadByBusinessAndCaller(supabase, {
      business_id: 'biz',
      caller_phone: '+15551234567',
      status: 'new',
    });

    expect(error).to.be.null;
    expect(data?.id).to.equal('lead_1');
  });

  it('creates a new lead when none exists', async () => {
    let inserted = false;
    const supabase: any = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
        insert: (payload: any) => ({
          select: () => ({
            single: async () => {
              inserted = true;
              return { data: { id: 'lead_new', ...payload }, error: null };
            },
          }),
        }),
      }),
    };

    const { data, error } = await getOrCreateLeadByBusinessAndCaller(supabase, {
      business_id: 'biz',
      caller_phone: '+15551234567',
      status: 'new',
    });

    expect(error).to.be.null;
    expect(inserted).to.be.true;
    expect(data?.id).to.equal('lead_new');
  });

  it('recovers from a unique-violation race on insert', async () => {
    const existing = { id: 'lead_race', business_id: 'biz', caller_phone: '+15551234567' };
    let attempt = 0;
    const supabase: any = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => {
                if (attempt === 0) return { data: null, error: null };
                return { data: existing, error: null };
              },
            }),
          }),
        }),
        insert: (payload: any) => ({
          select: () => ({
            single: async () => {
              attempt++;
              return { data: null, error: { code: '23505', message: 'duplicate' } };
            },
          }),
        }),
      }),
    };

    const { data, error } = await getOrCreateLeadByBusinessAndCaller(supabase, {
      business_id: 'biz',
      caller_phone: '+15551234567',
      status: 'new',
    });

    expect(error).to.be.null;
    expect(data?.id).to.equal('lead_race');
  });
});

describe('Simple Mode complete ownership invariant', () => {
  it('fallback is invoked when a completed call has no completion owner', async () => {
    const calls: any[] = [];
    const state: any = {
      callSid: 'CA_complete_no_owner',
      businessId: 'biz',
      callerPhone: '+15550000000',
      businessName: 'Biz',
      forwardedFrom: '',
      serviceLocationType: 'onsite',
      intakeData: {
        customerName: 'Jason Williams',
        serviceRequested: 'a toilet repaired',
        serviceAddress: '100 Main Street',
        desiredCompletionTime: 'Friday',
        callbackTime: 'tomorrow morning',
      },
      stageCaptures: [{ stage: 'ask_name', rawTranscript: 'all fields', capturedAnswer: 'all fields', extractedField: 'customerName', source: 'test', timestamp: new Date().toISOString() }],
      transcript: 'all fields',
      currentStage: 'complete',
      completionPersistenceSucceeded: false,
      completionPersistenceFailed: false,
      completionPersistencePromise: null,
      completionOuterPromise: null,
    };

    const deps = {
      supabase: {} as any,
      finalizeIncompleteIntake: async (...args: any[]) => {
        calls.push(args);
      },
    };

    await finalizeIncompleteOnWebsocketCloseSimple(state, deps);
    expect(calls.length).to.equal(1);
    expect(calls[0][8]?.forceCompleteFallback).to.be.true;
  });

  it('fallback is NOT invoked when completion owner resolves successfully', async () => {
    const calls: any[] = [];
    const state: any = {
      callSid: 'CA_complete_owner',
      businessId: 'biz',
      callerPhone: '+15551111111',
      businessName: 'Biz',
      forwardedFrom: '',
      serviceLocationType: 'onsite',
      intakeData: {
        customerName: 'Jason Williams',
        serviceRequested: 'a toilet repaired',
        serviceAddress: '100 Main Street',
        desiredCompletionTime: 'Friday',
        callbackTime: 'tomorrow morning',
      },
      stageCaptures: [{ stage: 'ask_name', rawTranscript: 'all fields', capturedAnswer: 'all fields', extractedField: 'customerName', source: 'test', timestamp: new Date().toISOString() }],
      transcript: 'all fields',
      currentStage: 'complete',
      completionPersistenceSucceeded: false,
      completionPersistenceFailed: false,
      completionPersistencePromise: null,
      completionOuterPromise: Promise.resolve(),
    };

    state.completionPersistenceSucceeded = true;

    const deps = {
      supabase: {} as any,
      finalizeIncompleteIntake: async (...args: any[]) => {
        calls.push(args);
      },
    };

    await finalizeIncompleteOnWebsocketCloseSimple(state, deps);
    expect(calls.length).to.equal(0);
  });
});
