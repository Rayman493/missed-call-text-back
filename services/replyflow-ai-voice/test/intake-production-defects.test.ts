/**
 * Regression tests for confirmed production intake defects (Fly v400 calls).
 *
 * - Kevin Brooks (CAa24929f6b5af53593b428debc02e579f): a name-only greeting
 *   populated serviceRequested with "hi. Hello", the resolver skipped the
 *   request stage, and a later completion answer mutated it into
 *   "hi. Hello. someone helped, actually next Monday would be better".
 * - David Carter: "Uh actually not this week. Next Monday would be better"
 *   stored desiredCompletionTime="this week" — the negated option won.
 * - Sarah Miller: one request sentence swallowed the address clause, the
 *   address swallowed the callback clause, and the completion value kept the
 *   "I need someone out" intent scaffold.
 */

import { describe, it, expect } from 'vitest';
import { enrichIntakeFromTranscript } from '../src/intake-skip-ahead';
import type { IntakeData } from '../src/intake-skip-ahead';

describe('name-only greeting never satisfies Request', () => {
  it('"Hello, uh hi. This is Kevin Brooks" captures the name and nothing else', () => {
    const intake: IntakeData = { stage: 'ask_name' };
    enrichIntakeFromTranscript(
      'Hello, uh hi. This is Kevin Brooks',
      intake,
      'ask_name',
      'CAa24929f6b5af53593b428debc02e579f'
    );

    expect(intake.customerName).toBe('Kevin Brooks');
    // Request must stay empty so the resolver proceeds to ask_reason.
    expect(intake.serviceRequested || '').toBe('');
    expect(intake.request || '').toBe('');
    expect(intake.serviceAddress).toBeUndefined();
    expect(intake.desiredCompletionTime).toBeUndefined();
    expect(intake.callbackTime).toBeUndefined();
  });

  it('pure greeting residue cannot become the service request', () => {
    const intake: IntakeData = { stage: 'ask_name' };
    enrichIntakeFromTranscript('Hi, hello?', intake, 'ask_name', 'CA-test-greet');
    expect(intake.serviceRequested || '').toBe('');
  });

  it('genuine service intent during ask_name still counts as legitimate skip-ahead', () => {
    const intake: IntakeData = { stage: 'ask_name' };
    enrichIntakeFromTranscript(
      "Hi, this is Dana and I need a plumber because my kitchen sink won't stop leaking",
      intake,
      'ask_name',
      'CA-test-intent'
    );

    expect(intake.customerName).toBeTruthy();
    expect(intake.serviceRequested).toBeTruthy();
    expect(intake.serviceRequested!.toLowerCase()).toContain('sink');
  });
});

describe('Request immutability after valid capture', () => {
  const seeded = (): IntakeData => ({
    stage: 'ask_completion_time',
    customerName: 'Kevin Brooks',
    serviceRequested: 'someone to look at my fence',
    request: 'someone to look at my fence',
    serviceAddress: '6632 Walnut Avenue',
  });

  it('a completion-stage correction answer never appends residue to Request', () => {
    const intake = seeded();
    enrichIntakeFromTranscript(
      'Like someone helped this week, actually next Monday would be better',
      intake,
      'ask_completion_time',
      'CAa24929f6b5af53593b428debc02e579f'
    );

    expect(intake.desiredCompletionTime!.toLowerCase()).toContain('monday');
    // The exact Kevin Brooks pollution — correction-head residue plus the
    // timing tail must never append to the canonical Request.
    expect(intake.serviceRequested).toBe('someone to look at my fence');
    expect(intake.serviceRequested!.toLowerCase()).not.toContain('helped');
    expect(intake.serviceRequested!.toLowerCase()).not.toContain('monday');
  });

  it('a callback-stage answer never appends to Request', () => {
    const intake: IntakeData = {
      stage: 'ask_callback_time',
      customerName: 'David Carter',
      serviceRequested: 'an electrician to look at an outlet that keeps sparking',
      request: 'an electrician to look at an outlet that keeps sparking',
      serviceAddress: '1147 Maple Street',
      desiredCompletionTime: 'next week',
    };
    enrichIntakeFromTranscript('Call me in the morning', intake, 'ask_callback_time', 'CA-test-immutable');

    expect(intake.serviceRequested).toBe('an electrician to look at an outlet that keeps sparking');
    expect(intake.callbackTime).toBeTruthy();
  });
});

describe('negated temporal options never win', () => {
  it('"Uh actually not this week. Next Monday would be better" resolves to next Monday', () => {
    const intake: IntakeData = {
      stage: 'ask_completion_time',
      customerName: 'David Carter',
      serviceRequested: 'an electrician to look at an outlet that keeps sparking',
      request: 'an electrician to look at an outlet that keeps sparking',
      serviceAddress: '1147 Maple Street',
      desiredCompletionTime: 'this week',
    };
    enrichIntakeFromTranscript(
      'Uh actually not this week. Next Monday would be better',
      intake,
      'ask_completion_time',
      'CA-test-carter'
    );

    expect(intake.desiredCompletionTime!.toLowerCase()).toBe('next monday');
    // The rejected clause is timing-owned — it must not leak into Request.
    expect(intake.serviceRequested).toBe('an electrician to look at an outlet that keeps sparking');
  });

  it('a standalone "this week" answer still parses normally', () => {
    const intake: IntakeData = { stage: 'ask_completion_time', customerName: 'David Carter' };
    enrichIntakeFromTranscript('this week', intake, 'ask_completion_time', 'CA-test-standalone');
    expect(intake.desiredCompletionTime!.toLowerCase()).toBe('this week');
  });
});

describe('field boundaries inside one multi-field request sentence', () => {
  it('Sarah Miller sentence produces clean Request/address/completion/callback', () => {
    const intake: IntakeData = { stage: 'ask_request', customerName: 'Sarah Miller' };
    enrichIntakeFromTranscript(
      'My water heater is leaking and I need someone out sometime tomorrow. The address is 2918 Brookline Boulevard You can call me anytime after 2 pm',
      intake,
      'ask_request',
      'CA-test-sarah'
    );

    expect(intake.serviceRequested).toBeTruthy();
    expect(intake.serviceRequested!.toLowerCase()).toContain('water heater');
    // Field-owned clauses must not be absorbed into the Request.
    expect(intake.serviceRequested!.toLowerCase()).not.toContain('address is');
    expect(intake.serviceRequested!.toLowerCase()).not.toContain('call me');
    expect(intake.serviceRequested!.toLowerCase()).not.toContain('after 2');

    // Address stops at the callback clause boundary even without punctuation.
    expect(intake.serviceAddress).toBe('2918 Brookline Boulevard');
    expect(intake.serviceAddress!.toLowerCase()).not.toContain('call me');

    // Completion is the timing phrase, not the intent scaffold.
    expect(intake.desiredCompletionTime!.toLowerCase()).toBe('sometime tomorrow');
    expect(intake.desiredCompletionTime!.toLowerCase()).not.toContain('someone out');

    expect(intake.callbackTime).toBeTruthy();
    expect(intake.callbackTime!.toLowerCase()).toContain('after 2');
  });
});

describe('scalar normalization', () => {
  it('"next Monday would be better" normalizes to a timing value', () => {
    const intake: IntakeData = { stage: 'ask_completion_time', customerName: 'Kevin Brooks' };
    enrichIntakeFromTranscript('next Monday would be better', intake, 'ask_completion_time', 'CA-test-norm');
    expect(intake.desiredCompletionTime!.toLowerCase()).toBe('next monday');
  });

  it('"Afternoon is are best for a callback" normalizes to the daypart', () => {
    const intake: IntakeData = { stage: 'ask_callback_time', customerName: 'David Carter' };
    enrichIntakeFromTranscript('Afternoon is are best for a callback', intake, 'ask_callback_time', 'CA-test-norm-cb');
    expect(intake.callbackTime!.toLowerCase()).toBe('afternoon');
  });
});
