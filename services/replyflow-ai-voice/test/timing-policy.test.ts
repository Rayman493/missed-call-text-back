import { assert } from 'chai';
import {
  getStageSilenceMs,
  getSettleWindowMs,
  requiresSettleWindow,
  STAGE_SILENCE_MS,
  STAGE_SETTLE_MS,
  STAGES_WITH_INTRINSIC_SETTLE_WINDOW,
} from '../src/lib/timing-policy';

describe('Timing Policy', () => {
  describe('getStageSilenceMs', () => {
    it('returns fast silence for ask_name', () => {
      assert.strictEqual(getStageSilenceMs('ask_name'), 700);
    });

    it('returns moderate silence for ask_request', () => {
      assert.strictEqual(getStageSilenceMs('ask_request'), 1400);
    });

    it('returns short silence for ask_name_reason', () => {
      assert.strictEqual(getStageSilenceMs('ask_name_reason'), 900);
    });

    it('returns long silence for ask_location', () => {
      assert.strictEqual(getStageSilenceMs('ask_location'), 1800);
    });

    it('returns default long silence for unknown stage', () => {
      assert.strictEqual(getStageSilenceMs('unknown'), 1800);
    });
  });

  describe('getSettleWindowMs', () => {
    it('returns short settle for ask_name', () => {
      assert.strictEqual(getSettleWindowMs('ask_name'), 300);
    });

    it('returns moderate settle for ask_request', () => {
      assert.strictEqual(getSettleWindowMs('ask_request'), 700);
    });

    it('returns longer settle for ask_name_reason', () => {
      assert.strictEqual(getSettleWindowMs('ask_name_reason'), 1200);
    });

    it('returns 0 for complete', () => {
      assert.strictEqual(getSettleWindowMs('complete'), 0);
    });

    it('returns default for unknown stage', () => {
      assert.strictEqual(getSettleWindowMs('unknown'), 700);
    });
  });

  describe('requiresSettleWindow', () => {
    it('returns true for ask_name', () => {
      assert.strictEqual(requiresSettleWindow('ask_name'), true);
    });

    it('returns true for ask_request', () => {
      assert.strictEqual(requiresSettleWindow('ask_request'), true);
    });

    it('returns true for ask_name_reason', () => {
      assert.strictEqual(requiresSettleWindow('ask_name_reason'), true);
    });

    it('returns false for ask_location', () => {
      assert.strictEqual(requiresSettleWindow('ask_location'), false);
    });

    it('returns false for ask_callback_time', () => {
      assert.strictEqual(requiresSettleWindow('ask_callback_time'), false);
    });
  });

  describe('STAGE_SILENCE_MS constants are consistent with helpers', () => {
    it('ask_name silence matches getStageSilenceMs', () => {
      assert.strictEqual(STAGE_SILENCE_MS['ask_name'], getStageSilenceMs('ask_name'));
    });

    it('ask_request silence matches getStageSilenceMs', () => {
      assert.strictEqual(STAGE_SILENCE_MS['ask_request'], getStageSilenceMs('ask_request'));
    });

    it('ask_name_reason silence matches getStageSilenceMs', () => {
      assert.strictEqual(STAGE_SILENCE_MS['ask_name_reason'], getStageSilenceMs('ask_name_reason'));
    });
  });

  describe('STAGE_SETTLE_MS constants are consistent with helpers', () => {
    it('ask_name settle matches getSettleWindowMs', () => {
      assert.strictEqual(STAGE_SETTLE_MS['ask_name'], getSettleWindowMs('ask_name'));
    });

    it('ask_request settle matches getSettleWindowMs', () => {
      assert.strictEqual(STAGE_SETTLE_MS['ask_request'], getSettleWindowMs('ask_request'));
    });

    it('ask_name_reason settle matches getSettleWindowMs', () => {
      assert.strictEqual(STAGE_SETTLE_MS['ask_name_reason'], getSettleWindowMs('ask_name_reason'));
    });
  });

  describe('STAGES_WITH_INTRINSIC_SETTLE_WINDOW matches requiresSettleWindow', () => {
    it('contains ask_name and requiresSettleWindow returns true', () => {
      assert.isTrue(STAGES_WITH_INTRINSIC_SETTLE_WINDOW.includes('ask_name'));
      assert.isTrue(requiresSettleWindow('ask_name'));
    });

    it('contains ask_request and requiresSettleWindow returns true', () => {
      assert.isTrue(STAGES_WITH_INTRINSIC_SETTLE_WINDOW.includes('ask_request'));
      assert.isTrue(requiresSettleWindow('ask_request'));
    });

    it('contains ask_name_reason and requiresSettleWindow returns true', () => {
      assert.isTrue(STAGES_WITH_INTRINSIC_SETTLE_WINDOW.includes('ask_name_reason'));
      assert.isTrue(requiresSettleWindow('ask_name_reason'));
    });

    it('does not contain ask_location and requiresSettleWindow returns false', () => {
      assert.isFalse(STAGES_WITH_INTRINSIC_SETTLE_WINDOW.includes('ask_location'));
      assert.isFalse(requiresSettleWindow('ask_location'));
    });
  });
});