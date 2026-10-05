/**
 * Regression tests for the canonical Request vs embedded scalar extraction.
 *
 * Production bug (call CA2053d674ae84d37143f25c6cade34de7): the caller's request
 * "...it's being put up over here in South Park. gonna need the roofing
 * installed" had "South Park" extracted into serviceAddress correctly, but the
 * scalar span was cut out of the request text mid-sentence, leaving the broken
 * "over here in  ." hole in the canonical Request.
 *
 * Rule: an embedded scalar may only be removed from the Request when the
 * remaining sentence can be safely normalized. Otherwise the natural request
 * text stays intact — the scalar still populates its own field.
 */

import { describe, it, expect } from 'vitest';
import { enrichIntakeFromTranscript } from '../src/intake-skip-ahead';
import type { IntakeData } from '../src/intake-skip-ahead';

const noBrokenHole = (text: string) => {
  expect(text).not.toMatch(/\s{2,}/); // no doubled spaces
  expect(text).not.toMatch(/\b(?:in|at|on|by|for|to|of|from|with|over|under|near|around|between|the|a|an|and|or|but|my|our|their)\s*\./i); // no "in ." hole
  expect(text).not.toMatch(/\s[,.;:]/); // no orphaned punctuation
};

describe('canonical Request preserves embedded scalars', () => {
  it('production transcript: "over here in South Park" stays grammatical, serviceAddress = South Park', () => {
    const intake: IntakeData = {
      stage: 'ask_request',
      customerName: 'John Smith',
    };
    enrichIntakeFromTranscript(
      "I'm looking to get some roofing done on my house. It's um, it's a new house and it's being put up over here in South Park. But, um, gonna need the the roofing installed on it as well",
      intake,
      'ask_request',
      'CA2053d674ae84d37143f25c6cade34de7'
    );

    expect(intake.serviceAddress).to.equal('South Park');
    expect(intake.serviceRequested).toBeTruthy();
    // The location may stay embedded in the natural request — it must NOT be
    // cut out leaving "over here in  ."
    expect(intake.serviceRequested).toContain('South Park');
    noBrokenHole(intake.serviceRequested!);
    // Trailing service clause must survive — no truncation at the scalar.
    expect(intake.serviceRequested!.toLowerCase()).toContain('roofing installed');
  });

  it('location embedded mid-request is preserved while still populating serviceAddress', () => {
    const intake: IntakeData = {
      stage: 'ask_request',
      customerName: 'John Smith',
    };
    enrichIntakeFromTranscript(
      'I need a fence put in at 123 Main Street and the gate needs to be replaced too',
      intake,
      'ask_request',
      'CA-test-embed'
    );

    expect(intake.serviceAddress).toBeTruthy();
    expect(intake.serviceAddress!.toLowerCase()).toContain('main street');
    expect(intake.serviceRequested).toBeTruthy();
    noBrokenHole(intake.serviceRequested!);
    expect(intake.serviceRequested!.toLowerCase()).toContain('gate');
  });

  it('trailing scalar answer still excises cleanly ("fix the sink at 123 Main Street")', () => {
    const intake: IntakeData = {
      stage: 'ask_request',
      customerName: 'John Smith',
    };
    enrichIntakeFromTranscript(
      'I need my sink fixed at 123 Main Street',
      intake,
      'ask_request',
      'CA-test-trailing'
    );

    expect(intake.serviceRequested).toBeTruthy();
    noBrokenHole(intake.serviceRequested!);
    expect(intake.serviceRequested!.toLowerCase()).toContain('sink');
  });
});

describe('scalar-only stage answers never pollute the canonical Request', () => {
  const baseIntake = (): IntakeData => ({
    stage: 'ask_request',
    customerName: 'John Smith',
    serviceRequested: 'get some roofing done on my house',
    request: 'get some roofing done on my house',
  });

  it('callback-only answer does not enter or alter Request', () => {
    const intake = baseIntake();
    enrichIntakeFromTranscript('in the mornings', intake, 'ask_callback_time', 'CA-test-cb');

    expect(intake.callbackTime).toBeTruthy();
    expect(intake.serviceRequested).to.equal('get some roofing done on my house');
  });

  it('completion-only answer does not enter or alter Request', () => {
    const intake = baseIntake();
    enrichIntakeFromTranscript('this month', intake, 'ask_completion_time', 'CA-test-comp');

    expect(intake.desiredCompletionTime).toBeTruthy();
    expect(intake.serviceRequested).to.equal('get some roofing done on my house');
  });

  it('standalone location answer does not contaminate Request', () => {
    const intake = baseIntake();
    enrichIntakeFromTranscript('in Bethel Park', intake, 'ask_location', 'CA-test-loc');

    expect(intake.serviceAddress).toBeTruthy();
    expect(intake.serviceRequested).to.equal('get some roofing done on my house');
  });
});

describe('embedded timing inside a natural request', () => {
  it('mid-sentence timing excision leaves no whitespace hole', () => {
    const intake: IntakeData = {
      stage: 'ask_request',
      customerName: 'John Smith',
    };
    enrichIntakeFromTranscript(
      'I need my furnace fixed sometime this week and it keeps shutting off',
      intake,
      'ask_request',
      'CA-test-timing-hole'
    );

    expect(intake.desiredCompletionTime).toBeTruthy();
    expect(intake.serviceRequested).toBeTruthy();
    noBrokenHole(intake.serviceRequested!);
    expect(intake.serviceRequested!.toLowerCase()).toContain('furnace fixed');
    expect(intake.serviceRequested!.toLowerCase()).toContain('keeps shutting off');
  });

  it('job-timing phrase does not leak into callbackTime', () => {
    const intake: IntakeData = {
      stage: 'ask_request',
      customerName: 'John Smith',
    };
    enrichIntakeFromTranscript(
      'I need the roof repaired by next Friday',
      intake,
      'ask_request',
      'CA-test-no-cb-leak'
    );

    expect(intake.desiredCompletionTime).toBeTruthy();
    // "Friday" is the job deadline, never when the caller can be reached —
    // extracting it as callbackTime would wrongly skip the callback stage.
    expect(intake.callbackTime).toBeUndefined();
  });

  it('explanatory clause after a timing scalar stays in the Request', () => {
    const intake: IntakeData = {
      stage: 'ask_request',
      customerName: 'John Smith',
    };
    enrichIntakeFromTranscript(
      'My water heater is leaking and I need someone out as soon as possible because it is flooding the basement',
      intake,
      'ask_request',
      'CA-test-because'
    );

    expect(intake.desiredCompletionTime).to.equal('As soon as possible');
    expect(intake.serviceRequested).toBeTruthy();
    // The incident detail must not be swallowed by the scalar's fullMatch.
    expect(intake.serviceRequested!.toLowerCase()).toContain('flooding the basement');
    noBrokenHole(intake.serviceRequested!);
  });

  it('standalone timing answers at their own stage still capture', () => {
    const cb: IntakeData = { stage: 'ask_callback_time', customerName: 'John Smith' };
    enrichIntakeFromTranscript('this afternoon', cb, 'ask_callback_time', 'CA-test-cb-stage');
    expect(cb.callbackTime).toBeTruthy();

    const comp: IntakeData = { stage: 'ask_completion_time', customerName: 'John Smith' };
    enrichIntakeFromTranscript('sometime next week', comp, 'ask_completion_time', 'CA-test-comp-stage');
    expect(comp.desiredCompletionTime).toBeTruthy();
  });

  it('a long service request with no scalars is preserved whole', () => {
    const intake: IntakeData = {
      stage: 'ask_request',
      customerName: 'John Smith',
    };
    const request =
      'I need the back fence replaced and the gate rehung because the storm knocked the whole section down onto the flower beds last weekend';
    enrichIntakeFromTranscript(request, intake, 'ask_request', 'CA-test-long');

    expect(intake.serviceRequested).toBeTruthy();
    expect(intake.serviceRequested!.toLowerCase()).toContain('fence');
    expect(intake.serviceRequested!.toLowerCase()).toContain('flower beds');
    noBrokenHole(intake.serviceRequested!);
  });
});

describe('re-clean of an existing request never reopens the scalar hole', () => {
  it('a later scalar turn must not truncate real request text that follows it', () => {
    const intake: IntakeData = {
      stage: 'ask_request',
      customerName: 'John Smith',
      serviceRequested:
        "get some roofing done on my house. it's a new house and it's being put up over here in South Park. gonna need the roofing installed on it as well",
      serviceAddress: 'South Park',
    };
    enrichIntakeFromTranscript('in the mornings', intake, 'ask_callback_time', 'CA-test-reclean');

    expect(intake.serviceRequested!.toLowerCase()).toContain('south park');
    expect(intake.serviceRequested!.toLowerCase()).toContain('roofing installed');
    noBrokenHole(intake.serviceRequested!);
  });
});
