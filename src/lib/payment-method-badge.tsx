import { Link, MessageSquare } from 'lucide-react'
import AppleTapToPayIcon from '@/components/icons/AppleTapToPayIcon'

export function getPaymentMethodBadge(methodType: string | null, provider: string | null) {
  // Tap to Pay (Terminal)
  if (methodType === 'card_present') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50">
        <AppleTapToPayIcon size={12} className="h-3 w-3" />
        Tap to Pay
      </span>
    )
  }
  // Venmo
  if (provider === 'venmo') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50">
        <Link className="h-3 w-3" />
        Venmo
      </span>
    )
  }
  // PayPal
  if (provider === 'paypal') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50">
        <Link className="h-3 w-3" />
        PayPal
      </span>
    )
  }
  // SMS Link (Stripe card)
  if (methodType === 'card') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/50">
        <MessageSquare className="h-3 w-3" />
        SMS Link
      </span>
    )
  }
  // Unknown
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700/50">
      —
    </span>
  )
}
