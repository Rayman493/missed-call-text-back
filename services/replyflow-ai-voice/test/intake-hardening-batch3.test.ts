/**
 * REPLYFLOW — AI INTAKE HARDENING BATCH 3.
 * Field ownership + dense extraction reliability for the defects proven by
 * physical Wave 2 calls: cross-stage correction contamination, Details
 * pollution, dense-address truncation, connector fragments, callback
 * correction scaffolding, and meta-utterance stage-local reprompt.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  isMetaUtterance,
  resolveNextSimpleModeStage,
  IntakeData,
} from '../src/intake-validation';
import { enrichIntakeFromTranscript } from '../src/intake-skip-ahead';

const enrich = (t: string, stage: string, over: Partial<IntakeData> = {}) => {
  const i: IntakeData = { stage, ...over };
  enrichIntakeFromTranscript(t, i, stage);
  return i;
};

const seeded: Partial<IntakeData> = {
  customerName: 'Nicole Bennett',
  serviceRequested: 'look at my furnace',
  issueDescription: "It's making a rattling noise and sometimes shuts off before the house warms up",
};

/* ------------------------------------------------------------------ */
/* §10 — ADDRESS EXTRACTION BOUNDARY (dense address must not truncate)  */
/* ------------------------------------------------------------------ */
describe('B3 §10 address boundary', () => {
  it.each([
    "I'm at 1260 Highland Avenue in Dormont.",
    "I'm at 1260 Highland Avenue, Dormont.",
    "We're at 1260 Highland Avenue in Dormont.",
    'The address is 1260 Highland Avenue in Dormont.',
    '1260 Highland Avenue in Dormont.',
    "Actually it's 937 Pine Hollow Road in Bethel Park.",
    "It's 937, not 931, Pine Hollow Road in Bethel Park.",
  ])('preserves full address from "%s"', (t) => {
    const i = enrich(t, 'ask_location', { customerName: 'Nicole Bennett', serviceRequested: 'look at my furnace' });
    expect(i.serviceAddress).toBeTruthy();
    // Regression: physical call produced the truncated value "1260 Highl".
    expect(i.serviceAddress).not.toBe('1260 Highl');
    const street = t.toLowerCase().includes('pine hollow') ? 'pine hollow road' : 'highland avenue';
    expect(i.serviceAddress!.toLowerCase()).toContain(street);
  });

  it('keeps the full street word for names containing "and" letters', () => {
    const i = enrich("I'm at 1260 Highland Avenue in Dormont.", 'ask_location', seeded);
    expect(i.serviceAddress).toBe('1260 Highland Avenue in Dormont');
  });
});

/* ------------------------------------------------------------------ */
/* §11 — DETAILS CONTAMINATION                                         */
/* ------------------------------------------------------------------ */
describe('B3 §11 details contamination', () => {
  const mustNotEnterDetails: [string, string][] = [
    ['408 Cedar Ridge Lane in Mount Lebanon', 'ask_location'],
    ["Don't call me in the morning. Call me after 3 PM.", 'ask_callback_time'],
    ['Sometime this week is fine.', 'ask_completion_time'],
    ['Actually, make the callback after 5 PM instead.', 'ask_callback_time'],
    ['Hello, are you still there?', 'ask_completion_time'],
  ];

  it.each(mustNotEnterDetails)('"%s" does not enter Details', (t, stage) => {
    const i = enrich(t, stage, { ...seeded });
    const d = (i.issueDescription || '').toLowerCase();
    expect(d).not.toContain('cedar ridge');
    expect(d).not.toContain('call me');
    expect(d).not.toContain('sometime this week');
    expect(d).not.toContain('callback');
    expect(d).not.toContain('still there');
  });

  const legitDetails = [
    "It's rattling.",
    'The handle feels loose.',
    'Water is pooling around the bottom.',
    'The cabinet is starting to swell.',
    'The spring snapped and the door is stuck halfway.',
  ];
  it.each(legitDetails)('keeps real detail "%s"', (t) => {
    const i = enrich(t, 'ask_completion_time', {
      customerName: 'Nicole Bennett',
      serviceRequested: 'look at my furnace',
      serviceAddress: '1260 Highland Avenue in Dormont',
    });
    expect((i.issueDescription || '').length).toBeGreaterThan(0);
  });

  it('correction scaffold does not become a detail', () => {
    const i = enrich(
      "Actually, I gave you the wrong address. It's 937 Pine Hollow Road in Bethel Park.",
      'ask_completion_time',
      { customerName: 'Jason Miller', serviceRequested: 'repair a leaking bathroom faucet' }
    );
    expect(i.serviceAddress).toBe('937 Pine Hollow Road in Bethel Park');
    expect(i.issueDescription || '').not.toContain('wrong address');
    expect(i.issueDescription || '').not.toContain('gave you');
  });

  it('dangling "I\'m" connector does not survive in Details', () => {
    const i = enrich(
      "I'm Nicole Bennett. I need someone to look at my furnace. It's making a rattling noise and sometimes shuts off before the house warms up. I'm at 1260 Highland Avenue in Dormont. Sometime this week would be great, and call me anytime after 4.",
      'ask_name_reason'
    );
    expect(i.issueDescription || '').not.toMatch(/\bi'?m\b\s*$/i);
    expect(i.issueDescription || '').not.toContain('call me');
    expect(i.issueDescription || '').not.toContain('Highland');
  });
});

/* ------------------------------------------------------------------ */
/* §12 — CROSS-STAGE CORRECTION MATRIX                                  */
/* ------------------------------------------------------------------ */
describe('B3 §12 cross-stage correction matrix', () => {
  it('A. address correction at completion stage does not fill completion', () => {
    const i = enrich(
      "Actually, I gave you the wrong address. It's 937 Pine Hollow Road in Bethel Park.",
      'ask_completion_time',
      { customerName: 'Jason Miller', serviceRequested: 'repair a leaking bathroom faucet' }
    );
    expect(i.serviceAddress).toBe('937 Pine Hollow Road in Bethel Park');
    expect(i.desiredCompletionTime).toBeUndefined();
    // Resolver must keep the caller on the unanswered completion stage.
    expect(resolveNextSimpleModeStage(i, 'onsite')).toBe('ask_completion_time');
  });

  it('B. address correction at callback stage leaves callback unanswered', () => {
    const i = enrich(
      'Actually, the address is 500 Pine Street.',
      'ask_callback_time',
      { ...seeded, serviceAddress: '1260 Highland Avenue in Dormont', desiredCompletionTime: 'Sometime this week' }
    );
    expect(i.serviceAddress).toContain('500 Pine Street');
    expect(i.callbackTime).toBeUndefined();
  });

  it('C. completion correction at callback stage leaves callback unanswered', () => {
    const i = enrich(
      'Actually, make it Friday instead.',
      'ask_callback_time',
      { ...seeded, serviceAddress: '1260 Highland Avenue in Dormont', desiredCompletionTime: 'Sometime this week' }
    );
    expect((i.desiredCompletionTime || '').toLowerCase()).toContain('friday');
    expect(i.callbackTime).toBeUndefined();
  });

  it('D. address correction + callback at callback stage fills both', () => {
    const i = enrich(
      "Actually, it's 500 Pine Street, and call me after 5.",
      'ask_callback_time',
      { ...seeded, desiredCompletionTime: 'Sometime this week' }
    );
    expect(i.serviceAddress).toContain('500 Pine Street');
    expect(i.callbackTime).toBeTruthy();
  });

  it('E. address correction + completion at completion stage fills both', () => {
    const i = enrich(
      'Actually, the address is 500 Pine Street, and Friday would be great.',
      'ask_completion_time',
      { customerName: 'Jason Miller', serviceRequested: 'repair a leaking bathroom faucet' }
    );
    expect(i.serviceAddress).toContain('500 Pine Street');
    expect((i.desiredCompletionTime || '').toLowerCase()).toContain('friday');
  });

  it('F. callback-only answer at location stage does not fill location', () => {
    const i = enrich('Call me after 5.', 'ask_location', seeded);
    expect(i.callbackTime).toBeTruthy();
    expect(i.serviceAddress).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* §13 — CALLBACK NORMALIZATION                                        */
/* ------------------------------------------------------------------ */
describe('B3 §13 callback normalization', () => {
  it.each([
    ['Make the callback after 5.', /after 5/i],
    ['Actually, make the callback after 5 PM instead.', /after 5/i],
    ['Actually, make the call back after 5:00 pm. instead', /after 5/i],
    ['Call me after 5.', /after 5/i],
    ['Reach me after 5.', /after 5/i],
    ['Tomorrow after 2.', /tomorrow after 2/i],
    ['Anytime after 4.', /anytime after 4/i],
  ])('normalizes "%s"', (t, expected) => {
    const i = enrich(t, 'ask_callback_time', {
      ...seeded,
      serviceAddress: '1260 Highland Avenue in Dormont',
      desiredCompletionTime: 'Sometime this week',
    });
    expect(i.callbackTime).toBeTruthy();
    expect(i.callbackTime).toMatch(expected);
    expect(i.callbackTime).not.toMatch(/\bmake\b|\binstead\b|^back\b|\bcallback\b/i);
  });

  it('preserves negated callback restatement (Batch 2)', () => {
    const i = enrich("Don't call me in the morning. Call me after 3 PM.", 'ask_callback_time', {
      ...seeded, serviceAddress: '408 Cedar Ridge Lane in Mount Lebanon', desiredCompletionTime: 'Sometime this week',
    });
    expect(i.callbackTime).toMatch(/after 3/i);
    expect(i.callbackTime).not.toMatch(/morning/i);
  });
});

/* ------------------------------------------------------------------ */
/* §14 — META UTTERANCE STAGE-LOCAL REPROMPT                            */
/* ------------------------------------------------------------------ */
describe('B3 §14 meta reprompt', () => {
  const metas = ['Hello?', 'Can you hear me?', 'Are you still there?', 'Sorry, what was that?', 'Give me one second.'];
  // Each stage's seed satisfies exactly the fields before it, so the resolver
  // reproduces that stage — mirroring the runtime invariant.
  const seeds: Record<string, Partial<IntakeData>> = {
    ask_name_reason: {},
    ask_location: { customerName: 'Nicole Bennett', serviceRequested: 'look at my furnace', issueDescription: "It's rattling" },
    ask_completion_time: { customerName: 'Nicole Bennett', serviceRequested: 'look at my furnace', issueDescription: "It's rattling", serviceAddress: '1260 Highland Avenue in Dormont' },
    ask_callback_time: { customerName: 'Nicole Bennett', serviceRequested: 'look at my furnace', issueDescription: "It's rattling", serviceAddress: '1260 Highland Avenue in Dormont', desiredCompletionTime: 'Sometime this week' },
  };

  for (const stage of Object.keys(seeds)) {
    it.each(metas)(`meta "%s" at ${stage} mutates nothing and preserves stage`, (t) => {
      const before = { ...seeds[stage] };
      const i = enrich(t, stage, seeds[stage]);
      for (const k of Object.keys(before)) {
        expect((i as any)[k]).toEqual((before as any)[k]);
      }
      if (before.customerName) expect(i.customerName).toBe(before.customerName);
      expect(resolveNextSimpleModeStage(i, 'onsite')).toBe(stage);
    });
  }

  it('index.ts dispatches a stage-local reprompt on meta rejection', () => {
    const src = readFileSync(join(__dirname, '../src/index.ts'), 'utf8');
    expect(src).toContain('meta_utterance_stage_reprompt');
    expect(src).toContain("rejectionReason === 'meta_utterance'");
    expect(src).toContain('same_stage_unresolved_reprompt');
  });
});

/* ------------------------------------------------------------------ */
/* §15 — DENSE SKIP-AHEAD REGRESSION                                    */
/* ------------------------------------------------------------------ */
describe('B3 §15 dense skip-ahead', () => {
  it('extracts every field from one dense natural answer', () => {
    const i = enrich(
      "I'm Nicole Bennett. I need someone to look at my furnace. It's making a rattling noise and sometimes shuts off before the house warms up. I'm at 1260 Highland Avenue in Dormont. Sometime this week would be great, and call me anytime after 4.",
      'ask_name_reason'
    );
    expect(i.customerName).toBe('Nicole Bennett');
    expect((i.serviceRequested || '').toLowerCase()).toContain('furnace');
    expect(i.issueDescription).toContain('rattling');
    expect(i.issueDescription).not.toMatch(/\bi'?m\b\s*$/i);
    expect(i.serviceAddress).toBe('1260 Highland Avenue in Dormont');
    expect((i.desiredCompletionTime || '').toLowerCase()).toContain('week');
    expect((i.callbackTime || '').toLowerCase()).toContain('after 4');
    expect(resolveNextSimpleModeStage(i, 'onsite')).toBe('complete');
  });
});
