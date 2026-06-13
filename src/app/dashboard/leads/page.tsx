'use client'

import AuthGuard from '@/components/AuthGuard'
import BusinessGuard from '@/components/BusinessGuard'
import DashboardErrorBoundary from '@/components/DashboardErrorBoundary'
import AppHeader from '@/components/AppHeader'
import BottomNavigation from '@/components/BottomNavigation'

export default function LeadsPage() {
  return (
    <DashboardErrorBoundary>
      <AuthGuard>
        <BusinessGuard>
          <div className='min-h-screen bg-[#f8fafc] dark:bg-background flex flex-col relative'>
            <AppHeader title='Leads' />
            <main className='flex-1 pt-4 sm:pt-5 lg:pt-6 px-3 sm:px-4 lg:px-6 pb-16 relative z-10'>
              <div className='max-w-[1400px] mx-auto'>
                <h1 className='text-2xl font-bold'>Static Shell Test</h1>
                <p className='mt-2 text-slate-600'>Guards + AppHeader + BottomNavigation only.</p>
                <p className='mt-2 text-slate-600'>If Back to Leads works here, next step adds StatCards.</p>
              </div>
            </main>
          </div>
        </BusinessGuard>
      </AuthGuard>
      <BottomNavigation />
    </DashboardErrorBoundary>
  )
}

