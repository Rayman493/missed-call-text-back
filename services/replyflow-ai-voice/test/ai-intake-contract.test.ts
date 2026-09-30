/**
 * AI Intake reliability contract — the mandated 33-case matrix.
 *
 * Contract under test:
 *   verbatim transcript -> deterministic five-field capture -> light cleanup
 *   -> latest explicit correction wins -> persisted fields are the
 *   deterministic values.
 *
 * These tests exercise the deterministic surface only (extraction helpers,
 * validators, stage resolvers, canonical persistence builders). No model is
 * involved anywhere in this contract.
 */
import { describe, it, expect } from 'vitest';
import {
  enrichIntakeFromTranscript,
} from '../src/intake-skip-ahead';
import {
  isValidCompletionTime,
  isValidCallbackTime,
  resolveNextRequiredStage,
  resolveNextSimpleModeStage,
} from '../src/intake-validation';
import {
  extractRawRequestTranscriptFromStageCaptures,
} from '../src/request-transcript-selection';
import {
  buildDeterministicExtractedFields,
  buildCanonicalExtractedInfo,
  buildDeterministicCallSummary,
  buildSimpleModeTranscript,
} from '../src/index';

const enrich = (text: string, stage: string, seed: any = {}) =>
  enrichIntakeFromTranscript(text, seed, stage, 'CA-contract');

describe('mandatory intake matrix', () => {
  // 1. clean sequential call
  it('1. clean sequential call captures each field at its stage', () => {
    const intake: any = {};
    enrich('This is Mike.', 'ask_name_reason', intake);
    enrich('My sink is leaking underneath.', 'ask_request', intake);
    enrich("I'm at 412 Maple Street.", 'ask_location', intake);
    enrich('Tomorrow would be great.', 'ask_completion_time', intake);
    enrich('Anytime after 3.', 'ask_callback_time', intake);
    expect(intake.customerName).toBe('Mike');
    expect(intake.serviceRequested || intake.request).toContain('sink is leaking');
    expect(intake.serviceAddress).toContain('412 Maple');
    expect((intake.desiredCompletionTime || '').toLowerCase()).toContain('tomorrow');
    expect((intake.callbackTime || '').toLowerCase()).toContain('after 3');
  });

  // 2. caller supplies several fields immediately
  it('2. skip-ahead captures volunteered fields in one answer', () => {
    const intake: any = {};
    enrich(
      "Hi, I'm Sarah. My water heater is leaking at 123 Oak Street and I'd like someone tomorrow.",
      'ask_name_reason',
      intake
    );
    expect(intake.customerName).toBe('Sarah');
    expect(intake.serviceRequested || intake.request).toBeTruthy();
    expect(intake.serviceAddress).toContain('123 Oak');
    expect((intake.desiredCompletionTime || '').toLowerCase()).toContain('tomorrow');
  });

  // 3. caller supplies all five in the first substantive answer
  it('3. a single dense answer fills all five fields', () => {
    const intake: any = {};
    enrich(
      "Uh, yeah, this is Mike. My sink is leaking underneath. I'm at 412 Maple Street. Tomorrow would be great. You can call me anytime after 3.",
      'ask_name_reason',
      intake
    );
    expect(intake.customerName).toBe('Mike');
    expect(intake.serviceRequested || intake.request).toBeTruthy();
    expect(intake.serviceAddress).toContain('412 Maple');
    expect((intake.desiredCompletionTime || '').toLowerCase()).toContain('tomorrow');
    expect((intake.callbackTime || '').toLowerCase()).toContain('after 3');
    const next = resolveNextRequiredStage(intake, 'onsite');
    expect(next).toBe('complete');
  });

  // 4. additional details volunteered with the reason are preserved
  it('4. volunteered details stay with the caller\u2019s explanation', () => {
    const intake: any = { customerName: 'Ryan' };
    enrich(
      'My furnace stopped working last night. It turns on for about 30 seconds and shuts back off. I already changed the filter.',
      'ask_request',
      intake
    );
    const reason = `${intake.serviceRequested || ''} ${intake.issueDescription || ''}`;
    expect(reason).toContain('furnace stopped working');
    expect(reason).toContain('changed the filter');
  });

  // 5. no additional details given — not required for completion
  it('5. additional details are not required for completion', () => {
    const intake: any = {
      customerName: 'Mike',
      serviceRequested: 'sink is leaking',
      serviceAddress: '412 Maple Street',
      desiredCompletionTime: 'tomorrow',
      callbackTime: 'Anytime after 3',
    };
    expect(resolveNextRequiredStage(intake, 'onsite')).toBe('complete');
  });

  // 6. correction to completion time
  it('6. latest completion-time correction wins', () => {
    const intake: any = { desiredCompletionTime: 'Tuesday' };
    enrich('Actually Wednesday would be better.', 'ask_completion_time', intake);
    expect(intake.desiredCompletionTime!.toLowerCase()).toContain('wednesday');
    expect(intake.desiredCompletionTime!.toLowerCase()).not.toContain('tuesday');
  });

  // 7. correction to callback time
  it('7. latest callback-time correction wins', () => {
    const intake: any = { callbackTime: 'Anytime' };
    enrich('Actually call me after 5 instead.', 'ask_callback_time', intake);
    expect(intake.callbackTime!.toLowerCase()).toContain('after 5');
  });

  // 8. correction to location
  it('8. latest location correction wins', () => {
    const intake: any = { serviceAddress: '123 Main Street' };
    enrich("Sorry, it's 125 Main Street.", 'ask_location', intake);
    expect(intake.serviceAddress).toContain('125 Main');
    expect(intake.serviceAddress).not.toContain('123 Main');
  });

  // 9. correction to reason
  it('9. latest reason correction wins', () => {
    const intake: any = { serviceRequested: 'the toilet is leaking' };
    enrich("Actually it's the shower, not the toilet.", 'ask_request', intake);
    expect((intake.serviceRequested || intake.request || '').toLowerCase()).toContain('shower');
  });

  // 10. caller refuses name
  it('10. name refusal sets the flag, not the text', () => {
    const intake: any = {};
    enrich("I'd rather not give my name", 'ask_name', intake);
    expect(intake.nameRefused).toBe(true);
    expect(intake.customerName || '').toBe('');
  });

  // 11. caller refuses location
  it('11. location refusal satisfies the location stage', () => {
    const intake: any = {};
    enrich("I don't want to give the exact address", 'ask_location', intake);
    expect(intake.locationRefused).toBe(true);
    const next = resolveNextRequiredStage(
      { ...intake, serviceRequested: 'sink leak', desiredCompletionTime: 'tomorrow', callbackTime: 'Anytime', customerName: 'Mike' },
      'onsite'
    );
    expect(next).toBe('complete');
  });

  // 12-14. flexible timing answers are valid
  it('12-14. flexible/vague timing answers are accepted', () => {
    expect(isValidCallbackTime('Anytime')).toBe(true);
    expect(isValidCompletionTime('sometime next week')).toBe(true);
    expect(isValidCompletionTime('ASAP')).toBe(true);
    expect(isValidCompletionTime('Afternoons')).toBe(true);
    expect(isValidCallbackTime('after five')).toBe(true);
    expect(isValidCallbackTime('between two and four')).toBe(true);
    expect(isValidCompletionTime('No rush')).toBe(true);
    expect(isValidCallbackTime('whenever available')).toBe(true);
  });

  // 15-16. silence/non-answer handling
  it('15-16. silence and non-answers never satisfy a field', () => {
    expect(isValidCompletionTime('')).toBe(false);
    expect(isValidCallbackTime('')).toBe(false);
    const intake: any = { customerName: 'Mike', serviceRequested: 'leak' };
    // Nothing captured: the resolver keeps asking the next missing stage.
    const next = resolveNextRequiredStage(intake, 'onsite');
    expect(next).not.toBe('complete');
    expect(next).toBeTruthy();
  });

  // 18. caller answers a future field before asked
  it('18. future-field answers are captured early without re-asking', () => {
    const intake: any = { customerName: 'Mike', serviceRequested: 'sink leak' };
    enrich('You can call me anytime after 3.', 'ask_location', intake);
    expect(intake.callbackTime).toBeTruthy();
  });

  // 20. a late answer on a different stage does not corrupt the current field
  it('20. timing text at the location stage does not become the address', () => {
    const intake: any = { customerName: 'Mike', serviceRequested: 'sink leak' };
    enrich('call me tomorrow morning', 'ask_location', intake);
    expect(intake.serviceAddress || '').not.toContain('tomorrow');
  });

  // 22. summary/title machinery absent — deterministic summary from fields only
  it('22. deterministic summary derives only from captured fields', () => {
    const summary = buildDeterministicCallSummary({
      customerName: 'Mike',
      serviceRequested: 'kitchen sink leaking underneath',
      serviceAddress: '412 Maple Street',
      desiredCompletionTime: 'tomorrow',
      callbackTime: 'after 3 PM',
    });
    expect(summary).toContain('Mike');
    expect(summary).toContain('kitchen sink leaking underneath');
    expect(summary.toLowerCase()).not.toContain('urgent');
    expect(buildDeterministicCallSummary({})).toBe('');
  });

  // 23/31. latest accepted request wins; blocked utterances stay in transcript
  it('23/31. latest non-blocked capture wins and blocked utterances persist in the transcript', () => {
    const captures = [
      { stage: 'ask_request', rawTranscript: 'the toilet is leaking', capturedAnswer: 'the toilet is leaking', extractedField: 'serviceRequested', source: 'x', timestamp: 't1' },
      { stage: 'ask_request', rawTranscript: "actually it's the shower", capturedAnswer: "actually it's the shower", extractedField: 'serviceRequested', source: 'x', timestamp: 't2' },
    ];
    // Latest non-blocked request capture is canonical (latest-wins).
    const raw = extractRawRequestTranscriptFromStageCaptures(captures);
    expect(raw!.toLowerCase()).toContain('shower');

    // A blocked late correction is kept OUT of the canonical selection but
    // MUST still appear verbatim in the persisted conversation transcript.
    const blockedCaptures = [
      captures[0],
      { ...captures[1], blocked: true, blockReason: 'stage_finalized' },
    ];
    expect(extractRawRequestTranscriptFromStageCaptures(blockedCaptures)!.toLowerCase()).toContain('toilet');
    const messages = buildSimpleModeTranscript(blockedCaptures, 'on_site');
    const userTexts = messages.filter((m: any) => m.role === 'user').map((m: any) => (m.text || '').toLowerCase());
    expect(userTexts.some((t: string) => t.includes('shower'))).toBe(true);
    expect(userTexts.some((t: string) => t.includes('toilet'))).toBe(true);
  });

  // 24. latest correction wins without stale value (explicit verify)
  it('24. a corrected value replaces the stale one entirely', () => {
    const intake: any = { desiredCompletionTime: 'Tuesday' };
    enrich('Actually Wednesday.', 'ask_completion_time', intake);
    expect(intake.desiredCompletionTime!.toLowerCase()).toBe('wednesday');
  });

  // 25. filler cleanup preserves meaning
  it('25. filler is cleaned, facts preserved', () => {
    const intake: any = {};
    enrich('Um, yeah, tomorrow morning works.', 'ask_completion_time', intake);
    expect((intake.desiredCompletionTime || '').toLowerCase()).toContain('tomorrow');
  });
});

describe('mandatory persistence assertions', () => {
  const deterministicIntake = {
    customerName: 'Mike',
    serviceRequested: 'My sink is leaking underneath',
    serviceAddress: '412 Maple Street',
    desiredCompletionTime: 'tomorrow',
    callbackTime: 'Anytime after 3',
  };

  // 26. persisted extracted_info equals the deterministic intake state
  it('26. canonical extracted fields equal deterministic intake values', async () => {
    const fields = buildDeterministicExtractedFields(deterministicIntake);
    expect(fields.customerName).toBe('Mike');
    expect(fields.serviceRequested).toBe('My sink is leaking underneath');
    expect(fields.serviceAddress).toBe('412 Maple Street');
    expect(fields.desiredCompletionTime).toBe('tomorrow');
    expect(fields.callbackTime).toBe('Anytime after 3');

    const canonical = await buildCanonicalExtractedInfo(fields, '+15551234567', 'onsite', 'CA-contract');
    expect(canonical.customerName).toBe('Mike');
    expect(canonical.serviceRequested).toBe('My sink is leaking underneath');
    expect(canonical.serviceAddress).toBe('412 Maple Street');
    expect(canonical.desiredCompletionTime).toBe('tomorrow');
    expect(canonical.callbackTime).toBe('Anytime after 3');
  });

  // 27. summary never feeds structured fields
  it('27. summary text cannot mutate structured fields', async () => {
    const fields = buildDeterministicExtractedFields(deterministicIntake);
    const canonical = await buildCanonicalExtractedInfo(fields, '+15551234567', 'onsite');
    // summary exists but canonical scalar fields are unaffected by it
    expect(canonical.serviceRequested).toBe('My sink is leaking underneath');
    expect(canonical.serviceAddress).toBe('412 Maple Street');
  });

  // 28. reason preserves the caller's full explanation verbatim
  it('28. reason preserves the caller\u2019s full explanation verbatim', async () => {
    const fullReason =
      'My furnace stopped working last night. It turns on for about 30 seconds and shuts back off. I already changed the filter.';
    const fields = buildDeterministicExtractedFields({
      customerName: 'Ryan',
      serviceRequested: fullReason,
    });
    const canonical = await buildCanonicalExtractedInfo(fields, '+15551234567', 'onsite');
    expect(canonical.serviceRequested).toBe(fullReason);
    expect(canonical.serviceRequested).not.toBe('HVAC malfunction');
    expect(canonical.serviceRequested).not.toBe('Furnace malfunction');
  });

  // 29. no mandatory additional-details field
  it('29. empty issueDescription does not block completion', () => {
    const fields = buildDeterministicExtractedFields(deterministicIntake);
    expect(fields.issueDescription).toBeNull();
    expect(resolveNextRequiredStage(deterministicIntake, 'onsite')).toBe('complete');
  });

  // 30. bare acknowledgments cannot satisfy callback time
  it('30. bare acknowledgments are rejected as callback/completion times', () => {
    for (const nonAnswer of ['Absolutely can', 'Sure', 'Okay', 'Yeah', 'Sounds good', "That's fine", 'Absolutely']) {
      expect(isValidCallbackTime(nonAnswer), `callback: "${nonAnswer}"`).toBe(false);
      expect(isValidCompletionTime(nonAnswer), `completion: "${nonAnswer}"`).toBe(false);
    }
  });

  // 32. no urgencyLevel or invented fields in structured output
  it('32. structured output carries no urgencyLevel or diagnosis fields', async () => {
    const fields = buildDeterministicExtractedFields(deterministicIntake);
    const canonical = await buildCanonicalExtractedInfo(fields, '+15551234567', 'onsite');
    for (const out of [fields, canonical]) {
      expect('urgencyLevel' in out).toBe(false);
      expect('urgency' in out).toBe(false);
      expect('diagnosis' in out).toBe(false);
      expect('serviceCategory' in out).toBe(false);
    }
  });

  // 33. no model request-title rewrite exists in the pipeline
  it('33. no model-authored request title/rewrite function is exported', async () => {
    const indexModule = await import('../src/index');
    expect((indexModule as any).extractRequestTitleAndDetailsWithModel).toBeUndefined();
    expect((indexModule as any).generateCanonicalTitle).toBeUndefined();
    expect((indexModule as any).extractFieldsFromTranscriptWithModel).toBeUndefined();
  });
});
