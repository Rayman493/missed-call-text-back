// @vitest-environment node
/**
 * Michael Thompson retest (CA03d024aadf5f979ae4c1c34cbe4a931f) regressions.
 *
 * - Timing-only answers ("Sometimes in the next couple days if you could")
 *   must populate desiredCompletionTime and must NOT leak into Details.
 *   Root cause: TIMING_OWNED_CLAUSE_RE listed 'sometime' but not the plural
 *   'sometimes', so the clause escaped timing ownership and was merged into
 *   issueDescription.
 * - Additional Details is genuinely optional: no volunteered job facts ->
 *   issueDescription stays empty.
 * - Genuine volunteered details are preserved.
 * - Natural-language callback preferences ("As soon as you can") are valid
 *   and preserved verbatim; pure acknowledgments ("Absolutely can") are not
 *   callback preferences.
 * - Source phrases are preserved without paraphrase.
 */

import { describe, it, expect } from 'vitest';
import { enrichIntakeFromTranscript } from '../src/intake-skip-ahead';
import { isValidCallbackTime, isValidCompletionTime } from '../src/intake-validation';
import type { IntakeData } from '../src/intake-skip-ahead';

function seededCompletion(): IntakeData {
  return {
    stage: 'ask_completion_time',
    customerName: 'Michael Thompson',
    serviceRequested: 'fix a leaking kitchen sink',
    request: 'fix a leaking kitchen sink',
    serviceAddress: '1632 South Pond Drive',
  } as IntakeData;
}

describe('optional details — timing-only answers never leak', () => {
  it('"Sometimes in the next couple days if you could" populates timing, not Details', () => {
    const intake = seededCompletion();
    enrichIntakeFromTranscript('Sometimes in the next couple days if you could', intake, 'ask_completion_time');
    expect(intake.issueDescription || '').to.equal('');
    expect((intake.desiredCompletionTime || '').toLowerCase()).to.include('next couple days');
  });

  it('"Sometime in the next couple days, if you could" also stays out of Details', () => {
    const intake = seededCompletion();
    enrichIntakeFromTranscript('Sometime in the next couple days, if you could.', intake, 'ask_completion_time');
    expect(intake.issueDescription || '').to.equal('');
    expect((intake.desiredCompletionTime || '').toLowerCase()).to.include('next couple days');
  });

  it('source timing phrase is preserved without paraphrase', () => {
    const intake = seededCompletion();
    enrichIntakeFromTranscript('Sometime in the next couple days if you could', intake, 'ask_completion_time');
    expect(intake.desiredCompletionTime || '').to.match(/next couple days/i);
  });
});

describe('optional details — empty vs genuine', () => {
  it('a bare service reason leaves Details empty', () => {
    const intake = { stage: 'ask_request', customerName: 'Michael Thompson' } as IntakeData;
    enrichIntakeFromTranscript('I need someone to fix a leaking kitchen sink.', intake, 'ask_request');
    expect((intake.serviceRequested || intake.request || '').toLowerCase()).to.include('leaking kitchen sink');
    expect(intake.issueDescription || '').to.equal('');
  });

  it('volunteered job facts are preserved as Details', () => {
    const intake = { stage: 'ask_request', customerName: 'Michael Thompson' } as IntakeData;
    enrichIntakeFromTranscript(
      'I need someone to fix a leaking kitchen sink. It has been dripping under the cabinet for two weeks.',
      intake,
      'ask_request'
    );
    expect((intake.issueDescription || '').toLowerCase()).to.include('dripping under the cabinet');
    expect((intake.issueDescription || '').toLowerCase()).to.not.match(/next couple days|callback/);
  });
});

describe('callback preferences — natural language preserved', () => {
  it('"As soon as you can" is a valid callback preference (no clock time required)', () => {
    expect(isValidCallbackTime('As soon as you can')).to.equal(true);
    const intake = {
      stage: 'ask_callback_time',
      customerName: 'Michael Thompson',
      serviceRequested: 'fix a leaking kitchen sink',
      request: 'fix a leaking kitchen sink',
      serviceAddress: '1632 South Pond Drive',
      desiredCompletionTime: 'Sometime in the next couple days',
    } as IntakeData;
    enrichIntakeFromTranscript('As soon as you can.', intake, 'ask_callback_time');
    expect((intake.callbackTime || '').toLowerCase()).to.include('soon as you can');
    expect(intake.issueDescription || '').to.equal('');
  });

  it('a bare acknowledgment is not stored as a callback preference', () => {
    expect(isValidCallbackTime('Absolutely can')).to.equal(false);
    expect(isValidCallbackTime('Absolutely can.')).to.equal(false);
    const intake = {
      stage: 'ask_callback_time',
      customerName: 'Michael Thompson',
      serviceRequested: 'fix a leaking kitchen sink',
      request: 'fix a leaking kitchen sink',
      serviceAddress: '1632 South Pond Drive',
    } as IntakeData;
    enrichIntakeFromTranscript('Absolutely can.', intake, 'ask_callback_time');
    expect(intake.callbackTime || '').to.equal('');
    expect(intake.issueDescription || '').to.equal('');
  });

  it('completion-time validator still accepts natural timing', () => {
    expect(isValidCompletionTime('Sometime in the next couple days, if you could')).to.equal(true);
    expect(isValidCompletionTime('Sometimes in the next couple days if you could')).to.equal(true);
  });
});

describe('timing phrase fidelity — no substring truncation', () => {
  // CA3af2b172bacdca758874f8a453bbe757: "Ideally sometime in the next week" was
  // reduced to "next week" by a bare-temporal match inside the longer phrase.
  const preserved: [string, string][] = [
    ['Ideally sometime in the next week', 'Ideally sometime in the next week'],
    ['In the next week', 'In the next week'],
    ['Next week', 'Next week'],
    ['Within the next seven days', 'Within the next seven days'],
    ['Sometime next week', 'Sometime next week'],
    ['As soon as possible', 'As soon as possible'],
  ];

  for (const [answer, expected] of preserved) {
    it(`preserves "${answer}" verbatim`, () => {
      const intake = seededCompletion();
      enrichIntakeFromTranscript(answer, intake, 'ask_completion_time');
      expect(intake.desiredCompletionTime).to.equal(expected);
      expect(intake.issueDescription || '').to.equal('');
    });
  }

  it('distinct phrases stay distinct: "in the next week" ≠ "next week"', () => {
    const a = seededCompletion();
    enrichIntakeFromTranscript('In the next week', a, 'ask_completion_time');
    const b = seededCompletion();
    enrichIntakeFromTranscript('Next week', b, 'ask_completion_time');
    expect(a.desiredCompletionTime).to.equal('In the next week');
    expect(b.desiredCompletionTime).to.equal('Next week');
  });

  it('skip-ahead still captures volunteered timing from an earlier stage', () => {
    const intake = { stage: 'ask_request', customerName: 'Josh' } as IntakeData;
    enrichIntakeFromTranscript(
      'I need someone to fix a leaking sink ideally sometime in the next week',
      intake,
      'ask_request'
    );
    expect((intake.desiredCompletionTime || '').toLowerCase()).to.include('sometime in the next week');
    expect(intake.issueDescription || '').to.equal('');
    expect((intake.serviceRequested || intake.request || '').toLowerCase()).to.include('leaking sink');
  });
});
