const { expect } = require('chai');
const { enrichIntakeFromTranscript } = require('../src/intake-skip-ahead');

function makeIntake(partial: any = {}) {
  return {
    customerName: '',
    serviceRequested: '',
    issueDescription: '',
    serviceAddress: '',
    desiredCompletionTime: '',
    callbackTime: '',
    ...partial,
  };
}

describe('Correction/replacement semantics', () => {
  it('replaces service, address, completion, and callback in a single correction utterance', () => {
    const intake = makeIntake({
      customerName: 'Jason Williams',
      serviceRequested: 'a toilet repaired',
      serviceAddress: '100 Main Street',
      desiredCompletionTime: 'Friday',
      callbackTime: 'tomorrow morning',
    });

    const result = enrichIntakeFromTranscript(
      "Actually it's the shower, not the toilet. The address is 220 Oak Street. I need it Saturday and call me tomorrow afternoon instead.",
      intake,
      'ask_completion_time'
    );

    expect(intake.customerName).to.equal('Jason Williams');
    expect(intake.serviceRequested).to.match(/shower/i);
    expect(intake.serviceAddress).to.equal('220 Oak Street');
    expect(intake.desiredCompletionTime.toLowerCase()).to.include('saturday');
    expect(intake.callbackTime.toLowerCase()).to.include('tomorrow afternoon');
    expect(intake.desiredCompletionTime).to.not.include("toilet");
    expect(intake.callbackTime).to.not.include("instead");
    expect(intake.serviceRequested.toLowerCase()).to.not.include('toilet');
  });

  it('replaces only address with explicit correction marker', () => {
    const intake = makeIntake({
      customerName: 'Jason Williams',
      serviceRequested: 'a toilet repaired',
      serviceAddress: '100 Main Street',
      desiredCompletionTime: 'Friday',
      callbackTime: 'tomorrow morning',
    });

    enrichIntakeFromTranscript('Actually use 500 Pine Street instead', intake, 'ask_callback_time');

    expect(intake.serviceAddress).to.equal('500 Pine Street');
    expect(intake.serviceRequested.toLowerCase()).to.include('toilet');
    expect(intake.desiredCompletionTime).to.equal('Friday');
    expect(intake.callbackTime).to.equal('tomorrow morning');
  });

  it('replaces only completion with explicit correction marker', () => {
    const intake = makeIntake({
      customerName: 'Jason Williams',
      serviceRequested: 'a toilet repaired',
      serviceAddress: '100 Main Street',
      desiredCompletionTime: 'Friday',
      callbackTime: 'tomorrow morning',
    });

    enrichIntakeFromTranscript('Actually make it Monday instead', intake, 'ask_callback_time');

    expect(intake.desiredCompletionTime.toLowerCase()).to.include('monday');
    expect(intake.serviceRequested.toLowerCase()).to.include('toilet');
    expect(intake.serviceAddress).to.equal('100 Main Street');
    expect(intake.callbackTime).to.equal('tomorrow morning');
  });

  it('replaces only callback with explicit correction marker', () => {
    const intake = makeIntake({
      customerName: 'Jason Williams',
      serviceRequested: 'a toilet repaired',
      serviceAddress: '100 Main Street',
      desiredCompletionTime: 'Friday',
      callbackTime: 'tomorrow morning',
    });

    enrichIntakeFromTranscript('Call me in the evening instead', intake, 'ask_callback_time');

    expect(intake.callbackTime.toLowerCase()).to.include('evening');
    expect(intake.serviceRequested.toLowerCase()).to.include('toilet');
    expect(intake.serviceAddress).to.equal('100 Main Street');
    expect(intake.desiredCompletionTime).to.equal('Friday');
  });

  it('replaces service while preserving address and timing', () => {
    const intake = makeIntake({
      customerName: 'Jason Williams',
      serviceRequested: 'a toilet repaired',
      serviceAddress: '100 Main Street',
      desiredCompletionTime: 'Friday',
      callbackTime: 'tomorrow morning',
    });

    enrichIntakeFromTranscript("Actually it's a shower leak, not the toilet", intake, 'ask_completion_time');

    expect(intake.serviceRequested.toLowerCase()).to.include('shower');
    expect(intake.serviceRequested.toLowerCase()).to.not.include('toilet');
    expect(intake.serviceAddress).to.equal('100 Main Street');
    expect(intake.desiredCompletionTime).to.equal('Friday');
    expect(intake.callbackTime).to.equal('tomorrow morning');
  });

  it('does not destructively overwrite from ordinary elaboration without correction markers', () => {
    const intake = makeIntake({
      customerName: 'Jason Williams',
      serviceRequested: 'a toilet repaired',
      serviceAddress: '100 Main Street',
      desiredCompletionTime: 'Friday',
      callbackTime: 'tomorrow morning',
    });

    enrichIntakeFromTranscript('The address has a red door', intake, 'ask_completion_time');

    expect(intake.serviceAddress).to.equal('100 Main Street');
    expect(intake.serviceRequested.toLowerCase()).to.include('toilet');
    expect(intake.desiredCompletionTime).to.equal('Friday');
    expect(intake.callbackTime).to.equal('tomorrow morning');
  });

  it('does not replace service from an unrelated add-on', () => {
    const intake = makeIntake({
      customerName: 'Jason Williams',
      serviceRequested: 'a toilet repaired',
      serviceAddress: '100 Main Street',
      desiredCompletionTime: 'Friday',
      callbackTime: 'tomorrow morning',
    });

    enrichIntakeFromTranscript('I also have another sink upstairs', intake, 'ask_completion_time');

    expect(intake.serviceRequested.toLowerCase()).to.include('toilet');
    expect(intake.serviceAddress).to.equal('100 Main Street');
    expect(intake.desiredCompletionTime).to.equal('Friday');
    expect(intake.callbackTime).to.equal('tomorrow morning');
  });

  it('still fills missing fields on normal skip-ahead (Christopher max skip-ahead analog)', () => {
    const intake = makeIntake({
      customerName: 'Christopher',
      serviceRequested: '',
      serviceAddress: '',
      desiredCompletionTime: '',
      callbackTime: '',
    });

    const result = enrichIntakeFromTranscript(
      'I need a fence repair at 45 Maple Drive by next Tuesday and call me anytime after 5pm',
      intake,
      'ask_request'
    );

    expect(intake.serviceRequested.toLowerCase()).to.include('fence');
    expect(intake.serviceAddress.toLowerCase()).to.include('45 maple drive');
    expect(intake.desiredCompletionTime.toLowerCase()).to.include('next tuesday');
    expect(intake.callbackTime.toLowerCase()).to.include('after 5pm');
  });

  it('still extracts natural timing on grass-cut style request', () => {
    const intake = makeIntake({
      customerName: 'Mike',
      serviceRequested: '',
      serviceAddress: '',
      desiredCompletionTime: '',
      callbackTime: '',
    });

    enrichIntakeFromTranscript(
      'I need my lawn cut this weekend. My address is 12 Garden Lane. Call me in the morning.',
      intake,
      'ask_request'
    );

    expect(intake.serviceRequested.toLowerCase()).to.include('lawn');
    expect(intake.serviceAddress.toLowerCase()).to.include('12 garden lane');
    expect(intake.desiredCompletionTime.toLowerCase()).to.include('this weekend');
    expect(intake.callbackTime.toLowerCase()).to.include('morning');
  });
});
