import { expect } from 'chai';
import {
  isNameRequirementSatisfied,
  isValidCustomerName,
  mergeExtractedField,
  resolveNextRequiredStage,
  IntakeData
} from '../src/intake-validation';
import { enrichIntakeFromTranscript, isNameRefusal } from '../src/intake-skip-ahead';

describe('Refused name completion consistency', () => {
  it('1. explicit name refusal plus all other required fields results in complete name stage', () => {
    const intake: IntakeData = {
      nameRefused: true,
      serviceRequested: 'Fence repair',
      serviceAddress: 'Bethel Park',
      desiredCompletionTime: 'sometime this week',
      callbackTime: 'any time after five'
    };
    expect(isNameRequirementSatisfied(intake)).to.be.true;
    expect(resolveNextRequiredStage(intake, 'onsite')).to.equal('complete');
  });

  it('2. explicit name refusal plus captured fields keeps customerName empty and nameRefused true', () => {
    const intake: IntakeData = {
      nameRefused: true,
      serviceRequested: 'Broken fence request',
      serviceAddress: 'Bethel Park',
      desiredCompletionTime: 'sometime this week',
      callbackTime: 'any time after five'
    };
    expect(isNameRequirementSatisfied(intake)).to.be.true;
    expect(intake.customerName).to.be.undefined;
    expect(intake.nameRefused).to.be.true;
  });

  it('3. refusal followed by a location utterance populates location but not customerName', () => {
    const intake: IntakeData = { nameRefused: true };
    const result = enrichIntakeFromTranscript('in Bethel Park', intake, 'serviceAddress');
    expect(result.applied).to.include('serviceAddress');
    expect(intake.serviceAddress).to.equal('Bethel Park');
    expect(intake.customerName).to.be.undefined;
    expect(intake.nameRefused).to.be.true;
  });

  it('4. refusal followed by a callback timing utterance populates callback but not customerName', () => {
    const intake: IntakeData = { nameRefused: true };
    const result = enrichIntakeFromTranscript('any time after five', intake, 'callbackTime');
    expect(result.applied).to.include('callbackTime');
    expect(intake.callbackTime).to.exist;
    expect(intake.customerName).to.be.undefined;
    expect(intake.nameRefused).to.be.true;
  });

  it('5. refusal followed later by a real name populates customerName and clears nameRefused', () => {
    const intake: IntakeData = { nameRefused: true };
    const result = enrichIntakeFromTranscript('Actually, my name is Sarah Johnson', intake, 'customerName');
    expect(result.applied).to.include('customerName');
    expect(intake.customerName).to.equal('Sarah Johnson');
    expect(intake.nameRefused).to.be.false;
  });

  it('6. normal named caller remains satisfied', () => {
    const intake: IntakeData = { customerName: 'Christopher Miller' };
    expect(isNameRequirementSatisfied(intake)).to.be.true;
  });

  it('7. refusal plus missing service request marks request as missing, not name', () => {
    const intake: IntakeData = {
      nameRefused: true,
      serviceAddress: 'Bethel Park',
      desiredCompletionTime: 'sometime this week',
      callbackTime: 'any time after five'
    };
    expect(isNameRequirementSatisfied(intake)).to.be.true;
    expect(resolveNextRequiredStage(intake, 'onsite')).to.equal('ask_request');
  });

  it('8. no refusal and no name lists name as missing', () => {
    const intake: IntakeData = {
      serviceRequested: 'Fence repair',
      serviceAddress: 'Bethel Park',
      desiredCompletionTime: 'sometime this week',
      callbackTime: 'any time after five'
    };
    expect(isNameRequirementSatisfied(intake)).to.be.false;
    expect(resolveNextRequiredStage(intake, 'onsite')).to.equal('ask_name_reason');
  });

  it('9. mergeExtractedField blocks non-name values after refusal', () => {
    const intake: IntakeData = { nameRefused: true };
    expect(mergeExtractedField(intake, 'customerName', 'the broken fence', () => true, 'ask_request', 'the broken fence')).to.be.false;
    expect(intake.customerName).to.be.undefined;
    expect(intake.nameRefused).to.be.true;
  });

  it('10. mergeExtractedField allows an explicit real name after refusal and clears the flag', () => {
    const intake: IntakeData = { nameRefused: true };
    expect(mergeExtractedField(intake, 'customerName', 'Sarah Johnson', () => true, 'ask_request', 'my name is Sarah Johnson')).to.be.true;
    expect(intake.customerName).to.equal('Sarah Johnson');
    expect(intake.nameRefused).to.be.false;
  });

  it('11. contaminated location and timing values are never treated as valid customer names', () => {
    expect(isValidCustomerName('in Bethel Park')).to.be.false;
    expect(isValidCustomerName('at 220 Oak Street')).to.be.false;
    expect(isValidCustomerName('tomorrow afternoon')).to.be.false;
    expect(isValidCustomerName('any time after five')).to.be.false;
    expect(isValidCustomerName('the broken fence')).to.be.false;
  });

  it('12. name requirement needs a valid real name, not arbitrary non-empty text', () => {
    expect(isNameRequirementSatisfied({ customerName: 'in Bethel Park', nameRefused: false } as any)).to.be.false;
    expect(isNameRequirementSatisfied({ customerName: 'tomorrow afternoon', nameRefused: false } as any)).to.be.false;
    expect(isNameRequirementSatisfied({ customerName: 'Sarah Johnson' } as any)).to.be.true;
  });

  it('13. isNameRefusal recognizes exact and physical ASR refusal variants', () => {
    expect(isNameRefusal("I'd rather not give my name.")).to.be.true;
    expect(isNameRefusal("They'd rather not give my name.")).to.be.true;
    expect(isNameRefusal("I'd rather not give me name.")).to.be.true;
    expect(isNameRefusal("Rather not give my name.")).to.be.true;
    expect(isNameRefusal("I prefer not to say.")).to.be.true;
    expect(isNameRefusal("I don't want to provide my name.")).to.be.true;
    expect(isNameRefusal("Can we skip my name?")).to.be.true;
    expect(isNameRefusal("No name.")).to.be.true;
    expect(isNameRefusal("You don't need my name.")).to.be.true;
    expect(isNameRefusal("Sarah Johnson")).to.be.false;
    expect(isNameRefusal("Actually, my name is Sarah Johnson")).to.be.false;
    expect(isNameRefusal("I need a fence repaired")).to.be.false;
  });

  it('14. first-turn physical ASR refusal sets nameRefused, clears name, and advances to ask_request', () => {
    const intake: IntakeData = {};
    const result = enrichIntakeFromTranscript("They'd rather not give my name.", intake, 'ask_name_reason');
    expect(result.detected).to.include('nameRefused');
    expect(result.applied).to.include('nameRefused');
    expect(intake.nameRefused).to.be.true;
    expect(intake.customerName).to.be.oneOf([undefined, null, '']);
    expect(isNameRequirementSatisfied(intake)).to.be.true;
    expect(resolveNextRequiredStage(intake, 'onsite')).to.equal('ask_request');
  });

  it('15. first-turn exact refusal sets nameRefused, clears name, and advances to ask_request', () => {
    const intake: IntakeData = {};
    const result = enrichIntakeFromTranscript("I'd rather not give my name.", intake, 'ask_name_reason');
    expect(result.detected).to.include('nameRefused');
    expect(result.applied).to.include('nameRefused');
    expect(intake.nameRefused).to.be.true;
    expect(intake.customerName).to.be.oneOf([undefined, null, '']);
    expect(isNameRequirementSatisfied(intake)).to.be.true;
    expect(resolveNextRequiredStage(intake, 'onsite')).to.equal('ask_request');
  });

  it('16. normal real name is not falsely classified as a refusal', () => {
    const intake: IntakeData = {};
    const result = enrichIntakeFromTranscript('My name is Jason Williams.', intake, 'ask_name_reason');
    expect(result.detected).to.include('customerName');
    expect(intake.customerName).to.equal('Jason Williams');
    expect(intake.nameRefused).to.be.oneOf([undefined, null, false]);
  });
});
