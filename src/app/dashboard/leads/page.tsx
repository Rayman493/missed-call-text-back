'use client'

import { useEffect } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import AuthGuard from '@/components/AuthGuard'
import BusinessGuard from '@/components/BusinessGuard'
import DashboardErrorBoundary from '@/components/DashboardErrorBoundary'
import AppHeader from '@/components/AppHeader'
import BottomNavigation from '@/components/BottomNavigation'
import StatsCards from '@/components/StatsCards'

export default function LeadsPage() {
  const { business } = useBusiness()

  useEffect(() => {
    console.log('[ISOLATION STEP 2] Mounted')
  }, [])

  return (
    <DashboardErrorBoundary>
      <AuthGuard>
        <BusinessGuard>
          <div className='min-h-screen bg-[#f8fafc] dark:bg-background flex flex-col relative'>
            <AppHeader title='Leads' />
            <main className='flex-1 pt-4 sm:pt-5 lg:pt-6 px-3 sm:px-4 lg:px-6 pb-16 relative z-10'>
              <div className='max-w-[1400px] mx-auto space-y-4'>
                <h1 className='text-2xl font-bold'>Step 2: StatsCards Test</h1>
                <p className='text-slate-600'>Guards + AppHeader + BottomNavigation + StatsCards.</p>
                {business?.id && (
                  <>
                    {console.log('[ISOLATION STEP 2] Rendering StatsCards')}
                    <StatsCards
                      businessId={business.id}
                      isOnboardingComplete={Boolean(business?.onboarding_status === 'completed')}
                      provisioningStatus={business?.provisioning_status || 'pending'}
                      forwardingVerified={Boolean(business?.forwarding_verified)}
                    />
                  </>
                )}
                <p className='text-slate-500 text-sm'>If Back to Leads works here, next step adds lead list.</p>
              </div>
            </main>
          </div>
        </BusinessGuard>
      </AuthGuard>
      <BottomNavigation />
    </DashboardErrorBoundary>
  )
}

