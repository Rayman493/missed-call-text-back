/**
 * Focused regression tests for Simple Mode semantic skip-ahead extraction.
 * Covers maximum skip-ahead, partial skip-ahead, anti-hallucination,
 * correction overwrite rules, callback extraction, and service cleanup.
 */

import { describe, it, expect } from 'vitest';
import { enrichIntakeFromTranscript } from '../src/intake-skip-ahead';
import type { IntakeData } from '../src/intake-skip-ahead';

describe('Semantic Skip-Ahead Extraction', () => {
  it('extracts all volunteered fields from a broad ask_name_reason answer (Christopher Miller)', () => {
    const intake: IntakeData = { stage: 'ask_name_reason' };
    const transcript = "Hi, my name is Christopher Miller. I need a new water heater installed at 85 Liberty Avenue. I'd like it done by next Friday, and you can call me back anytime after 4 p.m.";
    const result = enrichIntakeFromTranscript(transcript, intake, 'ask_name_reason', 'CA-test');

    expect(intake.customerName).to.equal('Christopher Miller');
    expect(intake.serviceRequested).to.equal('a new water heater installed');
    expect(intake.serviceAddress).to.equal('85 Liberty Avenue');
    expect(intake.desiredCompletionTime).to.equal('next Friday');
    expect(intake.callbackTime).to.equal('anytime after 4 pm');
    expect(result.applied).to.include.members(['customerName', 'serviceRequested', 'serviceAddress', 'desiredCompletionTime', 'callbackTime']);
  });

  it('performs partial skip-ahead and leaves timing/callback unset', () => {
    const intake: IntakeData = { stage: 'ask_name_reason' };
    const transcript = "I'm Sarah. I need a fence installed at 20 Main Street.";
    const result = enrichIntakeFromTranscript(transcript, intake, 'ask_name_reason', 'CA-test');

    expect(intake.customerName).to.equal('Sarah');
    expect(intake.serviceRequested).to.equal('a fence installed');
    expect(intake.serviceAddress).to.equal('20 Main Street');
    expect(intake.desiredCompletionTime).to.be.undefined;
    expect(intake.callbackTime).to.be.undefined;
    expect(result.applied).to.include.members(['customerName', 'serviceRequested', 'serviceAddress']);
    expect(result.applied).to.not.include.members(['desiredCompletionTime', 'callbackTime']);
  });

  it('preserves numbered multi-word, split-number, and unit street addresses', () => {
    const cases = [
      ['The address is 1632 South Pine Drive.', '1632 South Pine Drive'],
      ['The address is 2847 Maple Avenue.', '2847 Maple Avenue'],
      ['The address is 28 47 Maple Avenue.', '28 47 Maple Avenue'],
      ['The address is 12-14 North Main Street apartment 5B.', '12-14 North Main Street apartment 5B'],
      ['The address is 500 West 42nd Street.', '500 West 42nd Street'],
      ['The address is 123 Main Street, Pittsburgh, I want it done by Friday.', '123 Main Street, Pittsburgh'],
    ];

    for (const [transcript, expected] of cases) {
      const intake: IntakeData = { stage: 'ask_location' };
      enrichIntakeFromTranscript(transcript, intake, 'ask_location', 'CA-test');
      expect(intake.serviceAddress).to.equal(expected);
    }
  });

  it('does not invent a house number for a partial location', () => {
    const intake: IntakeData = { stage: 'ask_location' };
    enrichIntakeFromTranscript('The location is South Pine Drive.', intake, 'ask_location', 'CA-test');

    expect(intake.serviceAddress).to.equal('South Pine Drive');
  });

  it('preserves useful compound request context instead of a repeated fragment', () => {
    const intake: IntakeData = { stage: 'ask_request' };
    enrichIntakeFromTranscript(
      'A storm knocked a large tree onto the backyard fence and I need the tree removed from the fence and the fence repaired.',
      intake,
      'ask_request',
      'CA-test'
    );

    expect(intake.issueDescription).to.include('storm knocked a large tree onto the backyard fence');
    expect(intake.issueDescription).to.include('tree removed');
    expect(intake.issueDescription).to.not.equal('the fence and the fence repaired');
  });

  it('does not collapse useful faucet context to a one-word repair fragment', () => {
    const intake: IntakeData = { stage: 'ask_request' };
    enrichIntakeFromTranscript(
      'My kitchen faucet is leaking and dripping constantly from the handle and needs repaired.',
      intake,
      'ask_request',
      'CA-test'
    );

    expect(intake.issueDescription).to.include('dripping constantly from the handle');
    expect(intake.issueDescription?.toLowerCase()).to.not.equal('repaired');
  });

  it('does not hallucinate fields when they are absent', () => {
    const intake: IntakeData = { stage: 'ask_name_reason' };
    const transcript = "I'm David. My sink is leaking.";
    const result = enrichIntakeFromTranscript(transcript, intake, 'ask_name_reason', 'CA-test');

    expect(intake.customerName).to.equal('David');
    expect(intake.serviceRequested).to.exist;
    expect(intake.serviceAddress).to.be.undefined;
    expect(intake.desiredCompletionTime).to.be.undefined;
    expect(intake.callbackTime).to.be.undefined;
    expect(result.applied).to.include('customerName');
    expect(result.applied).to.not.include.members(['serviceAddress', 'desiredCompletionTime', 'callbackTime']);
  });

  it('does not overwrite an explicit later correction with early broad values', () => {
    const intake: IntakeData = { stage: 'ask_name_reason' };
    enrichIntakeFromTranscript(
      '85 Liberty Avenue, next Friday',
      intake,
      'ask_name_reason',
      'CA-test'
    );

    // Simulate a later explicit correction at ask_location / ask_completion_time
    intake.serviceAddress = '220 Oak Street';
    intake.desiredCompletionTime = 'Saturday';

    const result = enrichIntakeFromTranscript(
      'Actually, the address is 220 Oak Street and I need it done by Saturday',
      intake,
      'ask_location',
      'CA-test'
    );

    expect(intake.serviceAddress).to.equal('220 Oak Street');
    expect(intake.desiredCompletionTime).to.equal('Saturday');
    expect(result.skippedBecauseAlreadyPresent).to.include.members(['serviceAddress', 'desiredCompletionTime']);
  });

  it('extracts callback preference from a broad answer and skips the callback prompt', () => {
    const intake: IntakeData = { stage: 'ask_name_reason', customerName: 'Alex' };
    const transcript = 'I need my roof checked. Call me after 4 PM.';
    enrichIntakeFromTranscript(transcript, intake, 'ask_name_reason', 'CA-test');

    expect(intake.serviceRequested).to.equal('my roof checked');
    expect(intake.callbackTime).to.equal('after 4 pm');
    expect(intake.desiredCompletionTime).to.be.undefined;
  });

  it('keeps the canonical service request clean even when address/timing/callback are present', () => {
    const intake: IntakeData = { stage: 'ask_name_reason' };
    const transcript = "Hi, I'm Lisa. I need my gutters cleaned at 45 Maple Drive. I'd like it done by tomorrow, and you can call me back in the evening.";
    enrichIntakeFromTranscript(transcript, intake, 'ask_name_reason', 'CA-test');

    expect(intake.serviceRequested).to.equal('my gutters cleaned');
    expect(intake.serviceRequested).to.not.include('45 Maple Drive');
    expect(intake.serviceRequested).to.not.include('tomorrow');
    expect(intake.serviceRequested).to.not.include('evening');
    expect(intake.serviceAddress).to.equal('45 Maple Drive');
    expect(intake.desiredCompletionTime).to.equal('tomorrow');
    expect(intake.callbackTime).to.equal('in the evening');
  });

  it('does not treat incident-history timing as a scheduling preference', () => {
    const intake: IntakeData = { stage: 'ask_name_reason' };
    const transcript = "Yeah, this is James Wilson. I need someone to repair my garage door. One of the cables snapped this morning and now the door won't open";
    const result = enrichIntakeFromTranscript(transcript, intake, 'ask_name_reason', 'CA-test');

    expect(intake.desiredCompletionTime).to.be.undefined;
    expect(intake.callbackTime).to.be.undefined;
    expect(result.applied).to.not.include.members(['desiredCompletionTime', 'callbackTime']);
  });

  it('does not extract callback from issue-descriptive time phrases like at night', () => {
    const intake: IntakeData = { stage: 'ask_name_reason' };
    const transcript = "I'm Jane. My heating system makes a loud noise at night.";
    const result = enrichIntakeFromTranscript(transcript, intake, 'ask_name_reason', 'CA-test');

    expect(intake.callbackTime).to.be.undefined;
    expect(result.applied).to.not.include('callbackTime');
  });

  it('extracts early timing/location/callback after ask_name parser pre-fills name and service', () => {
    const intake: IntakeData = {
      stage: 'ask_name',
      customerName: 'Christopher Miller',
      serviceRequested: "a new water heater installed at 85 Liberty Avenue. I'd like it done by next Friday, and you can call me back anytime after 4 pm",
      request: "a new water heater installed at 85 Liberty Avenue. I'd like it done by next Friday, and you can call me back anytime after 4 pm",
    };
    const transcript = "Hi, my name is Christopher Miller. I need a new water heater installed at 85 Liberty Avenue. I'd like it done by next Friday, and you can call me back anytime after 4 p.m.";
    const result = enrichIntakeFromTranscript(transcript, intake, 'ask_name', 'CA-test');

    expect(intake.serviceAddress).to.equal('85 Liberty Avenue');
    expect(intake.desiredCompletionTime).to.equal('next Friday');
    expect(intake.callbackTime).to.equal('anytime after 4 pm');
    expect(result.applied).to.include.members(['serviceAddress', 'desiredCompletionTime', 'callbackTime']);
  });

  it('cleans a pre-filled polluted canonical service request using structural matches', () => {
    const intake: IntakeData = {
      stage: 'ask_name',
      customerName: 'Christopher Miller',
      serviceRequested: "a new water heater installed at 85 Liberty Avenue. I'd like it done by next Friday, and you can call me back anytime after 4 pm",
      request: "a new water heater installed at 85 Liberty Avenue. I'd like it done by next Friday, and you can call me back anytime after 4 pm",
    };
    const transcript = "Hi, my name is Christopher Miller. I need a new water heater installed at 85 Liberty Avenue. I'd like it done by next Friday, and you can call me back anytime after 4 p.m.";
    const result = enrichIntakeFromTranscript(transcript, intake, 'ask_name', 'CA-test');

    // Structural extraction should remove address/timing/callback from the canonical
    // service field while keeping the raw transcript in `request`.
    expect(intake.serviceRequested).to.equal('a new water heater installed');
    expect(intake.serviceRequested).to.not.include('85 Liberty Avenue');
    expect(intake.serviceRequested).to.not.include('next Friday');
    expect(intake.serviceRequested).to.not.include('call me back');
    expect(intake.request).to.include('85 Liberty Avenue');
    expect(result.applied).to.include('serviceRequested');
  });

  it('extracts natural relative timing from a service request (get my grass cut in the next two weeks or so)', () => {
    const intake: IntakeData = { stage: 'ask_name_reason' };
    const transcript = "Yeah, I'm just looking to get my grass cut in the next two weeks or so";
    const result = enrichIntakeFromTranscript(transcript, intake, 'ask_name_reason', 'CAe0d4832e09b97b81f46a74a344393f56');

    expect(intake.serviceRequested).to.exist;
    expect(intake.serviceRequested).to.not.include('two weeks');
    expect(intake.desiredCompletionTime).to.exist;
    expect(intake.desiredCompletionTime?.toLowerCase()).to.include('next two weeks');
    expect(result.applied).to.include('desiredCompletionTime');
  });

  it('extracts "within the next two weeks" for fence installation', () => {
    const intake: IntakeData = { stage: 'ask_name_reason' };
    const transcript = 'I need a fence installed within the next two weeks';
    const result = enrichIntakeFromTranscript(transcript, intake, 'ask_name_reason', 'CA-test');

    expect(intake.serviceRequested).to.include('fence installed');
    expect(intake.serviceRequested).to.not.include('within');
    expect(intake.desiredCompletionTime).to.exist;
    expect(intake.desiredCompletionTime?.toLowerCase()).to.include('within the next two weeks');
    expect(result.applied).to.include('desiredCompletionTime');
  });

  it('does not treat "My sink has been leaking for the last two weeks" as a completion preference', () => {
    const intake: IntakeData = { stage: 'ask_name_reason' };
    const transcript = 'My sink has been leaking for the last two weeks';
    const result = enrichIntakeFromTranscript(transcript, intake, 'ask_name_reason', 'CA-test');

    expect(intake.desiredCompletionTime).to.be.undefined;
    expect(result.applied).to.not.include('desiredCompletionTime');
  });

  it('does not treat "It broke yesterday afternoon" as a completion preference', () => {
    const intake: IntakeData = { stage: 'ask_name_reason' };
    const transcript = 'It broke yesterday afternoon';
    const result = enrichIntakeFromTranscript(transcript, intake, 'ask_name_reason', 'CA-test');

    expect(intake.desiredCompletionTime).to.be.undefined;
    expect(result.applied).to.not.include('desiredCompletionTime');
  });

  it('extracts "sometime this week" from a done preference', () => {
    const intake: IntakeData = { stage: 'ask_name_reason' };
    const transcript = "I'd like it done sometime this week";
    const result = enrichIntakeFromTranscript(transcript, intake, 'ask_name_reason', 'CA-test');

    expect(intake.desiredCompletionTime).to.exist;
    expect(intake.desiredCompletionTime?.toLowerCase()).to.include('this week');
    expect(intake.serviceRequested?.toLowerCase()).to.not.include('this week');
    expect(result.applied).to.include('desiredCompletionTime');
  });

  it('extracts all Jason Williams fields and disambiguates completion Friday from callback tomorrow morning', () => {
    const intake: IntakeData = { stage: 'ask_name_reason' };
    const transcript = "My name is Jason Williams. I need a toilet repaired at 100 Main Street. I'd like it done Friday and call me tomorrow morning.";
    const result = enrichIntakeFromTranscript(transcript, intake, 'ask_name_reason', 'CAc73fab4aaa525fadcddc4f7511befe77');

    expect(intake.customerName).to.equal('Jason Williams');
    expect(intake.serviceRequested).to.equal('a toilet repaired');
    expect(intake.serviceAddress).to.equal('100 Main Street');
    expect(intake.desiredCompletionTime).to.equal('Friday');
    expect(intake.callbackTime).to.equal('tomorrow morning');
    expect(result.applied).to.include.members(['customerName', 'serviceRequested', 'serviceAddress', 'desiredCompletionTime', 'callbackTime']);
  });

  it('treats "call me Friday morning" as callback only', () => {
    const intake: IntakeData = { stage: 'ask_callback_time' };
    const transcript = 'Call me Friday morning';
    const result = enrichIntakeFromTranscript(transcript, intake, 'ask_callback_time', 'CA-test');

    expect(intake.callbackTime).to.equal('Friday morning');
    expect(intake.desiredCompletionTime).to.be.undefined;
    expect(result.applied).to.include('callbackTime');
    expect(result.applied).to.not.include('desiredCompletionTime');
  });

  it('treats "I\'d like it done Friday morning" as completion only', () => {
    const intake: IntakeData = { stage: 'ask_completion_time' };
    const transcript = "I'd like it done Friday morning";
    const result = enrichIntakeFromTranscript(transcript, intake, 'ask_completion_time', 'CA-test');

    expect(intake.desiredCompletionTime).to.equal('Friday morning');
    expect(intake.callbackTime).to.be.undefined;
    expect(result.applied).to.include('desiredCompletionTime');
    expect(result.applied).to.not.include('callbackTime');
  });

  it('disambiguates completion next Tuesday from callback after 3', () => {
    const intake: IntakeData = { stage: 'ask_name_reason' };
    const transcript = 'I need it next Tuesday, and you can reach me after 3';
    const result = enrichIntakeFromTranscript(transcript, intake, 'ask_name_reason', 'CA-test');

    expect(intake.desiredCompletionTime).to.equal('next Tuesday');
    expect(intake.callbackTime).to.equal('after 3');
    expect(intake.serviceRequested?.toLowerCase()).to.include('need it');
    expect(result.applied).to.include.members(['desiredCompletionTime', 'callbackTime']);
  });

  it('extracts all volunteered fields for the Jason Williams direct skip-ahead', () => {
    const intake: IntakeData = { stage: 'ask_name_reason' };
    const transcript = "My name is Jason Williams. I need a toilet repaired at 100 Main Street. I'd like it done Friday and call me tomorrow morning.";
    const result = enrichIntakeFromTranscript(transcript, intake, 'ask_name_reason', 'CA-jason-williams');

    expect(intake.customerName).to.equal('Jason Williams');
    expect(intake.serviceRequested).to.equal('a toilet repaired');
    expect(intake.serviceAddress).to.equal('100 Main Street');
    expect(intake.desiredCompletionTime).to.equal('Friday');
    expect(intake.callbackTime).to.equal('tomorrow morning');
    expect(result.applied).to.include.members(['customerName', 'serviceRequested', 'serviceAddress', 'desiredCompletionTime', 'callbackTime']);
  });

  // ---------------------------------------------------------------------------
  // Bug 1 regression — address preservation
  // ---------------------------------------------------------------------------

  it('preserves full street address with "in <city>" suffix (Bug 1)', () => {
    const intake: IntakeData = { stage: 'ask_location' };
    const transcript = '742 Maple Avenue in Pittsburgh';
    enrichIntakeFromTranscript(transcript, intake, 'ask_location', 'CA-test');

    expect(intake.serviceAddress).to.equal('742 Maple Avenue in Pittsburgh');
  });

  it('preserves another full street address with "in <city>" suffix (Bug 1)', () => {
    const intake: IntakeData = { stage: 'ask_location' };
    const transcript = '1287 Meadowbrook Drive in Pittsburgh';
    enrichIntakeFromTranscript(transcript, intake, 'ask_location', 'CA-test');

    expect(intake.serviceAddress).to.equal('1287 Meadowbrook Drive in Pittsburgh');
  });

  it('preserves full street address with city and state (Bug 1)', () => {
    const intake: IntakeData = { stage: 'ask_location' };
    const transcript = '742 Maple Avenue, Pittsburgh, Pennsylvania';
    enrichIntakeFromTranscript(transcript, intake, 'ask_location', 'CA-test');

    expect(intake.serviceAddress).to.equal('742 Maple Avenue, Pittsburgh, Pennsylvania');
  });

  it('stops address extraction at the semantic boundary and does not absorb timing (Bug 1)', () => {
    const intake: IntakeData = { stage: 'ask_location' };
    const transcript = '742 Maple Avenue in Pittsburgh and sometime this week';
    const result = enrichIntakeFromTranscript(transcript, intake, 'ask_location', 'CA-test');

    expect(intake.serviceAddress).to.equal('742 Maple Avenue in Pittsburgh');
    // The address must NOT greedily consume the timing text. Extraction of the
    // timing itself is stage-gated, so at ask_location it is not expected.
    expect(intake.serviceAddress).to.not.include('sometime this week');
    expect(result.applied).to.include('serviceAddress');
  });

  it('correction: newest corrected address wins (Bug 1)', () => {
    const intake: IntakeData = { stage: 'ask_location', serviceAddress: '742 Maple Avenue in Pittsburgh' };
    const transcript = 'actually 918 Walnut Street in Pittsburgh';
    const result = enrichIntakeFromTranscript(transcript, intake, 'ask_location', 'CA-test');

    expect(intake.serviceAddress).to.equal('918 Walnut Street in Pittsburgh');
    expect(result.applied).to.include('serviceAddress');
  });

  // ---------------------------------------------------------------------------
  // Bug 2 regression — details extraction from request sentence
  // ---------------------------------------------------------------------------

  it('splits spatial detail into issueDescription and keeps service request clean (Bug 2)', () => {
    const intake: IntakeData = { stage: 'ask_name_reason' };
    const transcript = 'My kitchen sink is leaking underneath the cabinet';
    enrichIntakeFromTranscript(transcript, intake, 'ask_name_reason', 'CA-test');

    expect(intake.serviceRequested).to.equal('My kitchen sink is leaking');
    expect(intake.issueDescription).to.equal('underneath the cabinet');
  });

  it('captures positional detail behind a fixture (Bug 2)', () => {
    const intake: IntakeData = { stage: 'ask_name_reason' };
    const transcript = 'There is water dripping behind the toilet';
    enrichIntakeFromTranscript(transcript, intake, 'ask_name_reason', 'CA-test');

    expect(intake.issueDescription).to.equal('behind the toilet');
  });

  it('captures positional detail next to a fixture (Bug 2)', () => {
    const intake: IntakeData = { stage: 'ask_name_reason' };
    const transcript = 'The drywall is cracked next to the window';
    enrichIntakeFromTranscript(transcript, intake, 'ask_name_reason', 'CA-test');

    expect(intake.issueDescription).to.equal('next to the window');
  });

  it('does not turn a location of service into an issueDescription (Bug 2 negative)', () => {
    const intake: IntakeData = { stage: 'ask_name_reason' };
    const transcript = 'I need a plumber in the kitchen';
    enrichIntakeFromTranscript(transcript, intake, 'ask_name_reason', 'CA-test');

    expect(intake.serviceRequested).to.equal('a plumber in the kitchen');
    expect(intake.issueDescription).to.be.oneOf([undefined, '']);
  });

  it('does not turn a general location into an issueDescription (Bug 2 negative)', () => {
    const intake: IntakeData = { stage: 'ask_name_reason' };
    const transcript = 'I need someone at the house tomorrow';
    enrichIntakeFromTranscript(transcript, intake, 'ask_name_reason', 'CA-test');

    expect(intake.serviceRequested).to.not.be.empty;
    // "at the house" is a service/location context, not a problem detail
    expect(intake.issueDescription).to.not.equal('at the house');
  });

  it('does not turn a city/address into an issueDescription (Bug 2 negative)', () => {
    const intake: IntakeData = { stage: 'ask_name_reason' };
    const transcript = 'I need my sink fixed in Pittsburgh';
    enrichIntakeFromTranscript(transcript, intake, 'ask_name_reason', 'CA-test');

    expect(intake.serviceRequested).to.not.be.empty;
    expect(intake.issueDescription).to.not.equal('in Pittsburgh');
  });

  it('keeps "in the living room" as service context, not a manufactured issueDescription (Bug 2 boundary)', () => {
    const intake: IntakeData = { stage: 'ask_name_reason' };
    const transcript = 'I need painting done in the living room';
    enrichIntakeFromTranscript(transcript, intake, 'ask_name_reason', 'CA-test');

    // The room is where the service is needed, not a problem detail.
    // It should stay part of the request and not become an issueDescription.
    expect(intake.serviceRequested).to.include('in the living room');
    expect(intake.issueDescription).to.be.oneOf([undefined, '']);
  });
});
