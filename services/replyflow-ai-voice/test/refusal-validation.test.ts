const { expect } = require('chai');
const {
  isValidServiceRequest,
  isValidCompletionTime,
  isValidCallbackTime,
  isValidServiceAddress
} = require('../src/intake-validation');

describe('Refusal / non-answer validation', () => {
  describe('isValidServiceRequest', () => {
    it('accepts real service requests', () => {
      expect(isValidServiceRequest('I need a plumber')).to.be.true;
      expect(isValidServiceRequest('My fence gate is broken')).to.be.true;
    });

    it('rejects refusals and unusable answers', () => {
      expect(isValidServiceRequest("I'd rather not say")).to.be.false;
      expect(isValidServiceRequest('I would rather not give details')).to.be.false;
      expect(isValidServiceRequest('I don\'t want to answer')).to.be.false;
      expect(isValidServiceRequest('I don\'t know')).to.be.false;
      expect(isValidServiceRequest('not sure')).to.be.false;
      expect(isValidServiceRequest('um')).to.be.false;
    });
  });

  describe('isValidCompletionTime', () => {
    it('accepts real timing expressions including vague ones', () => {
      expect(isValidCompletionTime('Tomorrow')).to.be.true;
      expect(isValidCompletionTime('Whenever')).to.be.true;
      expect(isValidCompletionTime('As soon as possible')).to.be.true;
      expect(isValidCompletionTime('Sometime next week')).to.be.true;
    });

    it('rejects refusals and unusable answers', () => {
      expect(isValidCompletionTime("I'd rather not say")).to.be.false;
      expect(isValidCompletionTime('I would rather not give that')).to.be.false;
      expect(isValidCompletionTime('I don\'t know')).to.be.false;
      expect(isValidCompletionTime('not sure')).to.be.false;
      expect(isValidCompletionTime('um')).to.be.false;
    });
  });

  describe('isValidCallbackTime', () => {
    it('accepts real callback preferences including vague ones', () => {
      expect(isValidCallbackTime('Anytime')).to.be.true;
      expect(isValidCallbackTime('Afternoons')).to.be.true;
      expect(isValidCallbackTime('After five')).to.be.true;
    });

    it('rejects refusals and unusable answers', () => {
      expect(isValidCallbackTime("I'd rather not say")).to.be.false;
      expect(isValidCallbackTime('I would rather not give that')).to.be.false;
      expect(isValidCallbackTime('I don\'t know')).to.be.false;
      expect(isValidCallbackTime('not sure')).to.be.false;
      expect(isValidCallbackTime('um')).to.be.false;
    });
  });

  describe('isValidServiceAddress', () => {
    it('accepts real addresses', () => {
      expect(isValidServiceAddress('123 Main Street')).to.be.true;
      expect(isValidServiceAddress('5128 Walnut Street, Pittsburgh')).to.be.true;
    });

    it('rejects refusals and non-answers', () => {
      expect(isValidServiceAddress("I'd rather not give my address")).to.be.false;
      expect(isValidServiceAddress('I don\'t know')).to.be.false;
      expect(isValidServiceAddress('not sure')).to.be.false;
    });
  });
});
