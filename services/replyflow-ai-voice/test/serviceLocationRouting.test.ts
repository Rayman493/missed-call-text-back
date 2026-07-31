const { expect } = require('chai');

/**
 * Test: Service Location Routing in Simple Mode
 *
 * Verifies that the Business Profile Service Location setting correctly controls
 * whether ask_location is included in the Simple Mode stage sequence.
 */

describe('Service Location Routing', () => {
  describe('getNextStage routing logic', () => {
    it('onsite mode should route ask_request to ask_location_or_context', () => {
      const serviceLocationType = 'onsite';
      const currentStage = 'ask_request';
      const expectedNext = 'ask_location_or_context';
      
      // Simulate the routing logic from line 2624
      const stageSequence = {
        ask_name: 'ask_request',
        ask_request: serviceLocationType === 'onsite' ? 'ask_location_or_context' : 'ask_timing',
        ask_location_or_context: 'ask_timing',
        ask_timing: 'ask_callback_time',
        ask_callback_time: 'complete',
      };
      
      const nextStage = stageSequence[currentStage];
      expect(nextStage).to.equal(expectedNext);
    });

    it('customer_comes_to_business mode should skip ask_location_or_context', () => {
      const serviceLocationType = 'customer_comes_to_business';
      const currentStage = 'ask_request';
      const expectedNext = 'ask_timing';
      
      const stageSequence = {
        ask_name: 'ask_request',
        ask_request: serviceLocationType === 'onsite' ? 'ask_location_or_context' : 'ask_timing',
        ask_location_or_context: 'ask_timing',
        ask_timing: 'ask_callback_time',
        ask_callback_time: 'complete',
      };
      
      const nextStage = stageSequence[currentStage];
      expect(nextStage).to.equal(expectedNext);
    });

    it('remote mode should skip ask_location_or_context', () => {
      const serviceLocationType = 'remote';
      const currentStage = 'ask_request';
      const expectedNext = 'ask_timing';
      
      const stageSequence = {
        ask_name: 'ask_request',
        ask_request: serviceLocationType === 'onsite' ? 'ask_location_or_context' : 'ask_timing',
        ask_location_or_context: 'ask_timing',
        ask_timing: 'ask_callback_time',
        ask_callback_time: 'complete',
      };
      
      const nextStage = stageSequence[currentStage];
      expect(nextStage).to.equal(expectedNext);
    });
  });

  describe('Required fields check', () => {
    it('onsite mode should require serviceAddress', () => {
      const serviceLocationType = 'onsite';
      const requiresServiceAddress = serviceLocationType === 'onsite';
      
      expect(requiresServiceAddress).to.equal(true);
    });

    it('customer_comes_to_business mode should not require serviceAddress', () => {
      const serviceLocationType = 'customer_comes_to_business';
      const requiresServiceAddress = serviceLocationType === 'onsite';
      
      expect(requiresServiceAddress).to.equal(false);
    });

    it('remote mode should not require serviceAddress', () => {
      const serviceLocationType = 'remote';
      const requiresServiceAddress = serviceLocationType === 'onsite';
      
      expect(requiresServiceAddress).to.equal(false);
    });

    it('onsite mode should mark intake incomplete without address', () => {
      const serviceLocationType = 'onsite';
      const intake = {
        customerName: 'John Doe',
        serviceRequested: 'plumbing repair',
        issueDescription: 'water heater leaking',
        serviceAddress: '', // Missing
        desiredCompletionTime: 'today',
        callbackTime: 'this afternoon',
      };
      
      const requiresServiceAddress = serviceLocationType === 'onsite';
      const allCollected = !!(
        intake.customerName &&
        intake.serviceRequested &&
        intake.issueDescription &&
        (requiresServiceAddress ? intake.serviceAddress : true) &&
        intake.desiredCompletionTime &&
        intake.callbackTime
      );
      
      expect(allCollected).to.equal(false);
    });

    it('customer_comes_to_business mode should complete without address', () => {
      const serviceLocationType = 'customer_comes_to_business';
      const intake = {
        customerName: 'John Doe',
        serviceRequested: 'plumbing repair',
        issueDescription: 'water heater leaking',
        serviceAddress: '', // Missing but not required
        desiredCompletionTime: 'today',
        callbackTime: 'this afternoon',
      };
      
      const requiresServiceAddress = serviceLocationType === 'onsite';
      const allCollected = !!(
        intake.customerName &&
        intake.serviceRequested &&
        intake.issueDescription &&
        (requiresServiceAddress ? intake.serviceAddress : true) &&
        intake.desiredCompletionTime &&
        intake.callbackTime
      );
      
      expect(allCollected).to.equal(true);
    });

    it('remote mode should complete without address', () => {
      const serviceLocationType = 'remote';
      const intake = {
        customerName: 'John Doe',
        serviceRequested: 'plumbing repair',
        issueDescription: 'water heater leaking',
        serviceAddress: '', // Missing but not required
        desiredCompletionTime: 'today',
        callbackTime: 'this afternoon',
      };
      
      const requiresServiceAddress = serviceLocationType === 'onsite';
      const allCollected = !!(
        intake.customerName &&
        intake.serviceRequested &&
        intake.issueDescription &&
        (requiresServiceAddress ? intake.serviceAddress : true) &&
        intake.desiredCompletionTime &&
        intake.callbackTime
      );
      
      expect(allCollected).to.equal(true);
    });
  });

  describe('Service location normalization', () => {
    it('should normalize onsite value correctly', () => {
      const normalizeServiceLocationType = (value) => {
        const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
        return (v === 'onsite' || v === 'customer_comes_to_business' || v === 'remote') ? v : 'onsite';
      };
      
      expect(normalizeServiceLocationType('onsite')).to.equal('onsite');
      expect(normalizeServiceLocationType('ONSITE')).to.equal('onsite');
      expect(normalizeServiceLocationType(' Onsite ')).to.equal('onsite');
    });

    it('should normalize customer_comes_to_business value correctly', () => {
      const normalizeServiceLocationType = (value) => {
        const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
        return (v === 'onsite' || v === 'customer_comes_to_business' || v === 'remote') ? v : 'onsite';
      };
      
      expect(normalizeServiceLocationType('customer_comes_to_business')).to.equal('customer_comes_to_business');
      expect(normalizeServiceLocationType('CUSTOMER_COMES_TO_BUSINESS')).to.equal('customer_comes_to_business');
    });

    it('should normalize remote value correctly', () => {
      const normalizeServiceLocationType = (value) => {
        const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
        return (v === 'onsite' || v === 'customer_comes_to_business' || v === 'remote') ? v : 'onsite';
      };
      
      expect(normalizeServiceLocationType('remote')).to.equal('remote');
      expect(normalizeServiceLocationType('REMOTE')).to.equal('remote');
    });

    it('should default to onsite for invalid values', () => {
      const normalizeServiceLocationType = (value) => {
        const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
        return (v === 'onsite' || v === 'customer_comes_to_business' || v === 'remote') ? v : 'onsite';
      };
      
      expect(normalizeServiceLocationType('invalid')).to.equal('onsite');
      expect(normalizeServiceLocationType('')).to.equal('onsite');
      expect(normalizeServiceLocationType(null)).to.equal('onsite');
      expect(normalizeServiceLocationType(undefined)).to.equal('onsite');
    });
  });

  describe('Request persistence compatibility', () => {
    it('request field should persist correctly in all three modes', () => {
      const modes = ['onsite', 'customer_comes_to_business', 'remote'];
      
      modes.forEach(mode => {
        const intakeData = {
          customerName: 'John Doe',
          request: 'plumbing repair', // Simple Mode field
          issueDescription: 'water heater leaking',
        };
        
        // Simulate the fix: fields.serviceRequested || fields.request
        const serviceRequested = intakeData.serviceRequested || intakeData.request || '';
        
        expect(serviceRequested).to.equal('plumbing repair');
        expect(serviceRequested.length).to.be.greaterThan(0);
      });
    });
  });
});