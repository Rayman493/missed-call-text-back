/**
 * Regression tests for the proven production call (Jimmy Johnson — toilet
 * repair, South Park PA):
 *
 * 1. serviceRequested contamination: the desired-completion answer
 *    "As soon as you could. I really need it done" was appended onto
 *    serviceRequested even though it was also correctly stored in
 *    desiredCompletionTime. The completion extractor did not match
 *    "as soon as you could" (pattern covers "can", not "could"), so the
 *    whole utterance became residual "supporting-fact" sentences and merged
 *    into the canonical Request — bypassing the scalar-stage immutability
 *    rule.
 * 2. Callback normalization: "whenever you can." persisted as
 *    "Anytime, you can" — the scaffold tail was never stripped.
 * 3. Spoken ZIP: "one five one two nine" persisted verbatim inside the
 *    service address instead of "15129".
 */
import { describe, it, expect } from 'vitest';
import { enrichIntakeFromTranscript, normalizeSpokenZipDigits } from '../src/intake-skip-ahead';
import type { IntakeData } from '../src/intake-skip-ahead';

const JIMMY_REQUEST =
  "The current toilet broke whenever I sat on it. It's not flushing. There's like a crack in it. So I need you guys to come out and either repair it or replace it or whatever needs to be done";

const seededIntake = (): IntakeData => ({
  stage: 'ask_completion_time',
  customerName: 'Jimmy Johnson',
  serviceRequested: JIMMY_REQUEST,
  request: JIMMY_REQUEST,
  serviceAddress: '1782 Forest Avenue, apartment 6, 15129, South Park, PA',
});

describe('scalar-stage answers never append into serviceRequested', () => {
  it('production regression: ask_completion_time answer stays out of the canonical Request', () => {
    const intake = seededIntake();
    enrichIntakeFromTranscript('As soon as you could. I really need it done', intake, 'ask_completion_time', 'CA-jimmy-1');

    expect(intake.desiredCompletionTime).toBeTruthy();
    expect(intake.serviceRequested).toEqual(JIMMY_REQUEST);
    expect(intake.serviceRequested).not.toMatch(/as soon as/i);
    expect(intake.serviceRequested).not.toMatch(/i really need it done/i);
  });

  it('ask_callback_time answer stays out of the canonical Request', () => {
    const intake = seededIntake();
    enrichIntakeFromTranscript('whenever you can.', intake, 'ask_callback_time', 'CA-jimmy-2');

    expect(intake.callbackTime).toBeTruthy();
    expect(intake.serviceRequested).toEqual(JIMMY_REQUEST);
  });

  it('a scalar-stage answer does not erase or rewrite the existing Request', () => {
    const intake = seededIntake();
    enrichIntakeFromTranscript('Anytime after 4', intake, 'ask_completion_time', 'CA-jimmy-3');

    expect(intake.serviceRequested).toEqual(JIMMY_REQUEST);
  });
});

describe('open-ended callback answers normalize to Anytime', () => {
  const cb = (answer: string): IntakeData => {
    const intake = seededIntake();
    enrichIntakeFromTranscript(answer, intake, 'ask_callback_time', 'CA-cb-norm');
    return intake;
  };

  it('"whenever you can." → Anytime', () => {
    expect(cb('whenever you can.').callbackTime).toBe('Anytime');
  });

  it('"anytime" → Anytime', () => {
    expect(cb('anytime').callbackTime).toBe('Anytime');
  });

  it('"whenever" → Anytime', () => {
    expect(cb('whenever').callbackTime).toBe('Anytime');
  });

  it('preserves a real constraint tail: "whenever after 5"', () => {
    expect(cb('whenever after 5').callbackTime).toMatch(/after 5/i);
  });

  it('does not over-normalize "tomorrow morning"', () => {
    expect(cb('tomorrow morning').callbackTime!.toLowerCase()).toContain('morning');
  });

  it('does not over-normalize "between 2 and 4"', () => {
    expect(cb('between 2 and 4').callbackTime).toMatch(/between/i);
  });
});

describe('spoken 5-digit ZIP normalization', () => {
  it('"one five one two nine" → "15129"', () => {
    expect(normalizeSpokenZipDigits('1782 Forest Avenue, apartment six, one five one two nine, South Park, PA'))
      .toBe('1782 Forest Avenue, apartment six, 15129, South Park, PA');
  });

  it('does not convert a 4-token house number ("one seven eight two")', () => {
    expect(normalizeSpokenZipDigits('one seven eight two Maple Street')).toBe('one seven eight two Maple Street');
  });

  it('does not convert a longer ambiguous run (6+ tokens)', () => {
    const addr = 'one five one two nine three Maple Street';
    expect(normalizeSpokenZipDigits(addr)).toBe(addr);
  });

  it('leaves already-digit ZIPs untouched', () => {
    const addr = '1782 Forest Avenue, South Park, PA 15129';
    expect(normalizeSpokenZipDigits(addr)).toBe(addr);
  });

  it('converts inside the captured serviceAddress end-to-end', () => {
    const intake: IntakeData = { stage: 'ask_location', customerName: 'Jimmy Johnson', serviceRequested: JIMMY_REQUEST };
    enrichIntakeFromTranscript(
      '1782 Forest Avenue, apartment six, one five one two nine, South Park, PA',
      intake,
      'ask_location',
      'CA-jimmy-zip'
    );
    // Whatever span is stored must never persist the spoken digit words.
    expect(intake.serviceAddress ?? '').not.toMatch(/one five one two nine/i);
    if (intake.serviceAddress?.includes('15129')) {
      expect(intake.serviceAddress).toContain('1782 Forest Avenue');
    }
  });
});
