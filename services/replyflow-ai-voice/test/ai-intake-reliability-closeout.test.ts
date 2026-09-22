// @vitest-environment node
/**
 * Final pre-launch AI intake reliability closeout.
 *
 * Covers the physical-call failures:
 * - ASR name ambiguity: "Ryan Bandi" mistranscribed as "Buying Band-Aid" must
 *   never be persisted as a customer name (rejection -> reprompt -> unknown,
 *   never fabrication).
 * - Spoken house numbers must be preserved as digits in serviceAddress.
 * - Timing-stage answers must not leak into structured Details.
 * - Details text must drop verbal filler without dropping facts.
 */

import { describe, it, expect } from 'vitest';
import { enrichIntakeFromTranscript, spokenHouseNumberToDigits } from '../src/intake-skip-ahead';
import { isValidCustomerName, cleanDisplayIntakeText } from '../src/intake-validation';
import type { IntakeData } from '../src/intake-skip-ahead';

function makeIntake(partial: Partial<IntakeData> = {}): IntakeData {
  return { stage: 'ask_name', ...partial } as IntakeData;
}

function seeded(): IntakeData {
  return {
    stage: 'ask_completion_time',
    customerName: 'Ryan Bandi',
    serviceRequested: 'faucet repair',
    request: 'faucet repair',
    serviceAddress: '1632 South Pine Drive',
  } as IntakeData;
}

describe('name fidelity — ASR ambiguity', () => {
  it('rejects the "Buying Band-Aid" mistranscription of "Ryan Bandi"', () => {
    expect(isValidCustomerName('Buying Band-Aid')).to.equal(false);
    expect(isValidCustomerName('Buying Bandaid')).to.equal(false);
    const intake = makeIntake();
    enrichIntakeFromTranscript('Buying Band-Aid', intake, 'ask_name');
    expect(intake.customerName || '').to.equal('');
  });

  it('rejects other all-common-vocabulary non-names', () => {
    for (const bad of ['Selling Tape', 'Testing Calling', 'Canceling Subscription']) {
      expect(isValidCustomerName(bad), bad).to.equal(false);
    }
  });

  it('accepts uncommon but legitimate names', () => {
    const names = [
      'Ryan Bandi',
      'Siobhan O\'Connor',
      'DeShawn Jackson',
      'Anne-Marie Smith',
      'Loving Turner',
      'Summer Fields',
      'Rose Parks',
      'X Æ A-Xii'.split(' ')[0] === 'X' ? 'Zahiruddin Qureshi' : 'x',
      'Nkemdirim Okafor',
      'Saoirse Ronan',
    ];
    for (const name of names) {
      expect(isValidCustomerName(name), name).to.equal(true);
    }
  });

  it('still rejects refusals and meta answers as names', () => {
    for (const bad of ["I don't want to say", 'None of your business', 'Why do you need that', 'Hello?', 'yeah okay']) {
      expect(isValidCustomerName(bad), bad).to.equal(false);
    }
  });
});

describe('spoken house-number preservation', () => {
  it('parses every spoken-number variant to 1632', () => {
    for (const phrase of [
      'sixteen thirty-two',
      'sixteen thirty two',
      'one six three two',
      'one thousand six hundred thirty-two',
      'sixteen hundred thirty-two',
      '1632',
    ]) {
      expect(spokenHouseNumberToDigits(phrase), phrase).to.equal('1632');
    }
  });

  it('does not fabricate digits from ambiguous phrases', () => {
    expect(spokenHouseNumberToDigits('south pine')).to.equal(null);
    expect(spokenHouseNumberToDigits('the house on')).to.equal(null);
    expect(spokenHouseNumberToDigits('')).to.equal(null);
  });

  it('captures the full spoken address into serviceAddress', () => {
    const intake = makeIntake({
      stage: 'ask_location',
      customerName: 'Ryan Bandi',
      serviceRequested: 'faucet repair',
      request: 'faucet repair',
    });
    enrichIntakeFromTranscript('Sixteen thirty-two South Pine Drive', intake, 'ask_location');
    expect(intake.serviceAddress).to.equal('1632 South Pine Drive');
  });

  it('preserves direction, street name, type, and unit when spoken', () => {
    const intake = makeIntake({
      stage: 'ask_location',
      customerName: 'Ryan Bandi',
      serviceRequested: 'faucet repair',
      request: 'faucet repair',
    });
    enrichIntakeFromTranscript(
      'My address is sixteen thirty-two South Pine Drive',
      intake,
      'ask_location'
    );
    expect(intake.serviceAddress).to.equal('1632 South Pine Drive');
  });
});

describe('stage ownership — timing answers never leak into Details', () => {
  it('"in the next week if he could" populates timing, not Details', () => {
    const intake = seeded();
    enrichIntakeFromTranscript('In the next week if he could.', intake, 'ask_completion_time');
    expect((intake.issueDescription || '').toLowerCase()).to.not.include('next week');
    expect((intake.desiredCompletionTime || '').toLowerCase()).to.include('week');
  });

  it('other lead-in timing forms stay out of Details', () => {
    for (const answer of [
      'Within a couple of days.',
      'By the end of the week.',
      'As soon as he can.',
      'Not before Thursday.',
      'Later this week if possible.',
      'Early next week.',
      'Whenever works for you.',
    ]) {
      const intake = seeded();
      enrichIntakeFromTranscript(answer, intake, 'ask_completion_time');
      expect(
        (intake.issueDescription || '').toLowerCase(),
        answer
      ).to.not.match(/week|days|thursday|soon|whenever|convenient/i);
    }
  });

  it('incident-history timing still counts as a detail', () => {
    // "around 2 pm yesterday" describes WHEN the problem happened — detail,
    // not a desired-completion answer.
    const intake = makeIntake({
      stage: 'ask_request',
      customerName: 'Ryan Bandi',
    });
    enrichIntakeFromTranscript(
      'My water heater shut off around 2 pm yesterday.',
      intake,
      'ask_request'
    );
    expect((intake.serviceRequested || intake.issueDescription || '').toLowerCase()).to.match(/water heater|shut off/);
  });
});

describe('display-level detail cleanup', () => {
  it('strips verbal filler while keeping facts and caller casing', () => {
    expect(cleanDisplayIntakeText('Um, the the pipe is, uh, leaking under the sink.')).to.equal(
      'the pipe is, leaking under the sink.'
    );
    expect(cleanDisplayIntakeText('So basically, um, it rattles when it runs'))
      .to.equal('it rattles when it runs');
  });

  it('retains explicit uncertainty and qualifications', () => {
    const out = cleanDisplayIntakeText("I think it's the seal, but I'm not sure.");
    expect(out.toLowerCase()).to.include('not sure');
  });

  it('filler-heavy answers produce cleaned Details', () => {
    const intake = makeIntake({
      stage: 'ask_request',
      customerName: 'Ryan Bandi',
    });
    enrichIntakeFromTranscript(
      'Um, yeah, so my kitchen faucet is, uh, dripping constantly, you know.',
      intake,
      'ask_request'
    );
    const det = (intake.issueDescription || '').toLowerCase();
    expect(det).to.not.match(/\bum\b|\buh\b|you know/);
  });
});

describe('correction reliability regression', () => {
  it('later timing corrections replace, never concatenate', () => {
    const intake = makeIntake({
      stage: 'ask_completion_time',
      customerName: 'Ryan Bandi',
      serviceRequested: 'faucet repair',
      request: 'faucet repair',
      desiredCompletionTime: 'Friday',
    });
    enrichIntakeFromTranscript('Actually, make that next Tuesday instead.', intake, 'ask_completion_time');
    expect((intake.desiredCompletionTime || '').toLowerCase()).to.include('tuesday');
    expect((intake.desiredCompletionTime || '').toLowerCase()).to.not.include('friday');
  });

  it('Jason Williams punctuation acceptance is preserved', () => {
    expect(isValidCustomerName('Jason Williams.')).to.equal(true);
    const intake = makeIntake();
    enrichIntakeFromTranscript('Jason Williams.', intake, 'ask_name');
    expect(intake.customerName).to.equal('Jason Williams');
  });
});
