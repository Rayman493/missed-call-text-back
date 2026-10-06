/**
 * Spoken street-number normalization — the "65 1-0 Johnson Road" defect.
 * Deterministic collapse ONLY for clearly-split leading street numbers before
 * a street name+suffix; everything ambiguous is preserved verbatim.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  normalizeSpokenStreetNumber,
  emitAddressNormalizationLog,
} from '../src/address-normalization';

const norm = (s: string) => normalizeSpokenStreetNumber(s).value;

describe('normalizeSpokenStreetNumber — collapse cases', () => {
  it('collapses hyphenated split digits', () => {
    expect(norm('65 1-0 Johnson Road')).toBe('6510 Johnson Road');
  });
  it('collapses spaced split digits', () => {
    expect(norm('65 1 0 Johnson Road')).toBe('6510 Johnson Road');
  });
  it('collapses longer split runs before a suffix', () => {
    expect(norm('1234 5 Main Street')).toBe('12345 Main Street');
    expect(norm('98 7 6 5 Park Avenue')).toBe('98765 Park Avenue');
  });
  it('preserves the remainder verbatim (suffixes, units, city, ZIP)', () => {
    expect(norm('65 1-0 Johnson Road, Pittsburgh, PA 15129'))
      .toBe('6510 Johnson Road, Pittsburgh, PA 15129');
    expect(norm('65 1 0 Johnson Road Apt 4B')).toBe('6510 Johnson Road Apt 4B');
  });
});

describe('normalizeSpokenStreetNumber — preservation cases', () => {
  it('already-compact street numbers unchanged', () => {
    expect(norm('6510 Johnson Road')).toBe('6510 Johnson Road');
  });
  it('legitimately hyphenated street numbers unchanged', () => {
    expect(norm('65-10 Queens Blvd')).toBe('65-10 Queens Blvd');
  });
  it('apartment/unit numbers untouched', () => {
    expect(norm('123 Main Street Apt 4')).toBe('123 Main Street Apt 4');
    expect(norm('1600 Oak Ave Unit 22')).toBe('1600 Oak Ave Unit 22');
  });
  it('ordinal street names unchanged', () => {
    expect(norm('12 34th Street')).toBe('12 34th Street');
    expect(norm('500 5th Avenue')).toBe('500 5th Avenue');
  });
  it('multi-digit continuation tokens are ambiguous — preserved', () => {
    expect(norm('65 10 Johnson Road')).toBe('65 10 Johnson Road');
    expect(norm('65 1-22 Johnson Road')).toBe('65 1-22 Johnson Road');
  });
  it('digit runs without a street suffix are ambiguous — preserved', () => {
    expect(norm('65 1 0 somewhere out there')).toBe('65 1 0 somewhere out there');
    expect(norm('called 65 1 0 times')).toBe('called 65 1 0 times');
  });
  it('over-long collapsed runs are preserved', () => {
    expect(norm('1234567 8 Johnson Road')).toBe('1234567 8 Johnson Road');
  });
  it('ZIP/postal portions never merge into street numbers', () => {
    expect(norm('6510 Johnson Road 15129')).toBe('6510 Johnson Road 15129');
    expect(norm('40 Smith St, Pittsburgh, PA 1 5 1 2 9')).toBe('40 Smith St, Pittsburgh, PA 1 5 1 2 9');
  });
  it('empty/non-string input safe', () => {
    expect(norm('')).toBe('');
    expect(norm(undefined as any)).toBe('');
    expect(norm(null as any)).toBe('');
  });
});

describe('emitAddressNormalizationLog', () => {
  it('logs only when the value changed, with raw/normalized/reason/callSid', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    emitAddressNormalizationLog(
      '65 1-0 Johnson Road',
      normalizeSpokenStreetNumber('65 1-0 Johnson Road'),
      'CA-test-1'
    );
    const blob = spy.mock.calls.map(c => c.map(String).join(' ')).join('\n');
    expect(blob).toContain('[ADDRESS NORMALIZATION] raw: 65 1-0 Johnson Road');
    expect(blob).toContain('[ADDRESS NORMALIZATION] normalized: 6510 Johnson Road');
    expect(blob).toContain('reason: collapsed_spoken_digit_run');
    expect(blob).toContain('callSid: CA-test-1');
    spy.mockClear();
    emitAddressNormalizationLog('6510 Johnson Road', normalizeSpokenStreetNumber('6510 Johnson Road'), 'CA-test-2');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('wiring — canonical serviceAddress boundaries apply the helper', () => {
  const indexSrc = readFileSync(join(__dirname, '../src/index.ts'), 'utf8');

  it('buildCanonicalExtractedInfo (extracted_info boundary) normalizes before sanitize', () => {
    const fnIdx = indexSrc.indexOf('export async function buildCanonicalExtractedInfo');
    const block = indexSrc.slice(fnIdx, fnIdx + 16000);
    expect(block).toContain('normalizeSpokenStreetNumber');
    expect(block).toContain('emitAddressNormalizationLog');
    const normIdx = block.indexOf('serviceAddressNorm.value');
    const retIdx = block.indexOf('serviceAddress: sanitizeEnglishIntakeField');
    expect(normIdx).toBeGreaterThan(-1);
    expect(normIdx).toBeLessThan(retIdx); // normalization runs before the write
  });

  it('completion intake-data boundary normalizes before CRM normalization', () => {
    const cleanIdx = indexSrc.indexOf('cleanAddressMinimal(state.intakeData.serviceAddress)');
    const normIdx = indexSrc.indexOf('completionAddressNorm');
    const crmIdx = indexSrc.indexOf("normalizeCrmField(state.intakeData.serviceAddress,        'address'");
    expect(cleanIdx).toBeGreaterThan(-1);
    expect(normIdx).toBeGreaterThan(cleanIdx);
    expect(normIdx).toBeLessThan(crmIdx);
  });
});
