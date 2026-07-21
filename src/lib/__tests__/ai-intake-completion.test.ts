import { isCompleteAIIntake, determineAIOutcomeFromExtractedInfo } from '../ai-intake-completion'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

const base = {
  customerName: 'Ryan',
  serviceRequested: 'Brake inspection',
  issueDescription: 'Grinding noise from front wheels',
  desiredCompletionTime: 'This week',
  callbackTime: 'After 3 PM',
}

// onsite + all fields incl location → complete
{
  const info = { ...base, serviceAddress: '123 Main St' }
  assert(isCompleteAIIntake(info, 'onsite') === true, 'onsite with location should be complete')
}

// onsite + missing location → incomplete
{
  assert(isCompleteAIIntake({ ...base }, 'onsite') === false, 'onsite missing location should be incomplete')
}

// customer_comes_to_business + missing location → complete
{
  assert(isCompleteAIIntake({ ...base }, 'customer_comes_to_business') === true, 'customer_comes missing location should be complete')
}

// remote + missing location → complete
{
  assert(isCompleteAIIntake({ ...base }, 'remote') === true, 'remote missing location should be complete')
}

// null mode → onsite behavior
{
  assert(isCompleteAIIntake({ ...base }, null as any) === false, 'null mode defaults to onsite, missing location should be incomplete')
}

// invalid mode → onsite behavior
{
  assert(isCompleteAIIntake({ ...base }, 'bogus' as any) === false, 'invalid mode defaults to onsite, missing location should be incomplete')
}

// Outcome classification mirrors completeness
{
  const info = { ...base, serviceAddress: '123 Main St' }
  const outcome = determineAIOutcomeFromExtractedInfo(info, 'partial_intake', 'onsite')
  assert(outcome === 'completed_intake', 'determine outcome should return completed_intake when complete')
}

console.log('[AI INTAKE COMPLETION TESTS] All checks passed')
