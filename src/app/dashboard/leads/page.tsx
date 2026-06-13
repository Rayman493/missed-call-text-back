'use client'

import { useState, useEffect, useCallback } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { getLeadDisplayName, formatPhoneNumber } from '@/lib/utils'
import Link from 'next/link'
import AuthGuard from '@/components/AuthGuard'
import BusinessGuard from '@/components/BusinessGuard'
import DashboardErrorBoundary from '@/components/DashboardErrorBoundary'
import AppHeader from '@/components/AppHeader'
import BottomNavigation from '@/components/BottomNavigation'
import StatsCards from '@/components/StatsCards'

export default function LeadsPage() {
  const { business } = useBusiness()
  const [leads, setLeads] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabase = createBrowserClient()

  const fetchLeads = useCallback(async () => {
    if (!business?.id) return
    console.log('[ISOLATION STEP 4] Starting fetchLeads')
    setLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('business_id', business.id)
        .eq('is_demo', false)
        .order('created_at', { ascending: false })
      if (error) throw error
      const fetched = data || []
      console.log('[ISOLATION STEP 4] Lead count', fetched.length)
      setLeads(fetched)
    } catch (err: any) {
      console.error('[ISOLATION STEP 4] Error fetching leads:', err)
      setError(err.message || 'Failed to load leads')
    } finally {
      setLoading(false)
    }
  }, [business?.id, supabase])

  useEffect(() => {
    console.log('[ISOLATION STEP 4] Mounted')
    fetchLeads()
  }, [fetchLeads])

  return (
    <DashboardErrorBoundary>
      <AuthGuard>
        <BusinessGuard>
          <div className='min-h-screen bg-[#f8fafc] dark:bg-background flex flex-col relative'>
            <AppHeader title='Leads' />
            <main className='flex-1 pt-4 sm:pt-5 lg:pt-6 px-3 sm:px-4 lg:px-6 pb-16 relative z-10'>
              <div className='max-w-[1400px] mx-auto space-y-4'>
                <h1 className='text-2xl font-bold'>Step 4: Link Test</h1>
                <p className='text-slate-600'>Guards + AppHeader + StatsCards + lead list with Link wrappers.</p>

                {business?.id && (
                  <StatsCards
                    businessId={business.id}
                    isOnboardingComplete={Boolean(business?.onboarding_status === 'completed')}
                    provisioningStatus={business?.provisioning_status || 'pending'}
                    forwardingVerified={Boolean(business?.forwarding_verified)}
                  />
                )}

                {loading && (
                  <div className='text-slate-500'>Loading leads...</div>
                )}

                {error && (
                  <div className='text-red-600'>Error: {error}</div>
                )}

                {!loading && !error && leads.length === 0 && (
                  <div className='text-slate-500'>No leads found.</div>
                )}

                {!loading && !error && leads.length > 0 && (
                  <div className='space-y-3'>
                    {leads.map((lead) => {
                      const href = `/dashboard/leads/${lead.id}`
                      console.log(`[STEP 4] Rendering Link for lead ${lead.id}`)
                      console.log(`[STEP 4] Link href = ${href}`)
                      return (
                        <Link
                          key={lead.id}
                          href={href}
                          prefetch={false}
                          className='block bg-white dark:bg-card rounded-xl border border-slate-200 dark:border-slate-700/60 shadow-sm p-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors'
                        >
                          <div className='flex items-center justify-between'>
                            <div>
                              <p className='font-semibold text-slate-900 dark:text-white'>
                                {getLeadDisplayName(lead)}
                              </p>
                              <p className='text-sm text-slate-500 dark:text-slate-400'>
                                {formatPhoneNumber(lead.caller_phone || lead.phone_number || lead.phone)}
                              </p>
                            </div>
                            <span className='text-xs text-slate-400'>
                              {lead.status || 'new'}
                            </span>
                          </div>
                          <p className='mt-2 text-xs text-slate-400'>
                            Lead ID: {lead.id}
                          </p>
                        </Link>
                      )
                    })}
                  </div>
                )}

                <p className='text-slate-500 text-sm'>If Back to Leads works here, next step restores realtime subscriptions.</p>
              </div>
            </main>
          </div>
        </BusinessGuard>
      </AuthGuard>
      <BottomNavigation />
    </DashboardErrorBoundary>
  )
}

