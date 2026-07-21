import { formatAiIntakeSummaryWithMode } from '../ai-intake-formatter'

// Plain validation script without Jest globals
const baseExtracted = {
  callerName: 'Ryan',
  reasonForCalling: 'Brake inspection',
  importantDetails: 'Grinding noise from front wheels',
  desiredCompletionTime: 'This week',
  preferredCallbackTime: 'After 3 PM'
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message)
  }
}

// Onsite with no location includes Location row
{
  const body = formatAiIntakeSummaryWithMode(baseExtracted, '+15551234567', 'TestBiz', '', 'onsite')
  assert(body.includes('📍 Service Address'), 'Onsite missing location should include Location section')
}

// Customer-comes with no location omits Location row
{
  const body = formatAiIntakeSummaryWithMode(baseExtracted, '+15551234567', 'TestBiz', '', 'customer_comes_to_business')
  assert(!body.includes('📍 Service Address'), 'Customer-comes missing location should omit Location section')
}

// Remote with no location omits Location row
{
  const body = formatAiIntakeSummaryWithMode(baseExtracted, '+15551234567', 'TestBiz', '', 'remote')
  assert(!body.includes('📍 Service Address'), 'Remote missing location should omit Location section')
}

// Non-onsite with legitimate location preserves row
{
  const extracted = { ...baseExtracted, addressOrLocation: '1632 South Pine Drive' }
  const body = formatAiIntakeSummaryWithMode(extracted, '+15551234567', 'TestBiz', '', 'remote')
  assert(body.includes('📍 Service Address'), 'Non-onsite with legitimate location should include Location section')
  assert(body.includes('1632 South Pine Drive'), 'Location value should be present')
}

console.log('[SMS SUMMARY TESTS] All checks passed')
