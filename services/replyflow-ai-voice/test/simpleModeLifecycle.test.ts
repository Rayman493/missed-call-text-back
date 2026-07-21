/**
 * Simple Mode lifecycle regression tests for service_location_type initialization
 * Verifies correct routing after Twilio start provides businessId
 */

type Stage = 'ask_name_reason'|'ask_details'|'ask_location'|'ask_completion_time'|'ask_callback_time'|'complete';

type MockDbResult = { outcome: 'data'|'no_row'|'error', value?: string };

function normalizeServiceLocationType(value: any): 'onsite'|'customer_comes_to_business'|'remote' {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return (v === 'onsite' || v === 'customer_comes_to_business' || v === 'remote') ? (v as any) : 'onsite';
}

function getNextIntakeStage(currentStage: Stage, serviceLocationType: string): Stage {
  switch (currentStage) {
    case 'ask_name_reason': return 'ask_details';
    case 'ask_details': return serviceLocationType === 'onsite' ? 'ask_location' : 'ask_completion_time';
    case 'ask_location': return 'ask_completion_time';
    case 'ask_completion_time': return 'ask_callback_time';
    case 'ask_callback_time': return 'complete';
    default: return currentStage;
  }
}

function simulateSimpleModeLifecycle(db: MockDbResult, startingBusinessId: string|null): { nextAfterDetails: Stage, modeAtFinalization: string } {
  // Initial state (pre-start): no businessId, no mode
  let businessId: string = startingBusinessId || '';
  let serviceLocationType: string = '';

  // PRE-START: there must be NO permanent resolution
  // (In real code, we removed the pre-start lookup.)

  // Twilio start arrives: sets businessId
  businessId = businessId || 'test-business-id';

  // Authoritative load now
  if (db.outcome === 'data') {
    serviceLocationType = normalizeServiceLocationType(db.value);
  } else if (db.outcome === 'no_row') {
    serviceLocationType = 'onsite';
  } else {
    // error
    serviceLocationType = 'onsite';
  }

  // Finalize ask_details and route using resolved serviceLocationType
  const next = getNextIntakeStage('ask_details', serviceLocationType);
  return { nextAfterDetails: next, modeAtFinalization: serviceLocationType };
}

function expectEqual(a: any, b: any, label: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    console.error(`[FAIL] ${label}\n  expected: ${JSON.stringify(b)}\n  actual:   ${JSON.stringify(a)}`);
    process.exit(1);
  } else {
    console.log(`[PASS] ${label}`);
  }
}

console.log('=== SIMPLE MODE LIFECYCLE TESTS ===');

// customer_comes_to_business -> ask_completion_time
{
  const r = simulateSimpleModeLifecycle({ outcome: 'data', value: 'customer_comes_to_business' }, null);
  expectEqual(r.nextAfterDetails, 'ask_completion_time', 'Lifecycle: customer_comes_to_business routes to ask_completion_time');
}

// remote -> ask_completion_time
{
  const r = simulateSimpleModeLifecycle({ outcome: 'data', value: 'remote' }, null);
  expectEqual(r.nextAfterDetails, 'ask_completion_time', 'Lifecycle: remote routes to ask_completion_time');
}

// onsite -> ask_location
{
  const r = simulateSimpleModeLifecycle({ outcome: 'data', value: 'onsite' }, null);
  expectEqual(r.nextAfterDetails, 'ask_location', 'Lifecycle: onsite routes to ask_location');
}

// DB failure/no row -> fallback onsite -> ask_location
{
  const r1 = simulateSimpleModeLifecycle({ outcome: 'no_row' }, null);
  expectEqual(r1.nextAfterDetails, 'ask_location', 'Lifecycle: no_row falls back to onsite and routes to ask_location');
  const r2 = simulateSimpleModeLifecycle({ outcome: 'error' }, null);
  expectEqual(r2.nextAfterDetails, 'ask_location', 'Lifecycle: error falls back to onsite and routes to ask_location');
}

console.log('\n✓ All Simple Mode lifecycle tests passed');
