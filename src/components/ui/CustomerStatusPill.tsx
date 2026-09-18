'use client'

import { getCustomerStatusStyle, normalizeCustomerStatus } from '@/lib/customer-status'
import StatusPill from './StatusPill'

/**
 * Customer-lifecycle status pill.
 * Uses the canonical customer-status styles while enforcing the shared
 * StatusPill size/padding/radius contract.
 */
export default function CustomerStatusPill({ status, className }: { status: string; className?: string }) {
  const normalized = normalizeCustomerStatus(status)
  const style = getCustomerStatusStyle(normalized)

  let variant: Parameters<typeof StatusPill>[0]['variant'] = 'gray'
  if (style.badgeClass.includes('green')) variant = 'green'
  else if (style.badgeClass.includes('emerald')) variant = 'emerald'
  else if (style.badgeClass.includes('amber')) variant = 'amber'
  else if (style.badgeClass.includes('red')) variant = 'red'
  else if (style.badgeClass.includes('blue')) variant = 'blue'
  else if (style.badgeClass.includes('purple')) variant = 'purple'
  else if (style.badgeClass.includes('cyan')) variant = 'blue'
  else if (style.badgeClass.includes('orange')) variant = 'amber'

  return (
    <StatusPill variant={variant} className={className}>
      {style.label}
    </StatusPill>
  )
}
