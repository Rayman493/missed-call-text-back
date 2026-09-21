/**
 * REPLYFLOW — AI INTAKE HARDENING BATCH 4.
 * Request-stage progression + Details ownership + reprompt identity.
 *
 * Covers the three production-proven defects:
 *  A. accepted ask_request can persist but post-finalization nextStage stays
 *     ask_request (canonical-vs-compat field mismatch / stale resolution).
 *  B. issueDescription receives text owned by other fields (timing, repeated
 *     service wording, meta utterances).
 *  C. a legitimate same-stage reprompt reuses the initial prompt delivery
 *     identity and is blocked as a duplicate.
 *
 * Mocha/assert style — imports ../src/index which requires CommonJS loading.
 */

// Keep the AI voice service module from exiting during test load — must run
// before the require('../src/index') below.
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-openai-key';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';

const assert = require('assert').strict;
const {
  resolveNextSimpleModeStage,
  resolveNextRequiredStage,
} = require('../src/intake-validation');
const { enrichIntakeFromTranscript } = require('../src/intake-skip-ahead');
const {
  finalizeSimpleModeSettledAnswer,
  nextRepromptDeliveryAttempt,
} = require('../src/index');

const enrich = (t: string, stage: string, over: any = {}) => {
  const i: any = { stage, ...over };
  enrichIntakeFromTranscript(t, i, stage);
  return i;
};

const noopVoid = () => undefined;

function makeState(intake: any, stage = 'ask_request') {
  return {
    callSid: 'CA-test-batch4',
    currentStage: stage,
    currentTurnId: 1,
    intakeData: { stage, ...intake },
    serviceLocationType: 'onsite',
    businessId: 'biz-1',
    pendingAnswerStage: stage,
    pendingAnswerTurnId: 1,
    pendingAnswerSegments: [],
    answerAcceptedForStage: stage,
    answerAcceptedTurnId: 1,
    needsServiceReprompt: false,
    needsNameReprompt: false,
    settleGeneration: 0,
  };
}

const finalizeDeps = (sent: string[]) => ({
  sendPrompt: async (stage: string) => { sent.push(stage); return true; },
  clearSilentTimeout: noopVoid,
  clearStageTimeout: noopVoid,
  getNextIntakeStage: () => 'ask_location',
  loadServiceLocationTypeForBusiness: async () => undefined,
});

/* ------------------------------------------------------------------ */
/* A. Mike accepted request advances                                   */
/* ------------------------------------------------------------------ */
describe('B4 §A Mike valid request advances', () => {
  it('resolver returns ask_location after valid request, no location', () => {
    const intake: any = {
      customerName: 'Mike',
      serviceRequested: 'grass cut for a quarter acre yard',
    };
    assert.equal(resolveNextSimpleModeStage(intake, 'onsite'), 'ask_location');
  });

  it('compat `request` field alone still satisfies ask_request', () => {
    const intake: any = {
      customerName: 'Mike',
      request: 'grass cut for a quarter acre yard',
    };
    assert.equal(resolveNextSimpleModeStage(intake, 'onsite'), 'ask_location');
    assert.equal(resolveNextRequiredStage(intake, 'onsite'), 'ask_location_or_context');
  });

  it('finalization commits ask_location synchronously when location type known', () => {
    const sent: string[] = [];
    const state = makeState({
      customerName: 'Mike',
      serviceRequested: 'grass cut for a quarter acre yard',
    });
    finalizeSimpleModeSettledAnswer(state, 'ask_request', 'request', 'test', finalizeDeps(sent));
    assert.equal(state.currentStage, 'ask_location');
    assert.deepEqual(sent, ['ask_location']);
  });
});

/* ------------------------------------------------------------------ */
/* B/E. Mike no duplicate pseudo-details; reason-only stays empty      */
/* ------------------------------------------------------------------ */
describe('B4 §B/E reason not duplicated into details', () => {
  it('Mike transcript leaves Details empty (restatement only)', () => {
    const i = enrich(
      "Yeah, I'm looking to get my grass cut for a quarter acre yard",
      'ask_request',
      { customerName: 'Mike' }
    );
    assert.ok(i.serviceRequested);
    const d = (i.issueDescription || '').toLowerCase();
    assert.ok(!d.includes('quarter acre'), `details: ${d}`);
    assert.ok(!d.includes('grass cut'), `details: ${d}`);
  });

  it('reason-only input leaves Details empty', () => {
    const i = enrich(
      'I need someone to repair a leaking bathroom faucet.',
      'ask_request',
      { customerName: 'Pat' }
    );
    assert.ok(i.serviceRequested);
    assert.equal(i.issueDescription || '', '');
  });
});

/* ------------------------------------------------------------------ */
/* C/D. Orion dense request/details + meta tail                        */
/* ------------------------------------------------------------------ */
describe('B4 §C/D Orion dense request + details + meta tail', () => {
  const orion = [
    "Yeah, I'm looking to get my grass cut.",
    'The yard is about a quarter acre or so.',
    'It has a private fence in the backyard.',
    "It's tough to get equipment in.",
    "It's next to the woods.",
    "There's piles of sticks and debris.",
  ].join(' ');

  it('dense request advances first time and retains legit details', () => {
    const i = enrich(orion, 'ask_request', { customerName: 'Orion' });
    assert.match(i.serviceRequested || '', /grass/i);
    const d = (i.issueDescription || '').toLowerCase();
    assert.ok(d.includes('quarter acre'), `details: ${d}`);
    assert.ok(d.includes('fence'), `details: ${d}`);
    assert.ok(d.includes('woods'), `details: ${d}`);
    assert.equal(resolveNextSimpleModeStage(i, 'onsite'), 'ask_location');
  });

  it('meta tail is stripped from Details', () => {
    const i = enrich(
      'I need my grass cut. The yard is fenced, hello',
      'ask_request',
      { customerName: 'Orion' }
    );
    const d = (i.issueDescription || '').toLowerCase();
    assert.ok(!d.includes('hello'), `details: ${d}`);
    assert.ok(d.includes('fenced'), `details: ${d}`);
  });
});

/* ------------------------------------------------------------------ */
/* F/G/H. Scalar ownership — nothing leaks into Details                */
/* ------------------------------------------------------------------ */
describe('B4 §F/G/H scalar ownership keeps Details clean', () => {
  const seeded: any = {
    customerName: 'Nicole Bennett',
    serviceRequested: 'faucet repair',
    issueDescription: 'Handle is loose and water is dripping under the sink',
  };

  it('completion answer does not append into Details', () => {
    const i = enrich('Next couple days.', 'ask_completion_time', { ...seeded });
    assert.ok(i.desiredCompletionTime);
    assert.equal(i.issueDescription, 'Handle is loose and water is dripping under the sink');
  });

  it('callback answer with negated clause does not leak into Details', () => {
    const i = enrich("Don't call in the morning. Call me after 3 PM.", 'ask_callback_time', { ...seeded });
    assert.ok(i.callbackTime);
    assert.match(i.callbackTime, /after 3/i);
    const d = (i.issueDescription || '').toLowerCase();
    assert.ok(!d.includes('morning'), `details: ${d}`);
    assert.ok(!d.includes('call me'), `details: ${d}`);
    assert.ok(d.includes('handle is loose'), `details: ${d}`);
  });

  it('location correction does not enter Details', () => {
    const i = enrich(
      "Actually I gave you the wrong address. It's 937 Pine Hollow Road in Bethel Park.",
      'ask_completion_time',
      { ...seeded, serviceAddress: '1260 Highland Avenue in Dormont' }
    );
    assert.match(i.serviceAddress || '', /pine hollow/i);
    const d = (i.issueDescription || '').toLowerCase();
    assert.ok(!d.includes('pine hollow'), `details: ${d}`);
    assert.ok(!d.includes('wrong address'), `details: ${d}`);
    assert.ok(d.includes('handle is loose'), `details: ${d}`);
  });
});

/* ------------------------------------------------------------------ */
/* I. Reprompt gating: valid request -> zero reprompts                 */
/* ------------------------------------------------------------------ */
describe('B4 §I reprompt gating', () => {
  it('valid request produces zero request-stage reprompts', () => {
    const sent: string[] = [];
    const state = makeState({
      customerName: 'Mike',
      serviceRequested: 'grass cut',
    });
    finalizeSimpleModeSettledAnswer(state, 'ask_request', 'request', 'test', finalizeDeps(sent));
    assert.equal(sent.filter((s) => s === 'ask_request').length, 0);
  });
});

/* ------------------------------------------------------------------ */
/* K/L. Reprompt identity                                              */
/* ------------------------------------------------------------------ */
describe('B4 §K/L reprompt identity', () => {
  const scopeState = () => ({
    repromptAttemptByScope: {} as Record<string, number>,
    repromptDedupeKeys: new Set<string>(),
  });

  it('reprompt attempt identity differs from initial', () => {
    const s = scopeState();
    const attempt = nextRepromptDeliveryAttempt(s, 5, 'ask_request', 'meta_utterance:hello');
    assert.equal(attempt, 1);
    const callSid = 'CA1';
    const initial = `${callSid}:5:ask_request:initial`;
    const reprompt = `${callSid}:5:ask_request:reprompt-${attempt}`;
    assert.notEqual(reprompt, initial);
  });

  it('duplicate event for same reprompt is suppressed', () => {
    const s = scopeState();
    const first = nextRepromptDeliveryAttempt(s, 5, 'ask_request', 'meta_utterance:hello');
    const dup = nextRepromptDeliveryAttempt(s, 5, 'ask_request', 'meta_utterance:hello');
    assert.equal(first, 1);
    assert.equal(dup, null);
  });

  it('distinct reprompt draws increasing attempt', () => {
    const s = scopeState();
    const a = nextRepromptDeliveryAttempt(s, 5, 'ask_request', 'meta_utterance:hello');
    const b = nextRepromptDeliveryAttempt(s, 5, 'ask_request', 'stage_timeout:ask_request:0');
    assert.equal(a, 1);
    assert.equal(b, 2);
  });
});

/* ------------------------------------------------------------------ */
/* M/N/O. Post-write resolver + skip-ahead                             */
/* ------------------------------------------------------------------ */
describe('B4 §M/N/O post-write resolution', () => {
  it('resolver sees freshly written request (compat field promotion case)', () => {
    const intake: any = { customerName: 'Mike', request: 'mow my lawn' };
    assert.equal(resolveNextSimpleModeStage(intake, 'onsite'), 'ask_location');
  });

  it('already-satisfied location skips to completion stage', () => {
    const intake: any = {
      customerName: 'Mike',
      serviceRequested: 'grass cut',
      serviceAddress: '937 Pine Hollow Road in Bethel Park',
    };
    assert.equal(resolveNextSimpleModeStage(intake, 'onsite'), 'ask_completion_time');
  });

  it('dense early completion/callback still skip ahead correctly', () => {
    const i = enrich(
      "I'm Laura Bennett. I need someone to repair my water heater at 408 Cedar Ridge Lane. It's leaking around the bottom. Tomorrow would be great, and call me anytime after four.",
      'ask_name_reason'
    );
    assert.equal(resolveNextSimpleModeStage(i, 'onsite'), 'complete');
  });
});
