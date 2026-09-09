const { expect } = require('chai');

process.env.PORT = process.env.PORT || '0';

// Use the compiled dist to avoid ts-node extension-resolution issues when
// importing the full service entrypoint.
const { enrichIntakeFromTranscript } = require('../dist/intake-skip-ahead');
const { buildCanonicalExtractedInfo } = require('../dist/index');

describe('enrichIntakeFromTranscript name field ownership', () => {
  it('does not contaminate serviceAddress or serviceRequested for bare "Evan Parker"', () => {
    const intake = { customerName: 'Evan Parker' };
    enrichIntakeFromTranscript('Evan Parker', intake, 'ask_name');
    expect(intake.customerName).to.equal('Evan Parker');
    expect(intake.serviceRequested).to.be.oneOf([undefined, null, '']);
    expect(intake.request).to.be.oneOf([undefined, null, '']);
    expect(intake.serviceAddress).to.be.oneOf([undefined, null, '']);
    expect(intake.issueDescription).to.be.oneOf([undefined, null, '']);
    expect(intake.desiredCompletionTime).to.be.oneOf([undefined, null, '']);
    expect(intake.callbackTime).to.be.oneOf([undefined, null, '']);
  });

  it('does not contaminate fields for bare "Kevin Parker"', () => {
    const intake = { customerName: 'Kevin Parker' };
    enrichIntakeFromTranscript('Kevin Parker', intake, 'ask_name');
    expect(intake.customerName).to.equal('Kevin Parker');
    expect(intake.serviceRequested).to.be.oneOf([undefined, null, '']);
    expect(intake.serviceAddress).to.be.oneOf([undefined, null, '']);
  });

  it('does not contaminate fields for bare "Sarah Johnson"', () => {
    const intake = { customerName: 'Sarah Johnson' };
    enrichIntakeFromTranscript('Sarah Johnson', intake, 'ask_name');
    expect(intake.customerName).to.equal('Sarah Johnson');
    expect(intake.serviceRequested).to.be.oneOf([undefined, null, '']);
    expect(intake.serviceAddress).to.be.oneOf([undefined, null, '']);
  });

  it('does not contaminate fields for "My name is Kevin Parker"', () => {
    const intake = { customerName: 'Kevin Parker' };
    enrichIntakeFromTranscript('My name is Kevin Parker', intake, 'ask_name');
    expect(intake.customerName).to.equal('Kevin Parker');
    expect(intake.serviceRequested).to.be.oneOf([undefined, null, '']);
    expect(intake.serviceAddress).to.be.oneOf([undefined, null, '']);
  });

  it('still extracts multiple fields from a full skip-ahead utterance', () => {
    const intake = { customerName: 'Kevin Parker' };
    enrichIntakeFromTranscript('My name is Kevin Parker and I need a plumber at 100 Main Street', intake, 'ask_name');
    expect(intake.customerName).to.equal('Kevin Parker');
    expect(intake.serviceAddress).to.equal('100 Main Street');
    expect(intake.serviceRequested).to.not.equal('');
  });

  it('still extracts a standalone Pittsburgh area location at ask_location', () => {
    const intake = {};
    enrichIntakeFromTranscript('Pittsburgh', intake, 'ask_location');
    expect(intake.serviceAddress).to.equal('Pittsburgh');
  });
});

describe('buildCanonicalExtractedInfo name contamination guard', () => {
  it('clears serviceAddress when it matches customerName', async () => {
    const result = await buildCanonicalExtractedInfo(
      { customerName: 'Evan Parker', serviceAddress: 'Evan Parker' },
      '+15551234567',
      'onsite',
      'CAtest'
    );
    expect(result.customerName).to.equal('Evan Parker');
    expect(result.serviceAddress).to.equal('');
    expect(result.serviceRequested).to.equal('');
  });

  it('does not derive serviceRequested from a name-only raw request transcript', async () => {
    const result = await buildCanonicalExtractedInfo(
      { customerName: 'Evan Parker' },
      '+15551234567',
      'onsite',
      'CAtest',
      'Evan Parker'
    );
    expect(result.serviceRequested).to.equal('');
    expect(result.importantDetails).to.equal('');
  });

  it('preserves only proven fields for a partial intake with a name only', async () => {
    const result = await buildCanonicalExtractedInfo(
      { customerName: 'Kevin Parker' },
      '+15551234567',
      'onsite',
      'CAtest'
    );
    expect(result.customerName).to.equal('Kevin Parker');
    expect(result.serviceRequested).to.equal('');
    expect(result.importantDetails).to.equal('');
    expect(result.additionalDetails).to.equal('');
    expect(result.serviceAddress).to.equal('');
    expect(result.desiredCompletionTime).to.equal('');
    expect(result.callbackTime).to.equal('');
  });

  it('preserves full skip-ahead fields when they are genuinely present', async () => {
    const result = await buildCanonicalExtractedInfo(
      {
        customerName: 'Kevin Parker',
        serviceRequested: 'a plumber',
        serviceAddress: '100 Main Street',
      },
      '+15551234567',
      'onsite',
      'CAtest'
    );
    expect(result.customerName).to.equal('Kevin Parker');
    expect(result.serviceRequested).to.not.equal('');
    expect(result.serviceAddress).to.equal('100 Main Street');
  });
});
