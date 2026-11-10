/**
 * Batch A — AI intake accuracy regressions.
 *
 * D-1: temporal extraction must preserve caller uncertainty markers
 *      ("maybe Thursday" must never collapse into a confirmed "Thursday").
 * D-3: customer-facing summary fallbacks must use caller-only transcript
 *      text — assistant questions are never caller-provided facts.
 *
 * Pure deterministic functions only — no model, no network, no DB.
 */
import { describe, it, expect } from 'vitest';
import {
  extractCompletionTimeCandidate,
  extractCallbackTimeCandidate,
  enrichIntakeFromTranscript,
} from '../src/intake-skip-ahead';
import { buildCallerOnlyTranscript } from '../src/index';

const enrich = (text: string, stage: string, seed: any = {}) =>
  enrichIntakeFromTranscript(text, seed, stage, 'CA-batch-a');

describe('D-1 temporal uncertainty preservation', () => {
  it.each([
    ['Maybe Thursday.', 'maybe', 'thursday'],
    ['Probably next week.', 'probably', 'next week'],
    ['Hopefully tomorrow.', 'hopefully', 'tomorrow'],
    ['I think Friday.', 'i think', 'friday'],
  ])('"%s" keeps its hedge and the temporal value', (utterance, hedge, core) => {
    const value = extractCompletionTimeCandidate(utterance);
    expect(value).not.toBeNull();
    expect(value!.toLowerCase()).toContain(hedge);
    expect(value!.toLowerCase()).toContain(core);
  });

  it.each([
    ['Thursday works.', 'thursday'],
    ['I need it done by Friday.', 'friday'],
  ])('"%s" stays definitive — no artificial hedge added', (utterance, core) => {
    // Stage-answer path: the bare answer at ask_completion_time must land
    // without gaining uncertainty it never had.
    const intake: any = {};
    enrich(utterance, 'ask_completion_time', intake);
    const value = (intake.desiredCompletionTime || '').toLowerCase();
    expect(value).toContain(core);
    expect(value).not.toMatch(/\b(maybe|probably|hopefully|i think)\b/);
    // Free-text path: a weekday embedded in intent scaffolding also stays
    // definitive at the candidate extractor.
    const candidate = extractCompletionTimeCandidate(utterance);
    if (candidate !== null) {
      expect(candidate.toLowerCase()).not.toMatch(/\b(maybe|probably|hopefully|i think)\b/);
    }
  });

  it('"Not Thursday." produces no completion-time value', () => {
    expect(extractCompletionTimeCandidate('Not Thursday.')).toBeNull();
  });

  it('"I don\'t know." produces no completion-time value', () => {
    expect(extractCompletionTimeCandidate("I don't know.")).toBeNull();
  });

  it('hedged callback answers keep uncertainty too', () => {
    const value = extractCallbackTimeCandidate('Maybe tomorrow afternoon.');
    if (value !== null) {
      expect(value.toLowerCase()).toContain('maybe');
    }
  });

  it('end-to-end: hedged completion answer lands in intake with the hedge', () => {
    const intake: any = {};
    enrich('Maybe Thursday.', 'ask_completion_time', intake);
    expect((intake.desiredCompletionTime || '').toLowerCase()).toContain('maybe');
    expect((intake.desiredCompletionTime || '').toLowerCase()).toContain('thursday');
  });

  it('caller correction overwrites the earlier value and keeps its own hedge', () => {
    const intake: any = { desiredCompletionTime: 'Friday' };
    enrich('Actually, maybe Tuesday.', 'ask_completion_time', intake);
    expect((intake.desiredCompletionTime || '').toLowerCase()).toContain('tuesday');
    expect((intake.desiredCompletionTime || '').toLowerCase()).not.toBe('friday');
    expect((intake.desiredCompletionTime || '').toLowerCase()).toContain('maybe');
  });

  it('hedged value does not turn into a confirmed appointment', () => {
    const intake: any = {};
    enrich('Maybe Thursday.', 'ask_completion_time', intake);
    // The stored field is the caller's tentative wording — nothing adds
    // confirmation, scheduling, or appointment structure around it.
    expect(intake.desiredCompletionTime).toBeTruthy();
    expect(Object.keys(intake).some(k => /appoint|schedule|booked|confirm/i.test(k))).toBe(false);
  });
});

describe('D-1a uncertain and negative timing — evidence only', () => {
  it.each([
    "I'm not sure about Friday.",
    "I don't know if Friday works.",
    'Friday won\'t work.',
    'Friday doesn\'t work.',
    'I have no idea about tomorrow.',
    'Friday is not confirmed.',
  ])('unresolved/negative "%s" yields no confirmed date', (utterance) => {
    expect(extractCompletionTimeCandidate(utterance)).toBeNull();
    const intake: any = {};
    enrich(utterance, 'ask_completion_time', intake);
    expect(intake.desiredCompletionTime || '').not.toMatch(/friday|tomorrow|thursday|saturday/i);
  });

  it('"Not Friday, Saturday works." captures Saturday', () => {
    const value = extractCompletionTimeCandidate('Not Friday, Saturday works.');
    expect(value).not.toBeNull();
    expect(value!.toLowerCase()).toContain('saturday');
    expect(value!.toLowerCase()).not.toContain('friday');
  });

  it('"Friday doesn\'t work, maybe Saturday." captures tentative Saturday', () => {
    const value = extractCompletionTimeCandidate("Friday doesn't work, maybe Saturday.");
    expect(value).not.toBeNull();
    expect(value!.toLowerCase()).toContain('maybe');
    expect(value!.toLowerCase()).toContain('saturday');
    expect(value!.toLowerCase()).not.toContain('friday');
  });

  it('"I\'m not sure about the address, but Friday works." still captures Friday', () => {
    const value = extractCompletionTimeCandidate("I'm not sure about the address, but Friday works.");
    expect(value).not.toBeNull();
    expect(value!.toLowerCase()).toContain('friday');
    expect(value!.toLowerCase()).not.toMatch(/not sure|uncertain/i);
  });

  it('em-dash boundary keeps trailing uncertainty out of the stated date', () => {
    const value = extractCompletionTimeCandidate("I haven't decided — Friday works.");
    expect(value).not.toBeNull();
    expect(value!.toLowerCase()).toContain('friday');
  });

  it('uncertainty about a different subject does not kill the stated date', () => {
    const value = extractCompletionTimeCandidate("I'd like it done by Friday, but I'm not sure about the cost.");
    expect(value).not.toBeNull();
    expect(value!.toLowerCase()).toContain('friday');
    expect(value!.toLowerCase()).not.toMatch(/not sure|uncertain/i);
  });

  it('"I think Thursday would work." preserves uncertainty', () => {
    const value = extractCompletionTimeCandidate('I think Thursday would work.');
    expect(value).not.toBeNull();
    expect(value!.toLowerCase()).toContain('i think');
    expect(value!.toLowerCase()).toContain('thursday');
  });

  it('correction rejecting one date and selecting another works end-to-end', () => {
    const intake: any = { desiredCompletionTime: 'Friday' };
    enrich('Actually not Friday, Saturday works.', 'ask_completion_time', intake);
    expect((intake.desiredCompletionTime || '').toLowerCase()).toContain('saturday');
    expect((intake.desiredCompletionTime || '').toLowerCase()).not.toContain('friday');
  });

  it('uncertain callback timing is not captured as a commitment', () => {
    expect(extractCallbackTimeCandidate("I'm not sure about tomorrow afternoon.")).toBeNull();
    expect(extractCallbackTimeCandidate("Don't call me in the morning.")).toBeNull();
  });

  it('callback still captures when uncertainty is about a different matter', () => {
    const value = extractCallbackTimeCandidate("I'm not sure about the job, but call me Friday.");
    expect(value).not.toBeNull();
    expect(value!.toLowerCase()).toContain('friday');
  });
});

describe('D-3 caller-only fallback summary text', () => {
  it('assistant-only transcript yields empty caller text', () => {
    const transcript = [
      { role: 'assistant', text: 'Thanks for calling! What can I help you with?' },
      { role: 'assistant', text: 'When would you like the work done?' },
    ];
    expect(buildCallerOnlyTranscript(transcript)).toBe('');
  });

  it('mixed transcript excludes every assistant statement', () => {
    const transcript = [
      { role: 'assistant', text: 'What is the address?' },
      { role: 'user', text: '412 Maple Street' },
      { role: 'assistant', text: 'When should we come out?' },
      { role: 'user', text: 'Maybe Thursday' },
    ];
    const result = buildCallerOnlyTranscript(transcript);
    expect(result).toContain('user: 412 Maple Street');
    expect(result).toContain('user: Maybe Thursday');
    expect(result).not.toContain('assistant');
    expect(result).not.toContain('What is the address');
  });

  it('empty transcript yields empty caller text — no artificial content', () => {
    expect(buildCallerOnlyTranscript([])).toBe('');
  });

  it('no-speech fallback summary carries no fabricated transcript body', () => {
    // The persistence fallback reads:
    //   callerTranscript ? `AI call transcript: ${callerTranscript}` : 'AI call completed'
    // An assistant-only or silent call must therefore reach the neutral
    // no-content label, never an assistant-authored transcript dump.
    const assistantOnly = [{ role: 'assistant', text: 'Can you hear me?' }];
    expect(buildCallerOnlyTranscript(assistantOnly)).toBe('');
  });
});
