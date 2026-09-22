// @vitest-environment node
/**
 * Regression tests for the physically reproduced Jason Williams call.
 *
 * AI-INTAKE-013: "Jason Williams." was rejected with no_name_content because
 * isValidCustomerName never normalized sentence punctuation before the
 * structural token check ("Williams." failed the name-token regex).
 *
 * AI-INTAKE-014: An explicit service correction
 * ("Actually, I misspoke. It's not the faucet. It's a leaking pipe under the
 * sink.") was stored as issueDescription while the obsolete service stayed
 * canonical in serviceRequested/request, because
 * extractCorrectionServiceRequest could not capture a replacement clause that
 * ends at end-of-utterance after a negated first clause.
 */

import { describe, it, expect } from 'vitest';
import { enrichIntakeFromTranscript } from '../src/intake-skip-ahead';
import { isValidCustomerName } from '../src/intake-validation';
import type { IntakeData } from '../src/intake-skip-ahead';

function makeIntake(partial: Partial<IntakeData> = {}): IntakeData {
  return { stage: 'ask_name', ...partial } as IntakeData;
}

function makeSeededIntake(serviceRequested: string): IntakeData {
  return {
    stage: 'ask_location',
    customerName: 'Jason Williams',
    serviceRequested,
    request: serviceRequested,
    issueDescription: '',
    serviceAddress: '100 Main Street',
    desiredCompletionTime: 'Friday',
    callbackTime: 'tomorrow morning',
  } as IntakeData;
}

describe('AI-INTAKE-013: valid standalone name acceptance', () => {
  it('accepts "Jason Williams." with trailing sentence punctuation', () => {
    expect(isValidCustomerName('Jason Williams.')).to.equal(true);
    const intake = makeIntake();
    enrichIntakeFromTranscript('Jason Williams.', intake, 'ask_name');
    expect(intake.customerName).to.equal('Jason Williams');
    expect(intake.nameRefused).to.not.equal(true);
  });

  it('accepts ordinary two-token personal names', () => {
    const names = [
      'Jason Williams',
      'Sarah Miller',
      'Daniel Harris',
      'Michael Thompson',
      'Emily Carter',
      'Robert Anderson',
      'DeShawn Jackson',
      'Anne-Marie Smith',
      "Siobhan O'Connor",
    ];
    for (const name of names) {
      expect(isValidCustomerName(name), name).to.equal(true);
    }
  });

  it('accepts single plausible first names', () => {
    expect(isValidCustomerName('Chris')).to.equal(true);
    expect(isValidCustomerName('Maria')).to.equal(true);
  });

  it('accepts names with exclamation or period punctuation', () => {
    expect(isValidCustomerName('Jason Williams!')).to.equal(true);
    expect(isValidCustomerName('Jason Williams.')).to.equal(true);
  });

  it('extracts the name from "My name is Jason Williams."', () => {
    const intake = makeIntake();
    enrichIntakeFromTranscript('My name is Jason Williams.', intake, 'ask_name');
    expect(intake.customerName).to.equal('Jason Williams');
  });

  it('still rejects refusals, meta questions, filler, and silence', () => {
    const rejected = [
      "I don't want to say.",
      'None of your business.',
      'Why do you need that?',
      'I already told you.',
      'Hello?',
      'Uh...',
      'Whatever.',
      '',
      '   ',
      'yeah okay',
    ];
    for (const text of rejected) {
      expect(isValidCustomerName(text), JSON.stringify(text)).to.equal(false);
    }
    // Rejected text must not populate customerName via enrichment either.
    for (const text of rejected) {
      const intake = makeIntake();
      enrichIntakeFromTranscript(text, intake, 'ask_name');
      expect(intake.customerName || '', JSON.stringify(text)).to.equal('');
    }
  });

  it('keeps fragmented-name support: each plausible fragment validates', () => {
    // The runtime continuation window merges utterances into one logical turn;
    // each fragment is itself a plausible name and never a refusal.
    expect(isValidCustomerName('Jason')).to.equal(true);
    expect(isValidCustomerName('Williams')).to.equal(true);
    const intake = makeIntake();
    enrichIntakeFromTranscript('Jason', intake, 'ask_name');
    enrichIntakeFromTranscript('Williams', intake, 'ask_name');
    expect(isValidCustomerName(intake.customerName || '')).to.equal(true);
    expect(intake.nameRefused).to.not.equal(true);
  });

  it('does not force a valid full name into continuation mode', () => {
    // "Jason Williams." satisfies the ask_name validator on the first turn —
    // the same predicate the stage validator uses (isCanonicalCustomerName).
    expect(isValidCustomerName('Jason Williams.')).to.equal(true);
    const intake = makeIntake();
    const result = enrichIntakeFromTranscript('Jason Williams.', intake, 'ask_name');
    expect(result.applied).to.include('customerName');
    expect(intake.customerName).to.equal('Jason Williams');
  });
});

describe('AI-INTAKE-014: explicit service correction replaces canonical request', () => {
  it('faucet -> explicit leaking-pipe correction replaces canonical request', () => {
    const intake = makeSeededIntake('fix a broken bathroom faucet');
    enrichIntakeFromTranscript(
      "Actually, I misspoke. It's not the faucet. It's a leaking pipe under the sink.",
      intake,
      'ask_location'
    );
    expect(intake.serviceRequested).to.equal('leaking pipe under the sink');
    expect(intake.request).to.equal('leaking pipe under the sink');
    expect(intake.serviceRequested!.toLowerCase()).to.not.include('faucet');
    // The obsolete correction sentence must not be parked in issueDescription.
    expect((intake.issueDescription || '').toLowerCase()).to.not.include('misspoke');
    expect((intake.issueDescription || '').toLowerCase()).to.not.include('not the faucet');
  });

  it('water heater -> furnace correction replaces canonical request', () => {
    const intake = makeSeededIntake('repair my water heater');
    enrichIntakeFromTranscript(
      "Actually, it's the furnace, not the water heater.",
      intake,
      'ask_location'
    );
    expect(intake.serviceRequested!.toLowerCase()).to.include('furnace');
    expect(intake.serviceRequested!.toLowerCase()).to.not.include('water heater');
    expect(intake.request).to.equal(intake.serviceRequested);
  });

  it('fence -> backyard gate correction replaces canonical request', () => {
    const intake = makeSeededIntake('repair the front fence');
    enrichIntakeFromTranscript('Sorry, I meant the backyard gate.', intake, 'ask_location');
    expect(intake.serviceRequested!.toLowerCase()).to.include('gate');
    expect(intake.serviceRequested!.toLowerCase()).to.not.include('fence');
    expect(intake.request).to.equal(intake.serviceRequested);
  });

  it('sink install -> unclog correction replaces canonical request', () => {
    const intake = makeSeededIntake('install a new sink');
    enrichIntakeFromTranscript(
      "Actually, don't replace it. I just need the existing sink unclogged.",
      intake,
      'ask_location'
    );
    expect(intake.serviceRequested!.toLowerCase()).to.include('unclog');
    expect(intake.request).to.equal(intake.serviceRequested);
  });

  it('updates BOTH serviceRequested and request on correction', () => {
    const intake = makeSeededIntake('fix a broken bathroom faucet');
    enrichIntakeFromTranscript(
      "Actually, I misspoke. It's not the faucet. It's a leaking pipe under the sink.",
      intake,
      'ask_location'
    );
    expect(intake.serviceRequested).to.equal('leaking pipe under the sink');
    expect(intake.request).to.equal('leaking pipe under the sink');
  });

  it('latest explicit correction wins across multiple corrections', () => {
    const intake = makeSeededIntake('a toilet repaired');
    enrichIntakeFromTranscript("Actually it's the shower, not the toilet.", intake, 'ask_location');
    expect(intake.serviceRequested!.toLowerCase()).to.include('shower');
    enrichIntakeFromTranscript('Sorry, I meant the kitchen sink.', intake, 'ask_location');
    expect(intake.serviceRequested!.toLowerCase()).to.include('kitchen sink');
    expect(intake.serviceRequested!.toLowerCase()).to.not.include('shower');
    expect(intake.request).to.equal(intake.serviceRequested);
  });

  it('does not replace the canonical request on ordinary service details', () => {
    const intake = makeSeededIntake('faucet repair');
    enrichIntakeFromTranscript(
      "It's not leaking constantly, only when I turn it on.",
      intake,
      'ask_location'
    );
    expect(intake.serviceRequested).to.equal('faucet repair');
    expect(intake.request).to.equal('faucet repair');
  });

  it('does not replace the canonical request on a timing correction', () => {
    const intake = makeSeededIntake('fence repair');
    enrichIntakeFromTranscript('Actually, afternoons work better for me.', intake, 'ask_location');
    expect(intake.serviceRequested).to.equal('fence repair');
  });

  it('does not replace the canonical request on a location/detail correction', () => {
    const intake = makeSeededIntake('plumbing help');
    enrichIntakeFromTranscript("It's under the sink, not behind the wall.", intake, 'ask_location');
    expect(intake.serviceRequested).to.equal('plumbing help');
  });

  it('does not revert the corrected service during later location/timing/callback stages', () => {
    const intake = makeIntake({
      customerName: 'Jason Williams',
      serviceRequested: 'fix a broken bathroom faucet',
      request: 'fix a broken bathroom faucet',
    });
    enrichIntakeFromTranscript(
      "Actually, I misspoke. It's not the faucet. It's a leaking pipe under the sink.",
      intake,
      'ask_location'
    );
    expect(intake.serviceRequested).to.equal('leaking pipe under the sink');

    enrichIntakeFromTranscript('1632 South Pine Drive', intake, 'ask_location');
    enrichIntakeFromTranscript('By Thursday', intake, 'ask_completion_time');
    enrichIntakeFromTranscript('Anytime, around noon.', intake, 'ask_callback_time');

    expect(intake.serviceAddress).to.equal('1632 South Pine Drive');
    expect((intake.callbackTime || '').toLowerCase()).to.include('noon');
    expect(intake.serviceRequested).to.equal('leaking pipe under the sink');
    expect(intake.request).to.equal('leaking pipe under the sink');
    expect(intake.serviceRequested!.toLowerCase()).to.not.include('faucet');
  });

  // NOTE: completion-persistence canonicalization (buildCanonicalExtractedInfo)
  // is covered in canonical-extracted-info-correction.test.ts, including the
  // Jason Williams scenario — index.ts cannot be imported under vitest.
});

describe('Physical call fixture: Jason Williams end-to-end', () => {
  it('reproduces the real call and yields the corrected canonical state', () => {
    const intake = makeIntake();
    const transcriptHistory: string[] = [];
    const turn = (transcript: string, stage: string) => {
      transcriptHistory.push(transcript);
      enrichIntakeFromTranscript(transcript, intake, stage);
    };

    turn('Jason Williams.', 'ask_name');
    expect(intake.customerName).to.equal('Jason Williams');

    turn('I need someone to fix a broken bathroom faucet.', 'ask_request');
    expect((intake.serviceRequested || '').toLowerCase()).to.include('faucet');

    turn(
      "Actually, I misspoke. It's not the faucet. It's a leaking pipe under the sink.",
      'ask_location'
    );
    turn('1632 South Pine Drive', 'ask_location');
    turn('Anytime, around noon.', 'ask_callback_time');

    // The stage-answer write path persists a validated scalar transcript when
    // enrichment produced no scalar for the current field ("By Thursday, if
    // that's possible" carries a hedge clause). Mirror that contract here.
    turn("By Thursday, if that's possible.", 'ask_completion_time');
    if (!intake.desiredCompletionTime) {
      intake.desiredCompletionTime = "By Thursday, if that's possible";
    }

    expect(intake.customerName).to.equal('Jason Williams');
    expect(intake.serviceRequested).to.equal('leaking pipe under the sink');
    expect(intake.request).to.equal('leaking pipe under the sink');
    expect(intake.serviceRequested!.toLowerCase()).to.not.include('faucet');
    expect(intake.serviceAddress).to.equal('1632 South Pine Drive');
    expect(intake.desiredCompletionTime).to.equal("By Thursday, if that's possible");
    expect((intake.callbackTime || '').toLowerCase()).to.include('noon');

    // Historical wording stays in the transcript, never in the canonical field.
    expect(transcriptHistory.join(' ')).to.include('broken bathroom faucet');
  });
});
