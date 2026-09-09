const { expect } = require('chai');

// NOTE: requiring ../src/index bootstraps the service. Use PORT=0 to avoid collisions.
const { buildCanonicalExtractedInfo } = require('../src/index');

describe('buildCanonicalExtractedInfo correction precedence', () => {
  it('trusts explicit corrected service over raw request transcript', async () => {
    const fields = {
      customerName: 'Jason Williams',
      serviceRequested: 'shower repair',
      issueDescription: 'it\'s the shower, not the toilet',
      serviceAddress: '220 Oak Street',
      desiredCompletionTime: 'Saturday',
      callbackTime: 'tomorrow afternoon',
    };

    const result = await buildCanonicalExtractedInfo(
      fields,
      '+15551234567',
      'onsite',
      'CA0a5f7d31b1e2b7eae5b29181774a94b1',
      'I need a toilet repaired' // original raw request that must not win
    );

    expect(result.serviceRequested).to.equal('shower repair');
    expect(result.importantDetails).to.equal('it\'s the shower, not the toilet');
    expect(result.additionalDetails).to.equal('it\'s the shower, not the toilet');
    expect(result.serviceAddress).to.equal('220 Oak Street');
    expect(result.desiredCompletionTime).to.equal('Saturday');
    expect(result.callbackTime).to.equal('tomorrow afternoon');
  });

  it('uses partial toilet state when no correction has occurred', async () => {
    const fields = {
      customerName: 'Jason Williams',
      serviceRequested: 'toilet repair',
      issueDescription: '',
      serviceAddress: '100 Main Street',
      desiredCompletionTime: 'Friday',
      callbackTime: 'tomorrow morning',
    };

    const result = await buildCanonicalExtractedInfo(
      fields,
      '+15551234567',
      'onsite',
      'CA_partial',
      'I need a toilet repaired'
    );

    expect(result.serviceRequested).to.equal('toilet repair');
    expect(result.serviceAddress).to.equal('100 Main Street');
  });

  it('does not call the model when explicit service and details are absent', async () => {
    const fields = {
      customerName: '',
      serviceRequested: '',
      issueDescription: '',
      serviceAddress: '',
      desiredCompletionTime: '',
      callbackTime: '',
    };

    const result = await buildCanonicalExtractedInfo(
      fields,
      '+15551234567',
      'onsite',
      'CA_empty'
    );

    expect(result.serviceRequested).to.equal('');
    expect(result.importantDetails).to.equal('');
  });
});
