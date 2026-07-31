import { strict as assert } from 'assert';
import { isSettleCallbackAuthorized } from '../src/index';

// Minimal console capture helper
function captureLogs(run: () => void): string[] {
  const logs: string[] = [];
  const orig = console.log;
  console.log = (...args: any[]) => {
    logs.push(args.map(String).join(' '));
  };
  try {
    run();
  } finally {
    console.log = orig;
  }
  return logs;
}

describe('Simple Mode - Settle Callback Authorization Guard', () => {
  it('blocks stale generation and logs single stale_settle_callback_blocked event', () => {
    const state: any = {
      callSid: 'CA_TEST',
      settleGeneration: 3,
      pendingAnswerStage: 'ask_name',
      pendingAnswerTurnId: 7,
    };

    const logs = captureLogs(() => {
      const res = isSettleCallbackAuthorized(state, 'ask_name', 7, /*capturedGeneration*/ 2);
      assert.equal(res.authorized, false);
      assert.equal(res.reason, 'generation_mismatch');
    });

    const staleLogCount = logs.filter(l => l.includes('stale_settle_callback_blocked')).length;
    assert.equal(staleLogCount, 1, 'stale rejection is logged exactly once');
  });

  it('blocks stage/turn mismatch and logs single finalization_blocked_stage_mismatch event', () => {
    const state: any = {
      callSid: 'CA_TEST',
      settleGeneration: 4,
      pendingAnswerStage: 'ask_reason',
      pendingAnswerTurnId: 9,
    };

    const logs = captureLogs(() => {
      const res = isSettleCallbackAuthorized(state, 'ask_name', 7, /*capturedGeneration*/ 4);
      assert.equal(res.authorized, false);
      assert.equal(res.reason, 'stage_or_turn_changed');
    });

    const mismatchCount = logs.filter(l => l.includes('finalization_blocked_stage_mismatch')).length;
    assert.equal(mismatchCount, 1, 'stage/turn mismatch is logged exactly once');
  });
});
