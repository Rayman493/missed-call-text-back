import { afterEach, describe, it } from 'vitest';
import assert from 'node:assert';
import { buildHealthPayload } from '../src/health';

describe('health metadata identity', () => {
  const ORIGINAL = process.env.BUILD_COMMIT_SHA;

  afterEach(() => {
    if (ORIGINAL === undefined) {
      delete process.env.BUILD_COMMIT_SHA;
    } else {
      process.env.BUILD_COMMIT_SHA = ORIGINAL;
    }
  });

  it('reports BUILD_COMMIT_SHA as the commit identity when present', () => {
    process.env.BUILD_COMMIT_SHA = '149da4225a140f66c952eea85b0eaaa7e3a7ee07';
    const payload = buildHealthPayload();
    assert.strictEqual(payload.commit, '149da4225a140f66c952eea85b0eaaa7e3a7ee07');
    assert.strictEqual(payload.status, 'healthy');
    assert.strictEqual(payload.service, 'ai-voice-poc');
    assert.strictEqual(payload.hangupRouter, 'v3');
  });

  it('falls back to a neutral unknown value when BUILD_COMMIT_SHA is absent', () => {
    delete process.env.BUILD_COMMIT_SHA;
    const payload = buildHealthPayload();
    assert.strictEqual(payload.commit, 'unknown');
    assert.strictEqual(payload.status, 'healthy');
  });

  it('never exposes a stale hardcoded commit literal', () => {
    delete process.env.BUILD_COMMIT_SHA;
    const payload = buildHealthPayload();
    assert.notStrictEqual(payload.commit, '3c67556');
    assert.notStrictEqual(payload.commit, '596cf8c6');
  });
});
