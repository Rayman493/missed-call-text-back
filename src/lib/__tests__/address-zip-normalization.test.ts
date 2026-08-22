import { describe, it, expect } from 'vitest';
import { normalizeAddress } from '../ai-intake-formatter';

describe('ADDRESS/ZIP NORMALIZATION - Regression Tests', () => {
  describe('REAL PRODUCTION CASE', () => {
    it('must normalize Fifty five ten Mifflin Road, one five two oh seven to 5510 Mifflin Road, 15207', () => {
      const input = 'Fifty five ten Mifflin Road, one five two oh seven';
      const result = normalizeAddress(input);
      expect(result).toBe('5510 Mifflin Road, 15207');
    });
  });

  describe('STREET NUMBER NORMALIZATION', () => {
    it('should normalize twelve thirty four Main Street to 1234 Main Street', () => {
      const input = 'twelve thirty four Main Street';
      const result = normalizeAddress(input);
      expect(result).toBe('1234 Main Street');
    });

    it('should normalize one six three two South Pine Drive to 1632 South Pine Drive', () => {
      const input = 'one six three two South Pine Drive';
      const result = normalizeAddress(input);
      expect(result).toBe('1632 South Pine Drive');
    });

    it('should normalize fifty five ten Mifflin Road to 5510 Mifflin Road', () => {
      const input = 'fifty five ten Mifflin Road';
      const result = normalizeAddress(input);
      expect(result).toBe('5510 Mifflin Road');
    });

    it('should normalize five oh five Main Street to 505 Main Street', () => {
      const input = 'five oh five Main Street';
      const result = normalizeAddress(input);
      expect(result).toBe('505 Main Street');
    });

    it('should normalize one hundred Main Street to 100 Main Street', () => {
      const input = 'one hundred Main Street';
      const result = normalizeAddress(input);
      expect(result).toBe('100 Main Street');
    });

    it('should normalize one thousand two hundred Main Street to 1200 Main Street', () => {
      const input = 'one thousand two hundred Main Street';
      const result = normalizeAddress(input);
      expect(result).toBe('1200 Main Street');
    });

    it('should normalize twenty twenty Main Street to 2020 Main Street', () => {
      const input = 'twenty twenty Main Street';
      const result = normalizeAddress(input);
      expect(result).toBe('2020 Main Street');
    });
  });

  describe('ZIP NORMALIZATION', () => {
    it('should normalize one five two oh seven in address context', () => {
      const input = 'Main Street, one five two oh seven';
      const result = normalizeAddress(input);
      expect(result).toBe('Main Street, 15207');
    });

    it('should normalize one five two zero seven in address context', () => {
      const input = 'Main Street, one five two zero seven';
      const result = normalizeAddress(input);
      expect(result).toBe('Main Street, 15207');
    });

    it('should normalize nine oh two one oh in address context', () => {
      const input = 'Main Street, nine oh two one oh';
      const result = normalizeAddress(input);
      expect(result).toBe('Main Street, 90210');
    });

    it('should normalize one zero zero zero one in address context', () => {
      const input = 'Main Street, one zero zero zero one';
      const result = normalizeAddress(input);
      expect(result).toBe('Main Street, 10001');
    });

    it('should normalize one five two one seven in address context', () => {
      const input = 'Main Street, one five two one seven';
      const result = normalizeAddress(input);
      expect(result).toBe('Main Street, 15217');
    });

    it('should normalize three three three three three in address context', () => {
      const input = 'Main Street, three three three three three';
      const result = normalizeAddress(input);
      expect(result).toBe('Main Street, 33333');
    });
  });

  describe('CONTEXT-AWARE OH → ZERO', () => {
    it('should normalize five oh five Main Street to 505 Main Street', () => {
      const input = 'five oh five Main Street';
      const result = normalizeAddress(input);
      expect(result).toBe('505 Main Street');
    });

    it('should normalize twenty four oh five Main Street to 2405 Main Street', () => {
      const input = 'twenty four oh five Main Street';
      const result = normalizeAddress(input);
      expect(result).toBe('2405 Main Street');
    });

    it('should NOT convert Oh in Oh, I need a plumber', () => {
      const input = 'Oh, I need a plumber';
      const result = normalizeAddress(input);
      expect(result).not.toContain('0');
      expect(result).toBe('Oh, I need a plumber'); // Unchanged
    });

    it('should NOT convert oh in oh well', () => {
      const input = 'oh well';
      const result = normalizeAddress(input);
      expect(result).not.toContain('0');
      expect(result).toContain('Oh'); // Capitalized by safeTrimAndCapitalize
    });

    it('should NOT convert Ohio Street', () => {
      const input = 'Ohio Street';
      const result = normalizeAddress(input);
      expect(result).not.toContain('0');
      expect(result).toBe('Ohio Street'); // Unchanged
    });

    it('should NOT convert Ohara Road', () => {
      const input = 'Ohara Road';
      const result = normalizeAddress(input);
      expect(result).not.toContain('0');
      expect(result).toBe('Ohara Road'); // Unchanged
    });

    it('should NOT convert John O\'Hara Drive', () => {
      const input = "John O'Hara Drive";
      const result = normalizeAddress(input);
      expect(result).not.toContain('0');
      expect(result).toBe("John O'Hara Drive"); // Unchanged
    });

    it('should NOT convert The OH office', () => {
      const input = 'The OH office';
      const result = normalizeAddress(input);
      expect(result).not.toContain('0');
      expect(result).toBe('The OH office'); // Unchanged
    });
  });

  describe('ORDINAL STREET NAME PROTECTION', () => {
    it('should preserve Fifty Fifth Street', () => {
      const input = 'Fifty Fifth Street';
      const result = normalizeAddress(input);
      expect(result).toBe('Fifty Fifth Street');
    });

    it('should preserve Thirty-Second Street', () => {
      const input = 'Thirty-Second Street';
      const result = normalizeAddress(input);
      expect(result).toBe('Thirty-Second Street');
    });

    it('should preserve West Fifth Avenue', () => {
      const input = 'West Fifth Avenue';
      const result = normalizeAddress(input);
      expect(result).toBe('West Fifth Avenue');
    });

    it('should preserve First Street', () => {
      const input = 'First Street';
      const result = normalizeAddress(input);
      expect(result).toBe('First Street');
    });

    it('should preserve Second Avenue', () => {
      const input = 'Second Avenue';
      const result = normalizeAddress(input);
      expect(result).toBe('Second Avenue');
    });

    it('should preserve Third Street', () => {
      const input = 'Third Street';
      const result = normalizeAddress(input);
      expect(result).toBe('Third Street');
    });
  });

  describe('ROUTE/HIGHWAY PROTECTION', () => {
    it('should preserve Route Eight', () => {
      const input = 'Route Eight';
      const result = normalizeAddress(input);
      expect(result).toBe('Route Eight');
    });

    it('should preserve Route 8', () => {
      const input = 'Route 8';
      const result = normalizeAddress(input);
      expect(result).toBe('Route 8');
    });

    it('should preserve Route Sixty-Six', () => {
      const input = 'Route Sixty-Six';
      const result = normalizeAddress(input);
      expect(result).toBe('Route Sixty-Six');
    });

    it('should preserve Highway Twenty Two', () => {
      const input = 'Highway Twenty Two';
      const result = normalizeAddress(input);
      expect(result).toBe('Highway Twenty Two');
    });

    it('should preserve State Route Fifty One', () => {
      const input = 'State Route Fifty One';
      const result = normalizeAddress(input);
      expect(result).toBe('State Route Fifty One');
    });
  });

  describe('PROPER-NAME PROTECTION', () => {
    it('should preserve Oneida Street', () => {
      const input = 'Oneida Street';
      const result = normalizeAddress(input);
      expect(result).toBe('Oneida Street');
    });

    it('should preserve Four Seasons Drive', () => {
      const input = 'Four Seasons Drive';
      const result = normalizeAddress(input);
      expect(result).toBe('Four Seasons Drive');
    });

    it('should preserve Seven Springs Road', () => {
      const input = 'Seven Springs Road';
      const result = normalizeAddress(input);
      expect(result).toBe('Seven Springs Road');
    });

    it('should preserve Five Points Road', () => {
      const input = 'Five Points Road';
      const result = normalizeAddress(input);
      expect(result).toBe('Five Points Road');
    });
  });

  describe('AMBIGUOUS ADDRESS TESTS', () => {
    it('should preserve somewhere on Main Street', () => {
      const input = 'somewhere on Main Street';
      const result = normalizeAddress(input);
      expect(result).toContain('Somewhere'); // Capitalized by safeTrimAndCapitalize
      expect(result).toContain('Main Street');
    });

    it('should preserve near Route 8', () => {
      const input = 'near Route 8';
      const result = normalizeAddress(input);
      expect(result).toContain('Near'); // Capitalized by safeTrimAndCapitalize
      expect(result).toContain('Route 8');
    });

    it('should preserve around Fifth Avenue', () => {
      const input = 'around Fifth Avenue';
      const result = normalizeAddress(input);
      expect(result).toContain('Around'); // Capitalized by safeTrimAndCapitalize
      expect(result).toContain('Fifth Avenue');
    });

    it('should preserve the second house on the left', () => {
      const input = 'the second house on the left';
      const result = normalizeAddress(input);
      expect(result).toContain('second');
    });

    it('should preserve Main Street without inventing house number', () => {
      const input = 'Main Street';
      const result = normalizeAddress(input);
      expect(result).toBe('Main Street');
    });

    it('should preserve 15207 without inventing street name', () => {
      const input = '15207';
      const result = normalizeAddress(input);
      expect(result).toBe('15207');
    });
  });

  describe('UNIT/APARTMENT - LEFT UNCHANGED IN THIS PHASE', () => {
    it('should preserve Apartment Two', () => {
      const input = 'Apartment Two';
      const result = normalizeAddress(input);
      expect(result).toBe('Apartment Two');
    });

    it('should preserve Unit Four', () => {
      const input = 'Unit Four';
      const result = normalizeAddress(input);
      expect(result).toBe('Unit Four');
    });

    it('should preserve Suite One Hundred', () => {
      const input = 'Suite One Hundred';
      const result = normalizeAddress(input);
      expect(result).toBe('Suite One Hundred');
    });

    it('should preserve Apartment B', () => {
      const input = 'Apartment B';
      const result = normalizeAddress(input);
      expect(result).toBe('Apartment B');
    });

    it('should preserve Unit 2A', () => {
      const input = 'Unit 2A';
      const result = normalizeAddress(input);
      expect(result).toBe('Unit 2A');
    });
  });

  describe('EXISTING BEHAVIOR PRESERVATION', () => {
    it('should still normalize Sixteen thirty-two South Pines Drive to 1632 South Pines Drive', () => {
      const input = 'Sixteen thirty-two South Pines Drive';
      const result = normalizeAddress(input);
      expect(result).toBe('1632 South Pines Drive');
    });

    it('should still normalize one thousand six hundred thirty-two South Pine Drive to 1632 South Pine Drive', () => {
      const input = 'one thousand six hundred thirty-two South Pine Drive';
      const result = normalizeAddress(input);
      expect(result).toBe('1632 South Pine Drive');
    });

    it('should still normalize Sixteen hundred thirty-two South Pine Drive to 1632 South Pine Drive', () => {
      const input = 'Sixteen hundred thirty-two South Pine Drive';
      const result = normalizeAddress(input);
      expect(result).toBe('1632 South Pine Drive');
    });

    it('should still normalize One twenty-five Main Street to 125 Main Street', () => {
      const input = 'One twenty-five Main Street';
      const result = normalizeAddress(input);
      expect(result).toBe('125 Main Street');
    });

    it('should still normalize Five hundred Main Street to 500 Main Street', () => {
      const input = 'Five hundred Main Street';
      const result = normalizeAddress(input);
      expect(result).toBe('500 Main Street');
    });

    it('should still normalize Twenty-One Oak Avenue to 21 Oak Avenue', () => {
      const input = 'Twenty-One Oak Avenue';
      const result = normalizeAddress(input);
      expect(result).toBe('21 Oak Avenue');
    });

    it('should still normalize 16 32 South Pines Drive to 1632 South Pines Drive', () => {
      const input = '16 32 South Pines Drive';
      const result = normalizeAddress(input);
      expect(result).toBe('1632 South Pines Drive');
    });

    it('should still normalize 1 632 South Pine Drive to 1632 South Pine Drive', () => {
      const input = '1 632 South Pine Drive';
      const result = normalizeAddress(input);
      expect(result).toBe('1632 South Pine Drive');
    });
  });

  describe('NULL/EMPTY HANDLING', () => {
    it('should return Not collected for empty string', () => {
      const input = '';
      const result = normalizeAddress(input);
      expect(result).toBe('Not collected');
    });

    it('should return Not collected for null', () => {
      const input = null;
      const result = normalizeAddress(input);
      expect(result).toBe('Not collected');
    });

    it('should return Not collected for undefined', () => {
      const input = undefined;
      const result = normalizeAddress(input);
      expect(result).toBe('Not collected');
    });
  });

  describe('NORMALIZATION IDEMPOTENCE', () => {
    it('should be idempotent for 5510 Mifflin Road, 15207', () => {
      const input = '5510 Mifflin Road, 15207';
      const first = normalizeAddress(input);
      const second = normalizeAddress(first);
      expect(first).toBe(second);
    });

    it('should be idempotent for 1234 Main Street', () => {
      const input = '1234 Main Street';
      const first = normalizeAddress(input);
      const second = normalizeAddress(first);
      expect(first).toBe(second);
    });

    it('should be idempotent for 505 Main Street', () => {
      const input = '505 Main Street';
      const first = normalizeAddress(input);
      const second = normalizeAddress(first);
      expect(first).toBe(second);
    });

    it('should be idempotent for 1632 South Pine Drive', () => {
      const input = '1632 South Pine Drive';
      const first = normalizeAddress(input);
      const second = normalizeAddress(first);
      expect(first).toBe(second);
    });
  });

  describe('ZIP FALSE-POSITIVE PROTECTION', () => {
    it('should NOT create ZIP from five people', () => {
      const input = '123 Main Street, five people';
      const result = normalizeAddress(input);
      expect(result).not.toContain(', 5');
      expect(result).toContain('five people');
    });

    it('should NOT create ZIP from one two three', () => {
      const input = '123 Main Street, one two three';
      const result = normalizeAddress(input);
      expect(result).not.toContain(', 123');
      expect(result).toContain('one two three');
    });

    it('should NOT create ZIP from six tokens', () => {
      const input = '123 Main Street, one two three four five six';
      const result = normalizeAddress(input);
      expect(result).not.toContain(', 123456');
      expect(result).toContain('one two three four five six');
    });

    it('should NOT misclassify apartment text as ZIP', () => {
      const input = '123 Main Street, apartment one five two oh seven';
      const result = normalizeAddress(input);
      // This should NOT normalize to ZIP since "apartment" is not a ZIP context
      expect(result).toContain('apartment');
    });
  });
});