export type ServiceLocationType = 'onsite' | 'customer_comes_to_business' | 'remote'

export function normalizeServiceLocationType(value: any): ServiceLocationType {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (v === 'onsite' || v === 'customer_comes_to_business' || v === 'remote') return v as ServiceLocationType
  return 'onsite'
}
