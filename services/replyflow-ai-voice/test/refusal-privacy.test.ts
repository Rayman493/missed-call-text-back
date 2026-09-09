const { expect } = require('chai');
const {
  enrichIntakeFromTranscript,
  isNameRefusal,
  isLocationRefusal,
  extractPartialLocation,
} = require('../src/intake-skip-ahead');
const { resolveNextRequiredStage, resolveNextSimpleModeStage, selectSimpleModePromptKey, isNameRequirementSatisfied } = require('../src/intake-validation');

describe('Refusal and partial-location handling', () => {
  it('detects a name refusal and does not store the refusal text as customerName', () => {
    const refusals = [
      "I'd rather not give my name",
      "I don't want to give my name",
      "I'd prefer not to say",
      "I'd rather not say",
      "No name",
      "I'd like to stay anonymous",
      "I'd like to remain anonymous",
      "I want to remain anonymous",
    ];
    for (const text of refusals) {
      expect(isNameRefusal(text), `should detect refusal in "${text}"`).to.be.true;
      const intake: any = {};
      enrichIntakeFromTranscript(text, intake, 'ask_name');
      expect(intake.nameRefused, `nameRefused flag for "${text}"`).to.be.true;
      expect(intake.customerName, `customerName for "${text}"`).to.be.empty;
    }
  });

  it('clears a stale customerName when a high-confidence name refusal is extracted', () => {
    const intake: any = { customerName: 'Previously Set Name' };
    enrichIntakeFromTranscript("I'd rather not give my name", intake, 'ask_name');
    expect(intake.nameRefused).to.be.true;
    expect(intake.customerName).to.be.empty;
  });

  it('allows a later real name to replace a previous name refusal', () => {
    const intake: any = { nameRefused: true, customerName: '' };
    enrichIntakeFromTranscript('My name is Jason Williams', intake, 'ask_name');
    expect(intake.nameRefused).to.be.true;
    expect(intake.customerName).to.equal('Jason Williams');
  });

  it('preserves a real name and does not erase it from an unrelated ambiguous utterance', () => {
    const intake: any = { customerName: 'Jason Williams' };
    enrichIntakeFromTranscript('Actually the sink is leaking worse', intake, 'ask_request');
    expect(intake.nameRefused).to.be.undefined;
    expect(intake.customerName).to.equal('Jason Williams');
  });

  it('extracts a usable partial location from privacy-aware answers', () => {
    const cases = [
      { text: "I don't want to give the exact address yet, but I'm in Pittsburgh.", expected: 'Pittsburgh' },
      { text: "I'm in Pittsburgh.", expected: 'Pittsburgh' },
      { text: "Near Squirrel Hill.", expected: 'Squirrel Hill' },
      { text: "I'm in the South Side.", expected: 'the South Side' },
      { text: "I don't want to give my address yet, but I'm in Bethel Park.", expected: 'Bethel Park' },
      { text: "Just Pittsburgh for now.", expected: 'Pittsburgh' },
      { text: "Bethel Park", expected: 'Bethel Park' },
    ];
    for (const { text, expected } of cases) {
      const intake: any = {};
      enrichIntakeFromTranscript(text, intake, 'ask_location');
      expect(intake.serviceAddress, `serviceAddress for "${text}"`).to.equal(expected);
    }
  });

  it('marks a pure location refusal when no broader area is provided', () => {
    const text = "I don't want to give the exact address";
    expect(isLocationRefusal(text)).to.be.true;
    const intake: any = {};
    enrichIntakeFromTranscript(text, intake, 'ask_location');
    expect(intake.locationRefused).to.be.true;
    expect(intake.serviceAddress).to.be.undefined;
  });

  it('keeps the full semantic phrase for vague completion times', () => {
    const cases = [
      { text: 'Whenever you can.', expected: 'Whenever you can' },
      { text: 'Whenever.', expected: 'Whenever' },
      { text: 'As soon as you can.', expected: 'As soon as you can' },
      { text: 'No rush.', expected: 'No rush' },
    ];
    for (const { text, expected } of cases) {
      const intake: any = {};
      enrichIntakeFromTranscript(text, intake, 'ask_completion_time');
      expect(intake.desiredCompletionTime, `desiredCompletionTime for "${text}"`).to.equal(expected);
    }
  });

  it('normalizes vague callbacks to canonical Anytime while preserving specific ranges', () => {
    const cases = [
      { text: 'Anytime is fine.', expected: 'Anytime' },
      { text: 'Any time works.', expected: 'Anytime' },
      { text: 'Call me whenever is fine.', expected: 'Anytime' },
      { text: 'Anytime after 4.', expected: 'Anytime after 4' },
    ];
    for (const { text, expected } of cases) {
      const intake: any = {};
      enrichIntakeFromTranscript(text, intake, 'ask_callback_time');
      expect(intake.callbackTime, `callbackTime for "${text}"`).to.equal(expected);
    }
  });

  it('treats name and location refusals as satisfied for stage navigation', () => {
    const intake: any = {
      nameRefused: true,
      serviceRequested: 'water under sink',
      serviceAddress: 'Pittsburgh',
      desiredCompletionTime: 'Whenever you can',
      callbackTime: 'Anytime',
    };
    expect(resolveNextRequiredStage(intake, 'onsite')).to.equal('complete');
  });

  it('completes when a location is refused and service/timing/callback are present', () => {
    const intake: any = {
      nameRefused: true,
      serviceRequested: 'water under sink',
      locationRefused: true,
      desiredCompletionTime: 'Whenever you can',
      callbackTime: 'Anytime',
    };
    expect(resolveNextRequiredStage(intake, 'onsite')).to.equal('complete');
  });

  it('advances past name when only name is refused', () => {
    const intake: any = {
      nameRefused: true,
      serviceRequested: 'water under sink',
    };
    const next = resolveNextRequiredStage(intake, 'onsite');
    expect(next).to.equal('ask_location_or_context');
  });

  it('does not mark a normal full address as a refusal', () => {
    const text = '220 Oak Street';
    expect(isLocationRefusal(text)).to.be.false;
    const intake: any = {};
    enrichIntakeFromTranscript(text, intake, 'ask_location');
    expect(intake.serviceAddress).to.equal('220 Oak Street');
    expect(intake.locationRefused).to.be.undefined;
  });

  it('treats nameRefused as satisfying the name requirement', () => {
    expect(isNameRequirementSatisfied({ customerName: 'Evan Parker' })).to.be.true;
    expect(isNameRequirementSatisfied({ nameRefused: true })).to.be.true;
    expect(isNameRequirementSatisfied({})).to.be.false;
    expect(isNameRequirementSatisfied({ customerName: '' })).to.be.false;
  });

  it('routes to ask_request and a service-only prompt after name refusal', () => {
    const intake: any = {
      nameRefused: true,
    };
    const next = resolveNextSimpleModeStage(intake, 'onsite');
    expect(next).to.equal('ask_request');
    const promptKey = selectSimpleModePromptKey(next, intake, {});
    expect(promptKey).to.equal('ask_request');
    expect(promptKey).to.not.equal('ask_name');
    expect(promptKey).to.not.equal('ask_name_reason');
  });

  it('rejects "I\'d rather not give my name yet" and leaves customerName empty', () => {
    const text = "I'd rather not give my name yet";
    expect(isNameRefusal(text)).to.be.true;
    const intake: any = {};
    enrichIntakeFromTranscript(text, intake, 'ask_name');
    expect(intake.nameRefused).to.be.true;
    expect(intake.customerName).to.be.oneOf([undefined, null, '']);
  });

  it('advances normally after a name refusal plus a service request', () => {
    const intake: any = {
      nameRefused: true,
    };
    enrichIntakeFromTranscript('I need someone to look at a broken fence in my backyard.', intake, 'ask_request');
    expect(intake.customerName).to.be.oneOf([undefined, null, '']);
    expect(intake.nameRefused).to.be.true;
    expect(intake.serviceRequested).to.be.ok;
    const next = resolveNextSimpleModeStage(intake, 'onsite');
    expect(next).to.equal('ask_location');
  });

  it('reprompts request, not name, after name refusal followed by silence', () => {
    const intake: any = { nameRefused: true };
    const next = resolveNextSimpleModeStage(intake, 'onsite');
    expect(next).to.equal('ask_request');
    const promptKey = selectSimpleModePromptKey(next, intake, { needsServiceReprompt: true });
    expect(promptKey).to.equal('ask_request');
    expect(promptKey).to.not.equal('ask_name');
    expect(promptKey).to.not.equal('ask_name_reason');
  });
});
