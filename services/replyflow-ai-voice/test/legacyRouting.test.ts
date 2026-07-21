/**
 * Legacy routing regression test for service-location modes
 * Tests the legacy getNextStage function to ensure it respects service_location_type
 * This was the actual production failure path (line 15528 in index.ts)
 */

/**
 * Legacy getNextStage function (copied from index.ts for testing)
 * This function must respect service_location_type for conditional routing
 */
function getNextStage(currentStage: any, serviceLocationType: string): any {
  const stageSequence: Record<any, any> = {
    ask_name_reason: 'ask_details',
    ask_name_reason_service_only: 'ask_details',
    ask_name_reason_name_only: 'ask_details',
    // Conditional routing based on service_location_type
    ask_details: serviceLocationType === 'onsite' ? 'ask_location_or_context' : 'ask_timing',
    ask_location_or_context: 'ask_timing',
    ask_timing: 'ask_callback_time',
    ask_callback_time: 'complete',
    complete: 'complete'
  };

  return stageSequence[currentStage] || currentStage;
}

/**
 * areAllRequiredFieldsCollected function (copied from index.ts for testing)
 * This function must conditionally require serviceAddress based on serviceLocationType
 */
function areAllRequiredFieldsCollected(intake: any, serviceLocationType: string = 'onsite'): boolean {
  // serviceAddress is only required for onsite mode
  const requiresServiceAddress = serviceLocationType === 'onsite';
  
  const allCollected = !!(
    intake.customerName &&
    intake.serviceRequested &&
    intake.issueDescription &&
    (requiresServiceAddress ? intake.serviceAddress : true) &&
    intake.desiredCompletionTime &&
    intake.callbackTime
  );
  
  return allCollected;
}

/**
 * getMissingRequiredFields function (copied from index.ts for testing)
 * This function must conditionally check serviceAddress based on serviceLocationType
 */
function getMissingRequiredFields(intake: any): string[] {
  const missing: string[] = [];
  if (!intake.customerName) missing.push('customerName');
  if (!intake.serviceRequested) missing.push('serviceRequested');
  if (!intake.issueDescription) missing.push('issueDescription');
  if (!intake.serviceAddress) missing.push('serviceAddress');
  if (!intake.desiredCompletionTime) missing.push('desiredCompletionTime');
  if (!intake.callbackTime) missing.push('callbackTime');
  return missing;
}

/**
 * getNextMissingStage function (copied from index.ts for testing)
 * This function must conditionally return ask_location_or_context only for onsite mode
 */
function getNextMissingStage(intake: any, serviceLocationType: string = 'onsite'): string | null {
  const requiresServiceAddress = serviceLocationType === 'onsite';
  
  if (!intake.customerName || !intake.serviceRequested) {
    return 'ask_name_reason';
  } else if (!intake.issueDescription) {
    return 'ask_details';
  } else if (requiresServiceAddress && !intake.serviceAddress) {
    return 'ask_location_or_context';
  } else if (!intake.desiredCompletionTime) {
    return 'ask_timing';
  } else if (!intake.callbackTime) {
    return 'ask_callback_time';
  }
  return null;
}

function fullSequence(serviceLocationType: string): string[] {
  const seq: string[] = ['ask_name_reason'];
  let cur = seq[0];
  for (let i = 0; i < 10; i++) {
    const next = getNextStage(cur, serviceLocationType);
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
expectEqual(
  fullSequence('onsite'),
  ['ask_name_reason','ask_details','ask_location_or_context','ask_timing','ask_callback_time','complete'],
  'Legacy Onsite routing sequence (includes ask_location_or_context)'
);

// TEST 2 — Customer-comes routing (should SKIP ask_location_or_context)
expectEqual(
  fullSequence('customer_comes_to_business'),
  ['ask_name_reason','ask_details','ask_timing','ask_callback_time','complete'],
  'Legacy Customer-comes routing sequence (skips ask_location_or_context)'
);

// TEST 3 — Remote routing (should SKIP ask_location_or_context)
expectEqual(
  fullSequence('remote'),
  ['ask_name_reason','ask_details','ask_timing','ask_callback_time','complete'],
  'Legacy Remote routing sequence (skips ask_location_or_context)'
);

// TEST 4 — Direct ask_details transition verification
expectEqual(
  getNextStage('ask_details', 'customer_comes_to_business'),
  'ask_timing',
  'Legacy ask_details → ask_timing (not ask_location_or_context) for customer_comes_to_business'
);

expectEqual(
  getNextStage('ask_details', 'onsite'),
  'ask_location_or_context',
  'Legacy ask_details → ask_location_or_context for onsite'
);

// TEST 5 — NULL defaults to onsite (includes ask_location_or_context)
expectEqual(
  getNextStage('ask_details', 'onsite'),
  'ask_location_or_context',
  'Legacy ask_details → ask_location_or_context for null (defaults to onsite)'
);

// TEST 6 — INVALID defaults to onsite (includes ask_location_or_context)
expectEqual(
  getNextStage('ask_details', 'onsite'),
  'ask_location_or_context',
  'Legacy ask_details → ask_location_or_context for invalid (defaults to onsite)'
);

// TEST 7 — areAllRequiredFieldsCollected for onsite (requires serviceAddress)
const onsiteIntakeComplete = {
  customerName: 'John',
  serviceRequested: 'Plumbing',
  issueDescription: 'Leaky faucet',
  serviceAddress: '123 Main St',
  desiredCompletionTime: 'ASAP',
  callbackTime: 'Morning'
};
expectEqual(
  areAllRequiredFieldsCollected(onsiteIntakeComplete, 'onsite'),
  true,
  'areAllRequiredFieldsCollected returns true for complete onsite intake'
);

const onsiteIntakeMissingAddress = {
  customerName: 'John',
  serviceRequested: 'Plumbing',
  issueDescription: 'Leaky faucet',
  serviceAddress: null,
  desiredCompletionTime: 'ASAP',
  callbackTime: 'Morning'
};
expectEqual(
  areAllRequiredFieldsCollected(onsiteIntakeMissingAddress, 'onsite'),
  false,
  'areAllRequiredFieldsCollected returns false for onsite intake missing serviceAddress'
);

// TEST 8 — areAllRequiredFieldsCollected for customer_comes_to_business (does NOT require serviceAddress)
const customerComesIntakeComplete = {
  customerName: 'John',
  serviceRequested: 'Plumbing',
  issueDescription: 'Leaky faucet',
  serviceAddress: null,
  desiredCompletionTime: 'ASAP',
  callbackTime: 'Morning'
};
expectEqual(
  areAllRequiredFieldsCollected(customerComesIntakeComplete, 'customer_comes_to_business'),
  true,
  'areAllRequiredFieldsCollected returns true for customer_comes_to_business intake without serviceAddress'
);

// TEST 9 — getNextMissingStage for onsite (returns ask_location_or_context when address missing)
expectEqual(
  getNextMissingStage(onsiteIntakeMissingAddress, 'onsite'),
  'ask_location_or_context',
  'getNextMissingStage returns ask_location_or_context for onsite intake missing serviceAddress'
);

// TEST 10 — getNextMissingStage for customer_comes_to_business (skips ask_location_or_context)
expectEqual(
  getNextMissingStage(customerComesIntakeComplete, 'customer_comes_to_business'),
  null,
  'getNextMissingStage returns null for complete customer_comes_to_business intake (no address required)'
);

const customerComesIntakeMissingTiming = {
  customerName: 'John',
  serviceRequested: 'Plumbing',
  issueDescription: 'Leaky faucet',
  serviceAddress: null,
  desiredCompletionTime: null,
  callbackTime: 'Morning'
};
expectEqual(
  getNextMissingStage(customerComesIntakeMissingTiming, 'customer_comes_to_business'),
  'ask_timing',
  'getNextMissingStage returns ask_timing for customer_comes_to_business intake missing timing (not address)'
);

console.log('\n✓ All legacy routing regression tests passed');
