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

// Simple Mode: request field should satisfy serviceRequested requirement
{
  const info = {
    customerName: 'Ryan',
    request: 'Grass cutting',
    issueDescription: 'Quarter acre, hilly yard',
    serviceAddress: '123 Main St',
    desiredCompletionTime: 'This weekend',
    callbackTime: 'Tomorrow afternoon',
  }
  assert(isCompleteAIIntake(info, 'onsite') === true, 'Simple Mode request field should satisfy serviceRequested requirement')
}

// Simple Mode: request + issueDescription should satisfy serviceRequested requirement (canonical resolution)
{
  const info = {
    customerName: 'Ryan',
    issueDescription: 'Grass cutting for quarter acre hilly yard',
    serviceAddress: '123 Main St',
    desiredCompletionTime: 'This weekend',
    callbackTime: 'Tomorrow afternoon',
  }
  assert(isCompleteAIIntake(info, 'onsite') === true, 'issueDescription should satisfy serviceRequested requirement via canonical resolution')
}

console.log('[AI INTAKE COMPLETION TESTS] All checks passed')
