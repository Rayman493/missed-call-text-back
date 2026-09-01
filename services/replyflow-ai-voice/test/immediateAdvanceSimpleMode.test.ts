import { strict as assert } from 'assert';
import { handleImmediateAdvanceIfMultiFieldCaptured } from '../src/index';

describe('Simple Mode - Immediate advance when name + reason captured during ask_name', () => {
  it('skips ask_reason and dispatches ask_details exactly once', async () => {
    const state: any = {
      callSid: 'CA_TEST',
      currentStage: 'ask_name',
      intakeData: { customerName: 'Ryan', serviceRequested: 'need my grass cut' },
    };

    let sent: string[] = [];
    const deps = {
      sendPrompt: (stage: string, promptKeyOverride?: string) => {
        sent.push(promptKeyOverride || stage);
        return Promise.resolve(true);
      },
      getNextIntakeStage: (s: string) => s === 'ask_name' ? 'ask_reason' : 'ask_details',
      clearPendingAnswerState: (_s: any, _r: string) => {},
    };

    const advanced = handleImmediateAdvanceIfMultiFieldCaptured(state, 'ask_name', deps);
    assert.equal(advanced, true, 'immediate-advance returned true');
    assert.equal(state.currentStage, 'ask_details', 'stage advanced directly to ask_details');

    // Wait for async sendPrompt to complete
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.deepEqual(sent, ['ask_details'], 'ask_details dispatched exactly once');
  });
});
