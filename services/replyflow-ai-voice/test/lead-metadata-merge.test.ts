import { describe, it, expect } from 'vitest';
import { mergeAiIntakeIntoRawMetadata } from '../src/lead-metadata-merge';
import { buildCanonicalExtractedInfo } from '../src/index';

const OLD_CALL = {
  customerName: 'Ryan',
  serviceRequested: 'tree removal in the backyard',
  serviceAddress: '1632 South Pine Drive',
  desiredCompletionTime: 'this week',
  callbackTime: 'ASAP',
};

const NEW_CALL = {
  customerName: 'Mike Thompson',
  serviceRequested: 'calling because I need my gutters cleaned',
  serviceAddress: '425 Oak Street in Pittsburgh',
  desiredCompletionTime: 'sometime this weekend',
  callbackTime: 'after 4 pm',
};

async function canonicalFor(intake: any, phone = '+14122533598') {
  return {
    ...(await buildCanonicalExtractedInfo(intake, phone, 'onsite', 'CA_test')),
    intakeMode: 'simple',
  };
}

function oldLeadMetadata() {
  return {
    ...OLD_CALL,
    extracted_info: { ...OLD_CALL },
    ai_intake_completed: true,
    ai_intake_completed_at: '2026-09-01T00:00:00Z',
    ai_intake_latest_call_sid: 'CA_old',
    corrected_fields: { name: 'Ryan (manual)' },
    corrected_fields_updated_at: { callerName: '2026-08-15T00:00:00Z' },
    attribution: { source: 'google_ads', campaign: 'fall-cleanup' },
    attachments: [{ id: 'att-1' }],
    billing: { stripeCustomerId: 'cus_123' },
    voicemail_extraction: { extractedAt: '2026-08-01T00:00:00Z' },
    custom_flag: 'keep-me',
  };
}

describe('mergeAiIntakeIntoRawMetadata', () => {
  it('overwrites AI-owned fields with the current completed call', async () => {
    const canonical = await canonicalFor(NEW_CALL);
    const merged = mergeAiIntakeIntoRawMetadata(oldLeadMetadata(), canonical);

    expect(merged.customerName).toBe('Mike Thompson');
    expect(merged.serviceRequested).toBe('calling because I need my gutters cleaned');
    expect(merged.serviceAddress).toBe('425 Oak Street in Pittsburgh');
    expect(merged.desiredCompletionTime).toBe('sometime this weekend');
    expect(merged.callbackTime).toBe('after 4 pm');
  });

  it('mirrors the current call into extracted_info while preserving its unrelated keys', async () => {
    const existing = oldLeadMetadata();
    existing.extracted_info.customNote = 'keep';
    const merged = mergeAiIntakeIntoRawMetadata(existing, await canonicalFor(NEW_CALL));

    expect(merged.extracted_info.serviceRequested).toBe('calling because I need my gutters cleaned');
    expect(merged.extracted_info.serviceAddress).toBe('425 Oak Street in Pittsburgh');
    expect(merged.extracted_info.customNote).toBe('keep');
  });

  it('preserves unrelated raw_metadata untouched', async () => {
    const existing = oldLeadMetadata();
    const merged = mergeAiIntakeIntoRawMetadata(existing, await canonicalFor(NEW_CALL));

    expect(merged.corrected_fields).toEqual({ name: 'Ryan (manual)' });
    expect(merged.corrected_fields_updated_at).toEqual({ callerName: '2026-08-15T00:00:00Z' });
    expect(merged.attribution).toEqual({ source: 'google_ads', campaign: 'fall-cleanup' });
    expect(merged.attachments).toEqual([{ id: 'att-1' }]);
    expect(merged.billing).toEqual({ stripeCustomerId: 'cus_123' });
    expect(merged.voicemail_extraction).toEqual({ extractedAt: '2026-08-01T00:00:00Z' });
    expect(merged.custom_flag).toBe('keep-me');
    expect(merged.ai_intake_completed_at).toBe('2026-09-01T00:00:00Z');
  });

  it('never writes call data into corrected_fields (manual correction semantics preserved)', async () => {
    const merged = mergeAiIntakeIntoRawMetadata(oldLeadMetadata(), await canonicalFor(NEW_CALL));
    expect(merged.corrected_fields).toEqual({ name: 'Ryan (manual)' });
    expect(merged.corrected_fields.serviceRequested).toBeUndefined();
  });

  it('empty current-call fields do not erase valid prior fields (partial call)', async () => {
    const partial = await canonicalFor({
      customerName: 'Mike Thompson',
      serviceRequested: 'calling because I need my gutters cleaned',
      // no serviceAddress, no completion, no callback captured
    });
    const merged = mergeAiIntakeIntoRawMetadata(oldLeadMetadata(), partial);

    expect(merged.customerName).toBe('Mike Thompson');
    expect(merged.serviceRequested).toBe('calling because I need my gutters cleaned');
    expect(merged.serviceAddress).toBe('1632 South Pine Drive');       // prior preserved
    expect(merged.desiredCompletionTime).toBe('this week');            // prior preserved
    expect(merged.callbackTime).toBe('ASAP');                          // prior preserved
    expect(merged.extracted_info.serviceAddress).toBe('1632 South Pine Drive');
  });

  it('overwrites stale legacy alias keys so old values cannot shadow the current call', async () => {
    const existing = {
      reasonForCalling: 'tree removal in the backyard',
      addressOrLocation: '1632 South Pine Drive',
      preferredCallbackTime: 'ASAP',
      desiredCompletion: 'this week',
      extracted_info: {
        reason: 'tree removal in the backyard',
        address: '1632 South Pine Drive',
      },
      attribution: { source: 'referral' },
    };
    const merged = mergeAiIntakeIntoRawMetadata(existing, await canonicalFor(NEW_CALL));

    expect(merged.serviceRequested).toBe('calling because I need my gutters cleaned');
    expect(merged.reasonForCalling).toBe('calling because I need my gutters cleaned');
    expect(merged.addressOrLocation).toBe('425 Oak Street in Pittsburgh');
    expect(merged.preferredCallbackTime).toBe('after 4 pm');
    expect(merged.desiredCompletion).toBe('sometime this weekend');
    expect(merged.extracted_info.reason).toBe('calling because I need my gutters cleaned');
    expect(merged.extracted_info.address).toBe('425 Oak Street in Pittsburgh');
    expect(merged.attribution).toEqual({ source: 'referral' });
  });

  it('does not invent alias keys that were not already present', async () => {
    const merged = mergeAiIntakeIntoRawMetadata({}, await canonicalFor(NEW_CALL));
    expect(merged.serviceRequested).toBe('calling because I need my gutters cleaned');
    expect(merged.reasonForCalling).toBeUndefined();
    expect(merged.addressOrLocation).toBeUndefined();
    expect(merged.name).toBeUndefined();
  });

  it('latest call wins on repeated merges', async () => {
    const third = {
      customerName: 'Mike Thompson',
      serviceRequested: 'fence repair',
      serviceAddress: '9 Elm Court',
      desiredCompletionTime: 'next month',
      callbackTime: 'mornings',
    };
    const m1 = mergeAiIntakeIntoRawMetadata(oldLeadMetadata(), await canonicalFor(NEW_CALL));
    const m2 = mergeAiIntakeIntoRawMetadata(m1, await canonicalFor(third));

    expect(m2.serviceRequested).toBe('fence repair');
    expect(m2.serviceAddress).toBe('9 Elm Court');
    expect(m2.desiredCompletionTime).toBe('next month');
    expect(m2.callbackTime).toBe('mornings');
    expect(m2.extracted_info.serviceRequested).toBe('fence repair');
  });

  it('records refusal flags from the current call without inventing field values', async () => {
    const refused = await canonicalFor({
      nameRefused: true,
      serviceRequested: 'needs a quote',
    });
    const merged = mergeAiIntakeIntoRawMetadata(oldLeadMetadata(), refused);

    expect(merged.nameRefused).toBe(true);
    // refused name must not overwrite the prior captured name with ''
    expect(merged.customerName).toBe('Ryan');
    expect(merged.serviceRequested).toBe('needs a quote');
  });

  it('handles null/empty inputs safely', async () => {
    expect(mergeAiIntakeIntoRawMetadata(null, null)).toEqual({ extracted_info: {} });
    const merged = mergeAiIntakeIntoRawMetadata({ custom_flag: 'x' }, undefined);
    expect(merged.custom_flag).toBe('x');
  });

  it('does not mutate the input metadata object', async () => {
    const existing = oldLeadMetadata();
    const snapshot = JSON.stringify(existing);
    mergeAiIntakeIntoRawMetadata(existing, await canonicalFor(NEW_CALL));
    expect(JSON.stringify(existing)).toBe(snapshot);
  });
});
