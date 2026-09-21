/**
 * REPLYFLOW — AI INTAKE HARDENING BATCH 1 regression tests.
 *
 * Covers the Wave 1 physical-call findings:
 *  - conversational phrases must never satisfy the name field
 *  - explicit name correction (same-turn, later-turn, after refusal)
 *  - generic scalar corrections ("actually", "make that", "instead")
 *  - meta-conversation never satisfies a field
 *  - reason/details split with details optional
 *  - "Anytime" / "Anytime after 4" callback preservation
 *  - vague-but-meaningful completion answers accepted
 *  - completion gates use validated fields, not bare truthiness
 */
import { describe, it, expect } from 'vitest';
import {
  isValidCustomerName,
  isValidServiceAddress,
  isValidServiceRequest,
  isValidCompletionTime,
  isValidCallbackTime,
  isMetaUtterance,
  isConversationalFragment,
  isNameRequirementSatisfied,
  resolveNextRequiredStage,
  resolveNextSimpleModeStage,
  IntakeData,
} from '../src/intake-validation';
import {
  enrichIntakeFromTranscript,
  extractExplicitNameCorrection,
  extractCompletionTimeCandidate,
  extractCallbackTimeCandidate,
  splitServiceAndDetails,
  normalizeVagueCompletion,
} from '../src/intake-skip-ahead';

const baseIntake = (over: Partial<IntakeData> = {}): IntakeData => ({ stage: 'ask_name_reason', ...over });

describe('Name validation hardening', () => {
  it('accepts valid multi-word and uncommon names', () => {
    expect(isValidCustomerName('Mary Ann Smith')).to.equal(true);
    expect(isValidCustomerName("Siobhan O'Connor")).to.equal(true);
    expect(isValidCustomerName('Jose Garcia-Lopez')).to.equal(true);
    expect(isValidCustomerName('Cher')).to.equal(true);
    expect(isValidCustomerName('Michael Turner')).to.equal(true);
  });

  it('rejects conversational phrases as names', () => {
    expect(isValidCustomerName('Like old times')).to.equal(false);
    expect(isValidCustomerName('can you hear me')).to.equal(false);
    expect(isValidCustomerName("that's fine")).to.equal(false);
    expect(isValidCustomerName('Hello still there')).to.equal(false);
    expect(isValidCustomerName('I need a plumber')).to.equal(false);
    expect(isValidCustomerName('I said my name is')).to.equal(false);
  });

  it('rejects meta and uncertainty as names', () => {
    expect(isValidCustomerName('are you there')).to.equal(false);
    expect(isValidCustomerName("I'm not sure")).to.equal(false);
    expect(isValidCustomerName('')).to.equal(false);
  });
});

describe('Explicit name correction extraction', () => {
  it('extracts "I said X is my name"', () => {
    expect(extractExplicitNameCorrection('I said Michael Turner is my name')).to.equal('Michael Turner');
  });

  it('extracts "I already told you my name is X"', () => {
    expect(extractExplicitNameCorrection('I already told you my name is Sarah Jenkins')).to.equal('Sarah Jenkins');
  });

  it('extracts "No, my name is X" and "my name is actually X"', () => {
    expect(extractExplicitNameCorrection('No, my name is Rachel')).to.equal('Rachel');
    expect(extractExplicitNameCorrection('My name is actually Priya')).to.equal('Priya');
  });

  it('does not let intro prose match non-name stages', () => {
    // Weak intro forms are gated off outside name-collecting stages.
    expect(extractExplicitNameCorrection("It's urgent")).to.equal(null);
    expect(extractExplicitNameCorrection("I'm calling about my sink")).to.equal(null);
    // Strong self-identification still fires on any stage.
    expect(extractExplicitNameCorrection('I said Michael Turner is my name')).to.equal('Michael Turner');
  });

  it('intro forms work when allowNameIntro is set (name stages)', () => {
    expect(extractExplicitNameCorrection("It's Sarah", { allowNameIntro: true })).to.equal('Sarah');
    expect(extractExplicitNameCorrection("I'm David", { allowNameIntro: true })).to.equal('David');
  });
});

describe('Enrich: name correction behavior', () => {
  it('later-turn explicit name correction replaces a bad stored name', () => {
    const intake = baseIntake({ stage: 'ask_name_reason', customerName: 'Like old times' });
    enrichIntakeFromTranscript('I said Michael Turner is my name', intake, 'ask_name_reason', 'CA-test');
    expect(intake.customerName).to.equal('Michael Turner');
  });

  it('explicit name after earlier refusal clears nameRefused', () => {
    const intake = baseIntake({ stage: 'ask_name', nameRefused: true, customerName: '' });
    enrichIntakeFromTranscript('I said Michael Turner is my name', intake, 'ask_name', 'CA-test');
    expect(intake.customerName).to.equal('Michael Turner');
    expect(intake.nameRefused).to.equal(false);
  });

  it('explicit name correction prose does not become a service request', () => {
    const intake = baseIntake({ stage: 'ask_name_reason' });
    enrichIntakeFromTranscript('I said Michael Turner is my name', intake, 'ask_name_reason', 'CA-test');
    expect(intake.customerName).to.equal('Michael Turner');
    // Correction prose must not satisfy the service field.
    expect(intake.serviceRequested || '').to.not.include('said');
  });
});

describe('Meta-conversation guard', () => {
  it('detects meta utterances', () => {
    expect(isMetaUtterance('Hello, still there?')).to.equal(true);
    expect(isMetaUtterance('are you there?')).to.equal(true);
    expect(isMetaUtterance('can you hear me')).to.equal(true);
    expect(isMetaUtterance('hold on a second')).to.equal(true);
    expect(isMetaUtterance('I already told you')).to.equal(true);
  });

  it('does not flag substantive utterances', () => {
    expect(isMetaUtterance('Hello, I need a plumber')).to.equal(false);
    expect(isMetaUtterance('5128 Walnut Street')).to.equal(false);
    expect(isMetaUtterance('Tomorrow morning works')).to.equal(false);
  });

  it('meta utterances never satisfy field validators', () => {
    expect(isValidServiceAddress('Hello, still there?')).to.equal(false);
    expect(isValidServiceRequest('are you there?')).to.equal(false);
    expect(isValidCompletionTime('Hello, still there?')).to.equal(false);
    expect(isValidCallbackTime('can you hear me')).to.equal(false);
  });

  it('meta utterance produces no field mutations in enrichment', () => {
    const intake = baseIntake({ stage: 'ask_completion_time' });
    enrichIntakeFromTranscript('Hello, still there?', intake, 'ask_completion_time', 'CA-test');
    expect(intake.desiredCompletionTime || '').to.equal('');
    expect(intake.serviceRequested || '').to.equal('');
    expect(intake.customerName || '').to.equal('');
  });
});

describe('Conversational fragment rejection', () => {
  it('flags pure-conversation phrases', () => {
    expect(isConversationalFragment('like old times')).to.equal(true);
    expect(isConversationalFragment("that's fine")).to.equal(true);
    expect(isConversationalFragment('sounds good to me')).to.equal(true);
  });
  it('does not flag substantive answers', () => {
    expect(isConversationalFragment('fix my sink')).to.equal(false);
    expect(isConversationalFragment('a haircut')).to.equal(false);
    expect(isConversationalFragment('5128 Walnut Street')).to.equal(false);
  });
  it('conversational fragments cannot satisfy scalar fields', () => {
    expect(isValidServiceRequest('Like old times')).to.equal(false);
    expect(isValidServiceAddress('like old times')).to.equal(false);
    expect(isValidCompletionTime("that's fine")).to.equal(false);
    expect(isValidCallbackTime('sounds good to me')).to.equal(false);
  });
});

describe('Generic scalar corrections', () => {
  it('same-turn "make that" corrects the callback field only', () => {
    const intake = baseIntake({ stage: 'ask_callback_time', callbackTime: 'tomorrow morning' });
    enrichIntakeFromTranscript('Call me tomorrow morning. Make that tomorrow after 2 PM.', intake, 'ask_callback_time', 'CA-test');
    expect(intake.callbackTime).to.equal('tomorrow after 2 pm');
    // The superseded head must not leak into other fields.
    expect(intake.desiredCompletionTime || '').to.equal('');
    expect((intake.issueDescription || '').toLowerCase()).to.not.include('tomorrow morning');
  });

  it('same-turn "make that" corrects the completion field only', () => {
    const intake = baseIntake({ stage: 'ask_completion_time', desiredCompletionTime: 'friday', callbackTime: 'anytime' });
    enrichIntakeFromTranscript('I need it done Friday. Make that Saturday instead.', intake, 'ask_completion_time', 'CA-test');
    expect(intake.desiredCompletionTime).to.equal('Saturday');
    expect(intake.callbackTime).to.equal('anytime');
  });

  it('mentioning a field without correction intent does not replace it', () => {
    const intake = baseIntake({ stage: 'ask_callback_time', callbackTime: 'Anytime after 4' });
    enrichIntakeFromTranscript('I already told you my name is Sarah', intake, 'ask_callback_time', 'CA-test');
    expect(intake.callbackTime).to.equal('Anytime after 4');
    expect(intake.customerName).to.equal('Sarah');
  });
});

describe('Reason/details split', () => {
  it('splits multi-sentence service into concise reason + details', () => {
    const split = splitServiceAndDetails('I need my kitchen sink repaired. It has been leaking for three days and is getting worse.');
    expect(split.reason).to.equal('my kitchen sink repaired');
    expect(split.details).to.equal('It has been leaking for three days and is getting worse');
  });

  it('single-sentence service has no details', () => {
    const split = splitServiceAndDetails('I need a plumber');
    expect(split.details).to.equal(null);
  });

  it('enrichment preserves volunteered detail sentences', () => {
    const intake = baseIntake({ stage: 'ask_name_reason' });
    enrichIntakeFromTranscript(
      'Hi, my name is Sarah Chen. I need my water heater replaced. It is leaking at the base and making a rumbling noise.',
      intake, 'ask_name_reason', 'CA-test'
    );
    expect(intake.customerName).to.equal('Sarah Chen');
    expect(intake.serviceRequested).to.equal('my water heater replaced');
    expect(intake.issueDescription).to.contain('leaking at the base');
  });

  it('details remain optional - completion works without issueDescription', () => {
    const intake: IntakeData = {
      customerName: 'Michael Turner',
      serviceRequested: 'sink repair',
      serviceAddress: '5128 Walnut Street',
      desiredCompletionTime: 'tomorrow',
      callbackTime: 'Anytime',
    };
    expect(resolveNextSimpleModeStage(intake, 'onsite')).to.equal('complete');
  });
});

describe('Callback time preservation', () => {
  it('preserves "Anytime" (canonical lowercase; display capitalizes)', () => {
    expect(extractCallbackTimeCandidate('Anytime')).to.equal('anytime');
  });
  it('preserves "Anytime after 4"', () => {
    expect(extractCallbackTimeCandidate('Anytime after 4')).to.equal('anytime after 4');
  });
  it('does not truncate inside "okay" (the "Ay, but..." regression)', () => {
    const value = extractCallbackTimeCandidate('Anytime is okay, but preferably later in the afternoon');
    expect(value).to.not.equal(null);
    expect(value!.toLowerCase()).to.not.match(/^ay\b/);
    expect(value!.toLowerCase()).to.contain('afternoon');
  });
  it('keeps constraint phrasing on call-me answers', () => {
    // Raw extraction preserves case; canonical pm/am normalization happens
    // inside enrichIntakeFromTranscript.
    expect(extractCallbackTimeCandidate('You can call me after 5 PM')).to.equal('after 5 PM');
  });
});

describe('Vague completion handling', () => {
  it('accepts vague-but-meaningful completion answers', () => {
    expect(isValidCompletionTime('whenever')).to.equal(true);
    expect(isValidCompletionTime('no rush')).to.equal(true);
    expect(isValidCompletionTime('as soon as possible')).to.equal(true);
    expect(extractCompletionTimeCandidate("I'm not sure. Whenever you have availability is fine.")).to.not.equal(null);
    expect(extractCompletionTimeCandidate('No rush, take your time')).to.not.equal(null);
  });
  it('normalizes vague phrases canonically', () => {
    expect(normalizeVagueCompletion('Whenever you have availability is fine', '')).to.equal('Whenever available');
    expect(normalizeVagueCompletion('No rush, take your time', '')).to.equal('No rush');
    expect(normalizeVagueCompletion('as soon as you can', '')).to.equal('As soon as possible');
  });
  it('rejects filler/uncertainty/meta as completion', () => {
    expect(isValidCompletionTime("I'm not sure")).to.equal(false);
    expect(isValidCompletionTime('Hello, still there?')).to.equal(false);
    expect(isValidCompletionTime('')).to.equal(false);
  });
});

describe('Completion gate uses validated fields', () => {
  const validIntake: IntakeData = {
    customerName: 'Michael Turner',
    serviceRequested: 'sink repair',
    serviceAddress: '5128 Walnut Street',
    desiredCompletionTime: 'tomorrow',
    callbackTime: 'Anytime',
  };

  it('completes with valid fields', () => {
    expect(resolveNextRequiredStage(validIntake, 'onsite')).to.equal('complete');
    expect(resolveNextSimpleModeStage(validIntake, 'onsite')).to.equal('complete');
  });

  it('does not complete with a conversational service value', () => {
    const intake = { ...validIntake, serviceRequested: 'Like old times' };
    expect(resolveNextSimpleModeStage(intake, 'onsite')).to.equal('ask_request');
  });

  it('does not complete with a conversational name value', () => {
    const intake = { ...validIntake, customerName: 'like old times' };
    expect(resolveNextSimpleModeStage(intake, 'onsite')).to.not.equal('complete');
  });

  it('does not complete with a meta callback value', () => {
    const intake = { ...validIntake, callbackTime: 'hello, still there' };
    expect(resolveNextSimpleModeStage(intake, 'onsite')).to.equal('ask_callback_time');
  });

  it('does not complete with sentinel display values', () => {
    const intake = { ...validIntake, callbackTime: 'Not Provided' };
    expect(resolveNextSimpleModeStage(intake, 'onsite')).to.equal('ask_callback_time');
  });

  it('name refusal satisfies the name requirement', () => {
    const intake: IntakeData = { ...validIntake, customerName: '', nameRefused: true };
    expect(isNameRequirementSatisfied(intake)).to.equal(true);
    expect(resolveNextSimpleModeStage(intake, 'onsite')).to.equal('complete');
  });

  it('location refusal satisfies the location requirement', () => {
    const intake: IntakeData = { ...validIntake, serviceAddress: '', locationRefused: true };
    expect(resolveNextSimpleModeStage(intake, 'onsite')).to.equal('complete');
  });
});
