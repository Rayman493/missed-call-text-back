'use client'

import { ReactNode, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'
import { shouldGateDashboardPath } from '@/lib/subscription-access-paths'

/**
 * Dashboard subscription gate.
 *
 * Blocks access to paid-feature dashboard pages (leads, calendar,
 * notifications, payments, personal-voicemail, test-setup) when the
 * business has no active entitlement. Billing-recovery surfaces remain
 * reachable: /dashboard itself (PaymentIssueBanner + portal), settings,
 * and admin. Redirect target is /dashboard where the payment-required
 * UI already lives.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { business, businessHydrated } = useBusiness()
  const pathname = usePathname()
  const router = useRouter()

  const gated = shouldGateDashboardPath({
    pathname: pathname ?? '',
    businessHydrated,
    business,
  })

  useEffect(() => {
    if (gated) {
      router.replace('/dashboard')
    }
  }, [gated, router])

  if (gated) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="max-w-md rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Subscription required
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            This area requires an active subscription. Redirecting to billing…
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
