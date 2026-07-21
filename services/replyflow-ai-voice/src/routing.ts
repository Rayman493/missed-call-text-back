export type ServiceLocationType = 'onsite' | 'customer_comes_to_business' | 'remote'

export function normalizeServiceLocationType(value: any): ServiceLocationType {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (v === 'onsite' || v === 'customer_comes_to_business' || v === 'remote') return v as ServiceLocationType
  return 'onsite'
}

export function getNextIntakeStage(currentStage: string, mode: ServiceLocationType): string {
  switch (currentStage) {
    case 'ask_name_reason':
      return 'ask_details'
    case 'ask_details':
      return mode === 'onsite' ? 'ask_location' : 'ask_completion_time'
    case 'ask_location':
      return 'ask_completion_time'
    case 'ask_completion_time':
      return 'ask_callback_time'
    case 'ask_callback_time':
      return 'complete'
    default:
      return currentStage
  }
}
