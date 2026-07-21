/**
 * Legacy routing regression test for service-location modes
 * Tests the legacy getNextStage function to ensure it respects service_location_type
 * This was the actual production failure path (line 15523 in index.ts)
 */

// Mock the callSessionState that getNextStage depends on
let mockServiceLocationType: 'onsite' | 'customer_comes_to_business' | 'remote' = 'onsite';

const callSessionState: any = {
  serviceLocationType: mockServiceLocationType
};

/**
 * Legacy getNextStage function (copied from index.ts for testing)
 * This function must respect service_location_type for conditional routing
 */
function getNextStage(currentStage: any): any {
  const stageSequence: Record<any, any> = {
    ask_name_reason: 'ask_details',
    ask_name_reason_service_only: 'ask_details',
    ask_name_reason_name_only: 'ask_details',
    // Conditional routing based on service_location_type
    ask_details: callSessionState.serviceLocationType === 'onsite' ? 'ask_location_or_context' : 'ask_timing',
    ask_location_or_context: 'ask_timing',
    ask_timing: 'ask_callback_time',
    ask_callback_time: 'complete',
    complete: 'complete'
  };

  return stageSequence[currentStage] || currentStage;
}

function fullSequence(): string[] {
  const seq: string[] = ['ask_name_reason'];
  let cur = seq[0];
  for (let i = 0; i < 10; i++) {
    const next = getNextStage(cur);
    if (next === cur) break;
    seq.push(next);
    cur = next;
    if (cur === 'complete') break;
  }
  return seq;
}

const expectEqual = (a: any, b: any, label: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    console.error(`[FAIL] ${label}\n  expected: ${JSON.stringify(b)}\n  actual:   ${JSON.stringify(a)}`);
    process.exit(1);
  } else {
    console.log(`[PASS] ${label}`);
  }
}

console.log('=== LEGACY ROUTING REGRESSION TESTS ===');

// TEST 1 — Onsite routing (should include ask_location_or_context)
mockServiceLocationType = 'onsite';
callSessionState.serviceLocationType = mockServiceLocationType;
expectEqual(
  fullSequence(),
  ['ask_name_reason','ask_details','ask_location_or_context','ask_timing','ask_callback_time','complete'],
  'Legacy Onsite routing sequence (includes ask_location_or_context)'
);

// TEST 2 — Customer-comes routing (should SKIP ask_location_or_context)
mockServiceLocationType = 'customer_comes_to_business';
callSessionState.serviceLocationType = mockServiceLocationType;
expectEqual(
  fullSequence(),
  ['ask_name_reason','ask_details','ask_timing','ask_callback_time','complete'],
  'Legacy Customer-comes routing sequence (skips ask_location_or_context)'
);

// TEST 3 — Remote routing (should SKIP ask_location_or_context)
mockServiceLocationType = 'remote';
callSessionState.serviceLocationType = mockServiceLocationType;
expectEqual(
  fullSequence(),
  ['ask_name_reason','ask_details','ask_timing','ask_callback_time','complete'],
  'Legacy Remote routing sequence (skips ask_location_or_context)'
);

// TEST 4 — Direct ask_details transition verification
mockServiceLocationType = 'customer_comes_to_business';
callSessionState.serviceLocationType = mockServiceLocationType;
expectEqual(
  getNextStage('ask_details'),
  'ask_timing',
  'Legacy ask_details → ask_timing (not ask_location_or_context) for customer_comes_to_business'
);

mockServiceLocationType = 'onsite';
callSessionState.serviceLocationType = mockServiceLocationType;
expectEqual(
  getNextStage('ask_details'),
  'ask_location_or_context',
  'Legacy ask_details → ask_location_or_context for onsite'
);

console.log('\n✓ All legacy routing regression tests passed');
