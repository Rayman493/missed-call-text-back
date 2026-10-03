/**
 * Regression tests for stage-answer field isolation.
 *
 * Production bug (call CA94112c4ea96c33110b9cb0c4c104300a): the callback-time
 * answer "in the afternoons" was stored in callbackTime correctly, but the
 * same utterance ALSO leaked into issueDescription because no callback pattern
 * matched the "in the <daypart>(s)" phrasing and nothing consumed the
 * sentence before the details extractor ran.
 *
 * A stage's scalar answer must only populate its own field — never Details —
 * unless the utterance explicitly carries content for another field.
 */

import { describe, it, expect } from 'vitest';
import { enrichIntakeFromTranscript } from '../src/intake-skip-ahead';
import type { IntakeData } from '../src/intake-skip-ahead';

const baseIntake = (): IntakeData => ({
  stage: 'ask_callback_time',
  customerName: 'Jack Johnson',
  serviceRequested:
    "I have a new toilet that I bought from Lowe's, but I don't know how to install it, and I need you to help me",
  serviceAddress: '172 space bar drive',
  desiredCompletionTime: 'In the next couple days',
});

describe('field isolation — stage scalar answers never leak into Details', () => {
  it('production case: "in the afternoons" at ask_callback_time → callbackTime only', () => {
    const intake = baseIntake();
    const res = enrichIntakeFromTranscript('in the afternoons', intake, 'ask_callback_time', 'CA-test');

    expect(intake.callbackTime).to.equal('in the afternoons');
    expect(intake.issueDescription).to.be.undefined;
    expect(res.applied).to.not.include('issueDescription');
  });

  it('daypart variants at ask_callback_time → callback only, no Details', () => {
    for (const utterance of ['in the afternoon', 'mornings', 'early evenings', 'in the evenings']) {
      const intake = baseIntake();
      enrichIntakeFromTranscript(utterance, intake, 'ask_callback_time', 'CA-test');
      expect(intake.issueDescription, `issueDescription leaked for "${utterance}"`).to.be.undefined;
      expect(intake.callbackTime, `callbackTime missing for "${utterance}"`).to.be.a('string');
    }
  });

  it('"in the next couple days" at ask_completion_time → completion only', () => {
    const intake = baseIntake();
    enrichIntakeFromTranscript('in the next couple days', intake, 'ask_completion_time', 'CA-test');
    expect(intake.desiredCompletionTime).to.equal('in the next couple days');
    expect(intake.issueDescription).to.be.undefined;
  });

  it('bare timing scalars at ask_completion_time → completion only, no Details', () => {
    for (const utterance of ['next Friday', 'this weekend', 'as soon as possible']) {
      const intake = baseIntake();
      enrichIntakeFromTranscript(utterance, intake, 'ask_completion_time', 'CA-test');
      expect(intake.issueDescription, `issueDescription leaked for "${utterance}"`).to.be.undefined;
    }
  });

  it('address answer at ask_location → location only, no Details', () => {
    const intake = baseIntake();
    enrichIntakeFromTranscript('172 space bar drive', intake, 'ask_location', 'CA-test');
    expect(intake.issueDescription).to.be.undefined;
  });

  it('name answer at ask_name → name only, no Details', () => {
    const intake = baseIntake();
    delete intake.customerName;
    enrichIntakeFromTranscript('Jack Johnson', intake, 'ask_name', 'CA-test');
    expect(intake.issueDescription).to.be.undefined;
  });

  it('callback phrasing at ask_request is captured as callback (explicit secondary field), not Details', () => {
    const intake = baseIntake();
    delete intake.callbackTime;
    enrichIntakeFromTranscript('in the afternoons', intake, 'ask_request', 'CA-test');
    expect(intake.callbackTime).to.equal('in the afternoons');
    expect(intake.issueDescription).to.be.undefined;
  });

  it('request answer at ask_request → request captured, no Details leak', () => {
    const intake: IntakeData = { stage: 'ask_request', customerName: 'Jack Johnson' };
    enrichIntakeFromTranscript(
      "I have a new toilet that I bought from Lowe's, but I don't know how to install it, and I need you to help me",
      intake,
      'ask_request',
      'CA-test'
    );
    expect(intake.serviceRequested).to.be.a('string');
    expect(intake.callbackTime).to.be.undefined;
    expect(intake.serviceAddress).to.be.undefined;
  });

  it('existing Details survives and callback answer does not duplicate into it', () => {
    const intake = baseIntake();
    intake.issueDescription = 'the shutoff valve is behind the toilet';
    enrichIntakeFromTranscript('in the afternoons', intake, 'ask_callback_time', 'CA-test');
    expect(intake.issueDescription).to.equal('the shutoff valve is behind the toilet');
    expect(intake.callbackTime).to.equal('in the afternoons');
  });

  it('a callback answer identical in shape to details does not copy into Details', () => {
    const intake = baseIntake();
    enrichIntakeFromTranscript('in the afternoons', intake, 'ask_callback_time', 'CA-test');
    // Second identical utterance must not re-merge it into details either
    enrichIntakeFromTranscript('in the afternoons', intake, 'ask_callback_time', 'CA-test');
    expect(intake.issueDescription).to.be.undefined;
    expect(intake.callbackTime).to.equal('in the afternoons');
  });
});

describe('callback windows — connector-joined constraints stay in callbackTime', () => {
  it('production case: "call me back after 2 pm. but before 5 pm" → whole window, no Details leak', () => {
    const intake = baseIntake();
    intake.issueDescription =
      "As you guys did it for one of my neighbors before. I thought it looked good. I'd like you guys to do some landscaping for my backyard";
    const res = enrichIntakeFromTranscript(
      'You can call me back after 2 pm. but before 5 pm',
      intake,
      'ask_callback_time',
      'CA-test'
    );
    expect(intake.callbackTime).to.equal('after 2 pm but before 5 pm');
    expect(intake.issueDescription).to.not.contain('before 5 pm');
    expect(intake.issueDescription).to.not.contain('after 2 pm');
    expect(res.applied).to.not.include('issueDescription');
  });

  it('bare callback window without trigger wording → whole window captured', () => {
    for (const [utterance, expected] of [
      ['after 2 pm but before 5 pm', 'after 2 pm but before 5 pm'],
      ['between 2 and 5 pm', 'between 2 and 5 pm'],
      ['call me back after 2 pm but before 5 pm', 'after 2 pm but before 5 pm'],
    ] as const) {
      const intake = baseIntake();
      enrichIntakeFromTranscript(utterance, intake, 'ask_callback_time', 'CA-test');
      expect(intake.callbackTime).to.equal(expected);
      expect(intake.issueDescription).to.be.undefined;
    }
  });

  it('callback-only examples never reach Details', () => {
    for (const utterance of [
      'after 2 pm',
      'before 5',
      'call me before noon',
      'anytime but before 5 pm',
    ]) {
      const intake = baseIntake();
      enrichIntakeFromTranscript(utterance, intake, 'ask_callback_time', 'CA-test');
      expect(intake.callbackTime).to.be.a('string');
      expect(intake.issueDescription).to.be.undefined;
    }
  });

  it('genuine non-timing detail in a callback utterance is preserved in the canonical Request', () => {
    const intake = baseIntake();
    enrichIntakeFromTranscript(
      'Call me after 4, and one other thing, the gate is locked',
      intake,
      'ask_callback_time',
      'CA-test'
    );
    expect(intake.callbackTime).to.equal('after 4');
    expect(intake.callbackTime).to.not.contain('gate');
    // ONE canonical Request: volunteered context merges into serviceRequested
    // instead of a separate Details field.
    expect(intake.serviceRequested).to.contain('gate is locked');
    expect(intake.issueDescription).to.be.undefined;
  });
});
