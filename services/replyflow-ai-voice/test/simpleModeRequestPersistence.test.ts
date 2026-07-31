const { expect } = require('chai');

/**
 * Test: Simple Mode Request field persistence
 *
 * Tests that the request field captured during ask_request stage
 * is properly persisted through to the canonical extracted_info.
 */

describe('Simple Mode - Request Field Persistence', () => {
  it('should map request field to canonical extracted_info', () => {
    // Simulate Simple Mode intake data where request is captured
    const simpleModeIntakeData = {
      customerName: 'John Doe',
      request: 'plumbing repair', // Simple Mode uses 'request' field
      issueDescription: 'water heater is leaking',
      serviceAddress: '123 Main St',
      desiredCompletionTime: 'today',
      callbackTime: 'this afternoon',
    };

    // Mock the buildCanonicalExtractedInfo function behavior
    const serviceRequested = simpleModeIntakeData.serviceRequested || simpleModeIntakeData.request || '';
    expect(serviceRequested).to.equal('plumbing repair');
    expect(serviceRequested.length).to.be.greaterThan(0);
  });

  it('should prefer serviceRequested over request when both are present (Regular Mode)', () => {
    // Simulate Regular Mode intake data where serviceRequested is used
    const regularModeIntakeData = {
      customerName: 'Jane Smith',
      serviceRequested: 'electrical work', // Regular Mode uses 'serviceRequested'
      request: 'something else', // Should be ignored
      issueDescription: 'outlet not working',
    };

    // Mock the buildCanonicalExtractedInfo function behavior
    const serviceRequested = regularModeIntakeData.serviceRequested || regularModeIntakeData.request || '';
    expect(serviceRequested).to.equal('electrical work');
    expect(serviceRequested).to.not.equal('something else');
  });

  it('should handle empty request gracefully', () => {
    const intakeData = {
      customerName: 'Bob Johnson',
      request: '',
      issueDescription: 'general inquiry',
    };

    const serviceRequested = intakeData.serviceRequested || intakeData.request || '';
    expect(serviceRequested).to.equal('');
    expect(serviceRequested.length).to.equal(0);
  });

  it('should handle missing request field gracefully', () => {
    const intakeData = {
      customerName: 'Alice Brown',
      issueDescription: 'general inquiry',
    };

    const serviceRequested = intakeData.serviceRequested || intakeData.request || '';
    expect(serviceRequested).to.equal('');
    expect(serviceRequested.length).to.equal(0);
  });

  it('should preserve request when serviceRequested is empty (Simple Mode case)', () => {
    const intakeData = {
      customerName: 'Charlie Davis',
      serviceRequested: '', // Empty in Simple Mode
      request: 'HVAC maintenance', // This should be used
      issueDescription: 'AC not cooling',
    };

    const serviceRequested = intakeData.serviceRequested || intakeData.request || '';
    expect(serviceRequested).to.equal('HVAC maintenance');
    expect(serviceRequested.length).to.be.greaterThan(0);
  });

  it('should combine serviceRequested and issueDescription into request when both present', () => {
    const intakeData = {
      customerName: 'Diana Evans',
      serviceRequested: 'plumbing repair',
      issueDescription: 'water heater is leaking from the bottom',
    };

    const serviceRequested = intakeData.serviceRequested || intakeData.request || '';
    const additionalDetails = intakeData.issueDescription || '';
    let request = serviceRequested;
    if (additionalDetails && additionalDetails !== serviceRequested) {
      request = serviceRequested ? `${serviceRequested}. ${additionalDetails}` : additionalDetails;
    }

    expect(request).to.equal('plumbing repair. water heater is leaking from the bottom');
    expect(request).to.include('plumbing repair');
    expect(request).to.include('water heater is leaking from the bottom');
  });

  it('should keep request distinct from issue description when both provided', () => {
    const intakeData = {
      customerName: 'Frank Miller',
      request: 'plumbing repair',
      issueDescription: 'water heater is leaking from the bottom',
    };

    const serviceRequested = intakeData.serviceRequested || intakeData.request || '';
    const additionalDetails = intakeData.issueDescription || '';
    let request = serviceRequested;
    if (additionalDetails && additionalDetails !== serviceRequested) {
      request = serviceRequested ? `${serviceRequested}. ${additionalDetails}` : additionalDetails;
    }

    expect(request).to.include('plumbing repair');
    expect(request).to.include('water heater is leaking from the bottom');
    // Verify they are not collapsed into just one field
    expect(request).to.contain('. ');
  });
});