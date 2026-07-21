/**
 * Stage routing unit tests for service-location modes (production helper)
 */
import { getNextIntakeStage, normalizeServiceLocationType, type ServiceLocationType } from '../src/routing'

function fullSequence(mode: ServiceLocationType): string[] {
  const seq: string[] = ['ask_name_reason'];
  let cur = seq[0];
  for (let i = 0; i < 10; i++) {
    const next = getNextIntakeStage(cur, mode);
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

console.log('=== STAGE ROUTING TESTS ===');

// Normalization tests
const norm = normalizeServiceLocationType
expectEqual(norm('onsite'), 'onsite', 'normalize onsite')
expectEqual(norm('customer_comes_to_business'), 'customer_comes_to_business', 'normalize customer_comes_to_business')
expectEqual(norm('remote'), 'remote', 'normalize remote')
expectEqual(norm(null as any), 'onsite', 'normalize null → onsite')
expectEqual(norm(undefined as any), 'onsite', 'normalize undefined → onsite')
expectEqual(norm('invalid' as any), 'onsite', 'normalize invalid → onsite')

// TEST 1 — Onsite routing
expectEqual(
  fullSequence('onsite'),
  ['ask_name_reason','ask_details','ask_location','ask_completion_time','ask_callback_time','complete'],
  'Onsite routing sequence'
);

// TEST 2 — Customer-comes routing
expectEqual(
  fullSequence('customer_comes_to_business'),
  ['ask_name_reason','ask_details','ask_completion_time','ask_callback_time','complete'],
  'Customer-comes routing sequence'
);

// TEST 3 — Remote routing
expectEqual(
  fullSequence('remote'),
  ['ask_name_reason','ask_details','ask_completion_time','ask_callback_time','complete'],
  'Remote routing sequence'
);

console.log('\n✓ All stage routing tests passed');
