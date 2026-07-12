'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import AuthGuard from '@/components/AuthGuard'
import Navigation from '@/components/Navigation'
import UserDropdown from '@/components/UserDropdown'
import AppHeader from '@/components/AppHeader'

interface Business {
  id: string
  user_id: string
  business_name: string
  business_type: string
  business_phone: string
  twilio_phone_number: string
  twilio_phone_number_sid: string
  messaging_service_sid: string
  a2p_status: string
  onboarding_status: string
  forwarding_verified: boolean
  subscription_status: string
  trial_end_date: string
  current_period_end: string
  stripe_customer_id: string
  stripe_subscription_id: string
  provisioning_status: string
  call_forwarding_enabled: boolean
  manual_access_enabled: boolean | null
  manual_access_expires_at: string | null
  manual_access_reason: string | null
  manual_access_note: string | null
  manual_access_granted_at: string | null
  manual_access_granted_by: string | null
  created_at: string
  twilio_release_at: string | null
  twilio_released_at: string | null
  twilio_release_status: string | null
  twilio_release_reason: string | null
  is_protected_account: boolean | null
  protected_reason: string | null
}

export default function AdminSupportPage() {
  const router = useRouter()
  const { user, session } = useAuth()
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Business[]>([])
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  
  // Admin action state
  const [actionLoading, setActionLoading] = useState(false)
  const [actionResult, setActionResult] = useState<{ success: boolean; message: string } | null>(null)
  
  // Manual access state
  const [manualAccessAction, setManualAccessAction] = useState<'grant' | 'revoke'>('grant')
  const [manualAccessDuration, setManualAccessDuration] = useState<'7d' | '14d' | '30d' | '60d' | '90d' | 'custom' | 'lifetime'>('lifetime')
  const [manualAccessCustomDate, setManualAccessCustomDate] = useState('')
  const [manualAccessReason, setManualAccessReason] = useState('')
  const [manualAccessNote, setManualAccessNote] = useState('')
  const [showManualAccessModal, setShowManualAccessModal] = useState(false)

  // Protect account state
  const [protectAction, setProtectAction] = useState<'protect' | 'unprotect'>('protect')
  const [protectReason, setProtectReason] = useState('')
  const [showProtectModal, setShowProtectModal] = useState(false)

  // Delete test business data state
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteDryRunResult, setDeleteDryRunResult] = useState<any>(null)
  const [deleteConfirmPhase, setDeleteConfirmPhase] = useState<'dry-run' | 'confirm'>('dry-run')
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Metrics state
  const [metrics, setMetrics] = useState<any>(null)
  const [metricsLoading, setMetricsLoading] = useState(true)

  // Filter state
  const [selectedFilter, setSelectedFilter] = useState<string>('all')
  const [showFilters, setShowFilters] = useState(false)

  // Business detail state
  const [businessDetail, setBusinessDetail] = useState<any>(null)
  const [businessDetailLoading, setBusinessDetailLoading] = useState(false)

  useEffect(() => {
    const checkAdmin = async () => {
      if (!user?.id) return

      try {
        const response = await fetch('/api/admin/check-status')
        const data = await response.json()

        console.log('[ADMIN SUPPORT PAGE] Admin check result:', data)

        if (!data.isAdmin) {
          console.log('[ADMIN SUPPORT PAGE] User is not admin, redirecting to dashboard')
          router.push('/dashboard')
          return
        }

        setIsAdmin(true)
        setLoading(false)
      } catch (error) {
        console.error('[ADMIN SUPPORT PAGE] Admin check failed:', error)
        router.push('/dashboard')
      }
    }

    checkAdmin()
  }, [user, router])

  useEffect(() => {
    const fetchMetrics = async () => {
      if (!isAdmin) return

      try {
        const response = await fetch('/api/admin/metrics')
        const data = await response.json()

        if (data.success) {
          setMetrics(data.metrics)
        }
      } catch (error) {
        console.error('[ADMIN SUPPORT PAGE] Failed to fetch metrics:', error)
      } finally {
        setMetricsLoading(false)
      }
    }

    fetchMetrics()
  }, [isAdmin])

  const handleSearch = async () => {
    if (!searchQuery.trim()) return

    setSearchLoading(true)
    try {
      const filterParam = selectedFilter !== 'all' ? `&filter=${selectedFilter}` : ''
      const response = await fetch(`/api/admin/search-businesses?query=${encodeURIComponent(searchQuery)}${filterParam}`)
      const data = await response.json()

      if (data.success) {
        setSearchResults(data.businesses || [])
      } else {
        setActionResult({ success: false, message: data.error || 'Search failed' })
      }
    } catch (error) {
      setActionResult({ success: false, message: 'Search failed' })
    } finally {
      setSearchLoading(false)
    }
  }

  const handleSelectBusiness = async (business: Business) => {
    setSelectedBusiness(business)
    setActionResult(null)
    setBusinessDetailLoading(true)

    try {
      const response = await fetch(`/api/admin/business-detail?businessId=${business.id}`)
      const data = await response.json()

      if (data.success) {
        setBusinessDetail(data.detail)
      } else {
        console.error('[ADMIN SUPPORT PAGE] Failed to fetch business detail:', data.error)
      }
    } catch (error) {
      console.error('[ADMIN SUPPORT PAGE] Error fetching business detail:', error)
    } finally {
      setBusinessDetailLoading(false)
    }
  }

  const handleAdminAction = async (action: string, businessId: string) => {
    if (!confirm(`Are you sure you want to perform this action: ${action}?`)) {
      return
    }

    setActionLoading(true)
    setActionResult(null)
    
    try {
      const response = await fetch('/api/admin/support-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, businessId }),
      })

      const data = await response.json()
      
      if (data.success) {
        setActionResult({ success: true, message: data.message || 'Action completed successfully' })
        
        console.log('[ADMIN SUPPORT] Action completed successfully:', { action, businessId })
        
        // For actions that modify business state, refresh the business data from server
        const actionsThatModifyBusiness = ['retry_provisioning', 'reconcile_messaging_service', 'mark_forwarding_verified', 'reset_onboarding', 'refresh_subscription']
        
        if (actionsThatModifyBusiness.includes(action) && selectedBusiness?.id === businessId) {
          console.log('[ADMIN SUPPORT] Refreshing business after action:', { action, businessId })
          
          // Re-fetch the specific business from the server
          try {
            const searchResponse = await fetch(`/api/admin/search-businesses?query=${encodeURIComponent(selectedBusiness.business_name || selectedBusiness.twilio_phone_number || '')}`)
            const searchData = await searchResponse.json()
            
            if (searchData.success && searchData.businesses) {
              const updatedBusiness = searchData.businesses.find((b: Business) => b.id === businessId)
              if (updatedBusiness) {
                console.log('[ADMIN SUPPORT] Business refreshed successfully:', {
                  businessId,
                  provisioning_status: updatedBusiness.provisioning_status,
                  twilio_phone_number: updatedBusiness.twilio_phone_number
                })
                setSelectedBusiness(updatedBusiness)
                
                // Also update the search results
                const updatedResults = searchResults.map(b => b.id === businessId ? updatedBusiness : b)
                setSearchResults(updatedResults)
              }
            }
          } catch (refreshError) {
            console.error('[ADMIN SUPPORT] Failed to refresh business after action:', refreshError)
          }
        }
      } else {
        setActionResult({ success: false, message: data.error || 'Action failed' })
      }
    } catch (error) {
      setActionResult({ success: false, message: 'Action failed' })
    } finally {
      setActionLoading(false)
    }
  }

  const handleManualAccess = async () => {
    if (!selectedBusiness) return
    
    setActionLoading(true)
    setActionResult(null)
    
    try {
      let expiresAt = null
      if (manualAccessDuration === 'lifetime') {
        expiresAt = null
      } else if (manualAccessDuration === 'custom') {
        expiresAt = manualAccessCustomDate
      } else {
        const days = parseInt(manualAccessDuration)
        const date = new Date()
        date.setDate(date.getDate() + days)
        expiresAt = date.toISOString()
      }

      const response = await fetch('/api/admin/manual-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: selectedBusiness.id,
          action: manualAccessAction,
          expiresAt,
          reason: manualAccessReason,
          note: manualAccessNote
        }),
      })

      const data = await response.json()
      
      if (data.success) {
        setActionResult({ success: true, message: data.message || 'Manual access updated' })
        setShowManualAccessModal(false)
        // Refresh business data
        const updatedBusiness = { ...selectedBusiness, ...data.business }
        setSelectedBusiness(updatedBusiness)
        const updatedResults = searchResults.map(b => b.id === selectedBusiness.id ? updatedBusiness : b)
        setSearchResults(updatedResults)
      } else {
        setActionResult({ success: false, message: data.error || 'Failed to update manual access' })
      }
    } catch (error) {
      setActionResult({ success: false, message: 'Failed to update manual access' })
    } finally {
      setActionLoading(false)
    }
  }

  const getManualAccessStatusText = (business: Business) => {
    if (!business.manual_access_enabled) {
      return 'Disabled'
    }
    if (!business.manual_access_expires_at) {
      return 'Lifetime'
    }
    // Format date as "June 5, 2026" to avoid timezone confusion
    const expiresAt = new Date(business.manual_access_expires_at)
    const formattedDate = expiresAt.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
    return `Until ${formattedDate}`
  }

  const getBusinessIssueIndicator = (business: Business) => {
    const issues: string[] = []

    if (business.provisioning_status === 'failed') {
      issues.push('Provisioning Failed')
    }
    if (business.subscription_status === 'past_due') {
      issues.push('Past Due')
    }
    if (business.subscription_status === 'trialing' && business.trial_end_date) {
      const trialEnd = new Date(business.trial_end_date)
      const now = new Date()
      const daysUntilExpiry = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      if (daysUntilExpiry <= 7) {
        issues.push(`Trial Expiring (${daysUntilExpiry}d)`)
      }
    }
    if (!business.forwarding_verified && business.onboarding_status !== 'not_started') {
      issues.push('Forwarding Not Verified')
    }
    if (!business.onboarding_status || !['completed', 'forwarding_verified'].includes(business.onboarding_status)) {
      const created = new Date(business.created_at)
      const now = new Date()
      const hoursSinceCreation = (now.getTime() - created.getTime()) / (1000 * 60 * 60)
      if (hoursSinceCreation > 24) {
        issues.push('Onboarding Incomplete')
      }
    }

    return issues
  }

  const getBusinessHealthState = (business: Business, detail: any) => {
    const issues = getBusinessIssueIndicator(business)
    const hasCriticalIssues = business.provisioning_status === 'failed' || business.subscription_status === 'past_due'
    const hasHighIssues = issues.some(i => i.includes('Trial Expiring') || i.includes('Onboarding Incomplete'))

    if (hasCriticalIssues) {
      return { state: 'Critical', color: 'red', issues }
    } else if (hasHighIssues || issues.length > 0) {
      return { state: 'Needs Attention', color: 'amber', issues }
    } else {
      return { state: 'Healthy', color: 'green', issues: [] }
    }
  }

  const getRecommendedAction = (business: Business, detail: any) => {
    const health = getBusinessHealthState(business, detail)
    const issues = health.issues

    if (issues.length === 0) {
      return {
        title: 'No action needed',
        description: 'This account is operating normally.',
        action: null,
        actionLabel: null
      }
    }

    // Prioritize critical issues
    if (business.provisioning_status === 'failed') {
      return {
        title: 'Retry Number Provisioning',
        description: 'The Twilio number provisioning failed. This prevents the business from receiving calls or messages.',
        action: 'retry_provisioning',
        actionLabel: 'Retry Provisioning'
      }
    }

    if (business.subscription_status === 'past_due') {
      return {
        title: 'Resolve Past-Due Billing',
        description: 'The subscription is past due. Access may be restricted until billing is resolved.',
        action: 'view_stripe_portal',
        actionLabel: 'Open Billing Portal'
      }
    }

    if (issues.includes('Forwarding Not Verified')) {
      return {
        title: 'Complete Forwarding Setup',
        description: 'Call forwarding has not been verified. The business cannot receive calls until forwarding is confirmed.',
        action: null,
        actionLabel: 'Contact Customer'
      }
    }

    if (issues.includes('Onboarding Incomplete')) {
      return {
        title: 'Complete Onboarding',
        description: 'Onboarding has been incomplete for over 24 hours. The business may need guidance.',
        action: null,
        actionLabel: 'Send Setup Guidance'
      }
    }

    if (issues.some(i => i.includes('Trial Expiring'))) {
      return {
        title: 'Trial Expiring Soon',
        description: 'The trial period is ending. The business may need to upgrade or extend access.',
        action: null,
        actionLabel: 'Contact Customer'
      }
    }

    return {
      title: 'Review Issues',
      description: `This business has ${issues.length} issue(s) that need attention.`,
      action: null,
      actionLabel: null
    }
  }

  const handleProtect = async () => {
    if (!selectedBusiness) return

    setActionLoading(true)
    setActionResult(null)

    try {
      const response = await fetch('/api/admin/protect-business', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: selectedBusiness.id,
          action: protectAction,
          reason: protectAction === 'protect' ? protectReason : undefined
        }),
      })

      const data = await response.json()

      if (data.success) {
        setActionResult({ success: true, message: data.message || `Business ${protectAction === 'protect' ? 'protected' : 'unprotected'} successfully` })
        setShowProtectModal(false)
        setProtectReason('')
        // Refresh business data
        const updatedBusiness = {
          ...selectedBusiness,
          is_protected_account: protectAction === 'protect',
          protected_reason: protectAction === 'protect' ? protectReason : undefined
        } as Business
        setSelectedBusiness(updatedBusiness)
        const updatedResults = searchResults.map(b => b.id === selectedBusiness.id ? updatedBusiness : b)
        setSearchResults(updatedResults)
      } else {
        setActionResult({ success: false, message: data.error || `Failed to ${protectAction} business` })
      }
    } catch (error) {
      setActionResult({ success: false, message: `Failed to ${protectAction} business` })
    } finally {
      setActionLoading(false)
    }
  }

  const handleDeleteTestBusinessData = async () => {
    console.log('[DELETE TEST DATA] ========== START ==========')
    console.log('[DELETE TEST DATA] selectedBusiness:', selectedBusiness)
    console.log('[DELETE TEST DATA] deleteConfirmPhase:', deleteConfirmPhase)

    if (!selectedBusiness) {
      console.error('[DELETE TEST DATA] No selected business')
      return
    }

    if (!session || !session.access_token) {
      console.error('[DELETE TEST DATA] No session or access token')
      setActionResult({ success: false, message: 'Authentication required. Please log in again.' })
      return
    }

    if (deleteConfirmPhase === 'dry-run') {
      console.log('[DELETE TEST DATA] Starting dry-run phase')
      setDeleteLoading(true)
      try {
        console.log('[DELETE TEST DATA] Using session access token')
        const token = session.access_token
        console.log('[DELETE TEST DATA] Token obtained:', !!token)

        const payload = {
          mode: 'dry-run',
          filterType: 'businessId',
          filterValue: selectedBusiness.id
        }
        console.log('[DELETE TEST DATA] Request payload:', payload)
        console.log('[DELETE TEST DATA] Request URL: /api/admin/reset-test-data')

        const response = await fetch('/api/admin/reset-test-data', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        })

        console.log('[DELETE TEST DATA] Response status:', response.status)
        console.log('[DELETE TEST DATA] Response ok:', response.ok)

        const data = await response.json()
        console.log('[DELETE TEST DATA] Response data:', data)

        if (data.blocked) {
          console.log('[DELETE TEST DATA] Operation blocked:', data.blockReason)
          setActionResult({ success: false, message: data.blockReason || 'Operation blocked' })
        } else {
          console.log('[DELETE TEST DATA] Setting dry-run result')
          setDeleteDryRunResult(data)
          setDeleteConfirmPhase('confirm')
        }
      } catch (error: any) {
        console.error('[DELETE TEST DATA] Exception caught:', error)
        console.error('[DELETE TEST DATA] Error message:', error.message)
        console.error('[DELETE TEST DATA] Error stack:', error.stack)
        setActionResult({ success: false, message: 'Failed to get dry-run preview' })
      } finally {
        setDeleteLoading(false)
      }
    } else {
      setDeleteLoading(true)
      try {
        if (!session || !session.access_token) {
          console.error('[DELETE TEST DATA] No session or access token')
          setActionResult({ success: false, message: 'Authentication required. Please log in again.' })
          setDeleteLoading(false)
          return
        }

        const token = session.access_token
        const response = await fetch('/api/admin/reset-test-data', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            mode: 'execute',
            filterType: 'businessId',
            filterValue: selectedBusiness.id,
            confirmationPhrase: deleteConfirmation
          })
        })

        const data = await response.json()
        if (data.success || !data.blocked) {
          const message = data.totalRecordsDeleted !== undefined
            ? `Successfully deleted ${data.totalRecordsDeleted} record${data.totalRecordsDeleted !== 1 ? 's' : ''}` +
              (data.businessesDeleted ? `, ${data.businessesDeleted} business${data.businessesDeleted !== 1 ? 'es' : ''}` : '') +
              (data.twilioNumbersReserved ? `, reserved ${data.twilioNumbersReserved} Twilio number${data.twilioNumbersReserved !== 1 ? 's' : ''}` : '') +
              (data.reservedUntil ? ` until ${new Date(data.reservedUntil).toLocaleDateString()}` : '')
            : 'Successfully deleted test data'
          setActionResult({ success: true, message })
          setShowDeleteModal(false)
          setDeleteConfirmPhase('dry-run')
          setDeleteDryRunResult(null)
          setDeleteConfirmation('')
          // Refresh search results
          if (searchQuery) {
            await handleSearch()
          }
        } else {
          setActionResult({ success: false, message: data.blockReason || data.error || 'Deletion failed' })
        }
      } catch (error) {
        setActionResult({ success: false, message: 'Failed to delete test data' })
      } finally {
        setDeleteLoading(false)
      }
    }
  }

  const handleOpenDeleteModal = () => {
    if (selectedBusiness?.is_protected_account) {
      setActionResult({ success: false, message: 'Cannot delete protected business data' })
      return
    }
    setShowDeleteModal(true)
    setDeleteConfirmPhase('dry-run')
    setDeleteDryRunResult(null)
    setDeleteConfirmation('')
  }

  if (loading) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent border-solid animate-spin rounded-full mx-auto mb-4"></div>
            <p className="text-slate-600 dark:text-slate-400">Loading...</p>
          </div>
        </div>
      </AuthGuard>
    )
  }

  if (!isAdmin) {
    return null
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-[#f8fafc] dark:bg-background flex flex-col">
        <AppHeader showNavigation={true} />
        
        <div className="flex-1 p-4 sm:p-6 lg:p-8 pb-24 relative z-10">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-foreground">
                Admin Support Dashboard
              </h1>
              <span className="px-3 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-sm font-medium rounded-full">
                Admin Only
              </span>
            </div>

            {/* Metrics Dashboard */}
            {!metricsLoading && metrics && (
              <div className="space-y-6">
                {/* Needs Attention Section */}
                {(metrics.provisioningFailures?.count > 0 ||
                  metrics.billingIssues?.count > 0 ||
                  metrics.trialsExpiringSoon?.count > 0 ||
                  metrics.onboardingIssues?.count > 0) && (
                  <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-xl p-4">
                    <h2 className="text-lg font-semibold text-red-900 dark:text-red-100 mb-3">
                      Needs Attention
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {metrics.provisioningFailures?.count > 0 && (
                        <div className="bg-white dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3">
                          <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                            {metrics.provisioningFailures.count}
                          </p>
                          <p className="text-sm text-red-700 dark:text-red-300">Provisioning Failed</p>
                        </div>
                      )}
                      {metrics.billingIssues?.count > 0 && (
                        <div className="bg-white dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3">
                          <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                            {metrics.billingIssues.count}
                          </p>
                          <p className="text-sm text-red-700 dark:text-red-300">Billing Issues</p>
                        </div>
                      )}
                      {metrics.trialsExpiringSoon?.count > 0 && (
                        <div className="bg-white dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                            {metrics.trialsExpiringSoon.count}
                          </p>
                          <p className="text-sm text-amber-700 dark:text-amber-300">Trials Expiring Soon</p>
                        </div>
                      )}
                      {metrics.onboardingIssues?.count > 0 && (
                        <div className="bg-white dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                            {metrics.onboardingIssues.count}
                          </p>
                          <p className="text-sm text-amber-700 dark:text-amber-300">Onboarding Issues</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Metrics Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white dark:bg-card border border-slate-200 dark:border-border rounded-xl p-4 shadow-sm">
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Active Businesses</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-foreground">
                      {metrics.activeBusinesses}
                    </p>
                  </div>
                  <div className="bg-white dark:bg-card border border-slate-200 dark:border-border rounded-xl p-4 shadow-sm">
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Trials Expiring (7d)</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-foreground">
                      {metrics.trialsExpiringSoon?.count || 0}
                    </p>
                  </div>
                  <div className="bg-white dark:bg-card border border-slate-200 dark:border-border rounded-xl p-4 shadow-sm">
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Onboarding Issues</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-foreground">
                      {metrics.onboardingIssues?.count || 0}
                    </p>
                  </div>
                  <div className="bg-white dark:bg-card border border-slate-200 dark:border-border rounded-xl p-4 shadow-sm">
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Provisioning Failures</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-foreground">
                      {metrics.provisioningFailures?.count || 0}
                    </p>
                  </div>
                  <div className="bg-white dark:bg-card border border-slate-200 dark:border-border rounded-xl p-4 shadow-sm">
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">AI Call Failures (24h)</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-foreground">
                      {metrics.aiCallFailures?.count || 0}
                    </p>
                  </div>
                  <div className="bg-white dark:bg-card border border-slate-200 dark:border-border rounded-xl p-4 shadow-sm">
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">SMS Failures (24h)</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-foreground">
                      {metrics.smsFailures?.count || 0}
                    </p>
                  </div>
                  <div className="bg-white dark:bg-card border border-slate-200 dark:border-border rounded-xl p-4 shadow-sm">
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Billing Issues</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-foreground">
                      {metrics.billingIssues?.count || 0}
                    </p>
                  </div>
                  <div className="bg-white dark:bg-card border border-slate-200 dark:border-border rounded-xl p-4 shadow-sm">
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Voicemail Failures</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-foreground">
                      {metrics.personalVoicemailFailures?.count || 0}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Search Section */}
            <div className="bg-white dark:bg-card border border-slate-200 dark:border-border rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-foreground">
                  Search Businesses
                </h2>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                >
                  {showFilters ? 'Hide Filters' : 'Show Filters'}
                </button>
              </div>

              {showFilters && (
                <div className="mb-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Filter by Status
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: 'all', label: 'All' },
                      { value: 'active', label: 'Active' },
                      { value: 'trialing', label: 'Trialing' },
                      { value: 'past_due', label: 'Past Due' },
                      { value: 'cancelled', label: 'Cancelled' },
                      { value: 'onboarding_incomplete', label: 'Onboarding Incomplete' },
                      { value: 'provisioning_failed', label: 'Provisioning Failed' },
                      { value: 'forwarding_not_verified', label: 'Forwarding Not Verified' },
                      { value: 'trials_expiring_soon', label: 'Trials Expiring Soon' }
                    ].map((filter) => (
                      <button
                        key={filter.value}
                        onClick={() => setSelectedFilter(filter.value)}
                        className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                          selectedFilter === filter.value
                            ? 'bg-blue-600 text-white'
                            : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600'
                        }`}
                      >
                        {filter.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by business name, email, or phone number..."
                  className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-foreground"
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                />
                <button
                  onClick={handleSearch}
                  disabled={searchLoading}
                  className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {searchLoading ? 'Searching...' : 'Search'}
                </button>
              </div>

              {searchResults.length > 0 && (
                <div className="mt-4 space-y-2">
                  <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Results ({searchResults.length})
                  </h3>
                  {searchResults.map((business) => {
                    const issues = getBusinessIssueIndicator(business)
                    return (
                      <div
                        key={business.id}
                        onClick={() => handleSelectBusiness(business)}
                        className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-slate-900 dark:text-foreground truncate">{business.business_name}</p>
                              {issues.length > 0 && (
                                <span className="flex-shrink-0 px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs font-medium rounded-full">
                                  {issues.length} issue{issues.length > 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-slate-600 dark:text-slate-400">{business.business_phone}</p>
                            {issues.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {issues.map((issue, idx) => (
                                  <span key={idx} className="text-xs text-red-600 dark:text-red-400">
                                    • {issue}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="text-right ml-4">
                            <p className="text-xs text-slate-500 dark:text-slate-500 capitalize">{business.subscription_status}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-500 capitalize">{business.onboarding_status}</p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Action Result */}
            {actionResult && (
              <div className={`p-4 rounded-lg ${actionResult.success ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'}`}>
                <p className={`text-sm ${actionResult.success ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                  {actionResult.message}
                </p>
              </div>
            )}

            {/* Business Details */}
            {selectedBusiness && (
              <div className="bg-white dark:bg-card border border-slate-200 dark:border-border rounded-xl shadow-sm overflow-hidden">
                {businessDetailLoading ? (
                  <div className="p-6 text-center">
                    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent border-solid animate-spin rounded-full mx-auto mb-4"></div>
                    <p className="text-slate-600 dark:text-slate-400">Loading business details...</p>
                  </div>
                ) : (
                  <>
                    {/* Support Summary */}
                    <div className="p-6 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h2 className="text-xl font-semibold text-slate-900 dark:text-foreground mb-1">
                            {selectedBusiness.business_name}
                          </h2>
                          <p className="text-sm text-slate-600 dark:text-slate-400">
                            {businessDetail?.business?.owner_email || 'Owner email not available'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {(() => {
                            const health = getBusinessHealthState(selectedBusiness, businessDetail)
                            const colors = {
                              red: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
                              amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
                              green: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                            }
                            return (
                              <span className={`px-3 py-1 rounded-full text-sm font-medium ${colors[health.color as keyof typeof colors]}`}>
                                {health.state}
                              </span>
                            )
                          })()}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-slate-500 dark:text-slate-500">Account Age</p>
                          <p className="text-slate-900 dark:text-foreground">
                            {new Date(selectedBusiness.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-500 dark:text-slate-500">Subscription</p>
                          <p className="text-slate-900 dark:text-foreground capitalize">
                            {selectedBusiness.subscription_status}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-500 dark:text-slate-500">Trial/Period End</p>
                          <p className="text-slate-900 dark:text-foreground">
                            {selectedBusiness.trial_end_date
                              ? new Date(selectedBusiness.trial_end_date).toLocaleDateString()
                              : selectedBusiness.current_period_end
                              ? new Date(selectedBusiness.current_period_end).toLocaleDateString()
                              : 'Not set'}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-500 dark:text-slate-500">Issues</p>
                          <p className="text-slate-900 dark:text-foreground">
                            {getBusinessIssueIndicator(selectedBusiness).length} detected
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Recommended Action */}
                    <div className="p-6 border-b border-slate-200 dark:border-slate-700">
                      {(() => {
                        const recommendation = getRecommendedAction(selectedBusiness, businessDetail)
                        return (
                          <div className={`rounded-lg p-4 ${
                            recommendation.action ? 'bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800' : 'bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800'
                          }`}>
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <h3 className="font-semibold text-slate-900 dark:text-foreground mb-1">
                                  {recommendation.title}
                                </h3>
                                <p className="text-sm text-slate-600 dark:text-slate-400">
                                  {recommendation.description}
                                </p>
                              </div>
                              {recommendation.action && (
                                <button
                                  onClick={() => handleAdminAction(recommendation.action, selectedBusiness.id)}
                                  disabled={actionLoading}
                                  className="ml-4 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                  {recommendation.actionLabel}
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })()}
                    </div>

                    {/* Operational Sections */}
                    <div className="p-6 space-y-6">
                      {/* Account Section */}
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground mb-3 uppercase tracking-wide">
                          Account
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                          <div>
                            <p className="text-slate-500 dark:text-slate-500">Business ID</p>
                            <p className="text-slate-900 dark:text-foreground font-mono text-xs">
                              {selectedBusiness.id.slice(0, 8)}...
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500 dark:text-slate-500">User ID</p>
                            <p className="text-slate-900 dark:text-foreground font-mono text-xs">
                              {selectedBusiness.user_id.slice(0, 8)}...
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500 dark:text-slate-500">Created</p>
                            <p className="text-slate-900 dark:text-foreground">
                              {new Date(selectedBusiness.created_at).toLocaleString()}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500 dark:text-slate-500">Onboarding Status</p>
                            <p className="text-slate-900 dark:text-foreground capitalize">
                              {selectedBusiness.onboarding_status}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500 dark:text-slate-500">Business Type</p>
                            <p className="text-slate-900 dark:text-foreground">
                              {selectedBusiness.business_type}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500 dark:text-slate-500">Protected</p>
                            <p className="text-slate-900 dark:text-foreground">
                              {selectedBusiness.is_protected_account ? `Yes (${selectedBusiness.protected_reason})` : 'No'}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Billing Section */}
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground mb-3 uppercase tracking-wide">
                          Billing
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                          <div>
                            <p className="text-slate-500 dark:text-slate-500">Status</p>
                            <p className="text-slate-900 dark:text-foreground capitalize">
                              {selectedBusiness.subscription_status}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500 dark:text-slate-500">Customer ID</p>
                            <p className="text-slate-900 dark:text-foreground font-mono text-xs">
                              {selectedBusiness.stripe_customer_id?.slice(0, 8) || 'Not set'}...
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500 dark:text-slate-500">Subscription ID</p>
                            <p className="text-slate-900 dark:text-foreground font-mono text-xs">
                              {selectedBusiness.stripe_subscription_id?.slice(0, 8) || 'Not set'}...
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500 dark:text-slate-500">Trial End</p>
                            <p className="text-slate-900 dark:text-foreground">
                              {selectedBusiness.trial_end_date ? new Date(selectedBusiness.trial_end_date).toLocaleDateString() : 'Not set'}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500 dark:text-slate-500">Period End</p>
                            <p className="text-slate-900 dark:text-foreground">
                              {selectedBusiness.current_period_end ? new Date(selectedBusiness.current_period_end).toLocaleDateString() : 'Not set'}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500 dark:text-slate-500">Manual Access</p>
                            <p className="text-slate-900 dark:text-foreground">
                              {getManualAccessStatusText(selectedBusiness)}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Phone & Provisioning Section */}
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground mb-3 uppercase tracking-wide">
                          Phone & Provisioning
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                          <div>
                            <p className="text-slate-500 dark:text-slate-500">Business Phone</p>
                            <p className="text-slate-900 dark:text-foreground">
                              {selectedBusiness.business_phone}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500 dark:text-slate-500">ReplyFlow Number</p>
                            <p className="text-slate-900 dark:text-foreground">
                              {selectedBusiness.twilio_phone_number || 'Not set'}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500 dark:text-slate-500">Provisioning Status</p>
                            <p className="text-slate-900 dark:text-foreground capitalize">
                              {selectedBusiness.provisioning_status || 'Not set'}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500 dark:text-slate-500">A2P Status</p>
                            <p className="text-slate-900 dark:text-foreground">
                              {selectedBusiness.a2p_status || 'Not set'}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500 dark:text-slate-500">Call Forwarding</p>
                            <p className="text-slate-900 dark:text-foreground">
                              {selectedBusiness.call_forwarding_enabled ? 'Enabled' : 'Disabled'}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500 dark:text-slate-500">Twilio Phone SID</p>
                            <p className="text-slate-900 dark:text-foreground font-mono text-xs">
                              {selectedBusiness.twilio_phone_number_sid?.slice(0, 8) || 'Not set'}...
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* AI Voice Section */}
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground mb-3 uppercase tracking-wide">
                          AI Voice
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                          <div>
                            <p className="text-slate-500 dark:text-slate-500">Latest Call</p>
                            <p className="text-slate-900 dark:text-foreground">
                              {businessDetail?.aiCall?.created_at ? new Date(businessDetail.aiCall.created_at).toLocaleString() : 'No calls'}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500 dark:text-slate-500">Latest Outcome</p>
                            <p className="text-slate-900 dark:text-foreground capitalize">
                              {businessDetail?.aiCall?.ai_call_status || 'N/A'}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500 dark:text-slate-500">Recent Failures (24h)</p>
                            <p className="text-slate-900 dark:text-foreground">
                              {businessDetail?.aiFailureCount || 0}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Messaging Section */}
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground mb-3 uppercase tracking-wide">
                          Messaging
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                          <div>
                            <p className="text-slate-500 dark:text-slate-500">Latest SMS</p>
                            <p className="text-slate-900 dark:text-foreground">
                              {businessDetail?.sms?.created_at ? new Date(businessDetail.sms.created_at).toLocaleString() : 'No messages'}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500 dark:text-slate-500">Latest Status</p>
                            <p className="text-slate-900 dark:text-foreground capitalize">
                              {businessDetail?.sms?.status || 'N/A'}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500 dark:text-slate-500">Recent Failures (24h)</p>
                            <p className="text-slate-900 dark:text-foreground">
                              {businessDetail?.smsFailureCount || 0}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Recent Events Section */}
                      {businessDetail?.recentEvents && businessDetail.recentEvents.length > 0 && (
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground mb-3 uppercase tracking-wide">
                            Recent Events
                          </h3>
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {businessDetail.recentEvents.slice(0, 10).map((event: any, idx: number) => (
                              <div key={idx} className="text-sm p-2 bg-slate-50 dark:bg-slate-800/50 rounded border border-slate-200 dark:border-slate-700">
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-900 dark:text-foreground">{event.event_type || 'Event'}</span>
                                  <span className="text-slate-500 dark:text-slate-500 text-xs">
                                    {new Date(event.created_at).toLocaleString()}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Admin Actions */}
                    <div className="p-6 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground mb-3 uppercase tracking-wide">
                        Quick Actions
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                        <button
                          onClick={() => handleAdminAction('retry_provisioning', selectedBusiness.id)}
                          disabled={actionLoading}
                          className="px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Retry Provisioning
                        </button>
                        <button
                          onClick={() => handleAdminAction('refresh_subscription', selectedBusiness.id)}
                          disabled={actionLoading}
                          className="px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Refresh Subscription
                        </button>
                        <button
                          onClick={() => handleAdminAction('view_stripe_portal', selectedBusiness.id)}
                          disabled={actionLoading}
                          className="px-3 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Stripe Portal
                        </button>
                        <button
                          onClick={() => {
                            setManualAccessAction(selectedBusiness.manual_access_enabled ? 'revoke' : 'grant')
                            setShowManualAccessModal(true)
                          }}
                          disabled={actionLoading}
                          className="px-3 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {selectedBusiness.manual_access_enabled ? 'Revoke Access' : 'Grant Access'}
                        </button>
                        <button
                          onClick={() => handleAdminAction('reconcile_messaging_service', selectedBusiness.id)}
                          disabled={actionLoading}
                          className="px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Reconcile Messaging
                        </button>
                        <button
                          onClick={() => handleAdminAction('mark_forwarding_verified', selectedBusiness.id)}
                          disabled={actionLoading}
                          className="px-3 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Mark Forwarding Verified
                        </button>
                        <button
                          onClick={() => {
                            setProtectAction(selectedBusiness.is_protected_account ? 'unprotect' : 'protect')
                            setShowProtectModal(true)
                          }}
                          disabled={actionLoading}
                          className={`px-3 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                            selectedBusiness.is_protected_account
                              ? 'bg-red-600 hover:bg-red-700'
                              : 'bg-green-600 hover:bg-green-700'
                          }`}
                        >
                          {selectedBusiness.is_protected_account ? 'Unprotect' : 'Protect'}
                        </button>
                        <button
                          onClick={handleOpenDeleteModal}
                          disabled={actionLoading || selectedBusiness.is_protected_account === true}
                          className="px-3 py-2 bg-red-700 text-white text-sm font-medium rounded-lg hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Delete Test Data
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Manual Access Modal */}
            {showManualAccessModal && selectedBusiness && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-4">
                    {manualAccessAction === 'grant' ? 'Grant Manual Access' : 'Revoke Manual Access'}
                  </h3>
                  
                  {manualAccessAction === 'grant' ? (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                          Duration
                        </label>
                        <select
                          value={manualAccessDuration}
                          onChange={(e) => setManualAccessDuration(e.target.value as any)}
                          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-foreground"
                        >
                          <option value="lifetime">Lifetime</option>
                          <option value="7d">7 days</option>
                          <option value="14d">14 days</option>
                          <option value="30d">30 days</option>
                          <option value="60d">60 days</option>
                          <option value="90d">90 days</option>
                          <option value="custom">Custom date</option>
                        </select>
                      </div>

                      {manualAccessDuration === 'custom' && (
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                            Expiration Date
                          </label>
                          <input
                            type="date"
                            value={manualAccessCustomDate}
                            onChange={(e) => setManualAccessCustomDate(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-foreground"
                          />
                        </div>
                      )}

                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                          Reason
                        </label>
                        <select
                          value={manualAccessReason}
                          onChange={(e) => setManualAccessReason(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-foreground"
                        >
                          <option value="">Select reason...</option>
                          <option value="family_tester">Family tester</option>
                          <option value="friend">Friend</option>
                          <option value="early_user">Early user</option>
                          <option value="promo">Promotional access</option>
                          <option value="internal">Internal account</option>
                          <option value="support_exception">Support exception</option>
                          <option value="other">Other</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                          Note (optional)
                        </label>
                        <textarea
                          value={manualAccessNote}
                          onChange={(e) => setManualAccessNote(e.target.value)}
                          placeholder="Add any additional notes..."
                          rows={3}
                          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-foreground"
                        />
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Are you sure you want to revoke manual access for this business?
                    </p>
                  )}

                  <div className="flex justify-end gap-3 mt-6">
                    <button
                      onClick={() => setShowManualAccessModal(false)}
                      disabled={actionLoading}
                      className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleManualAccess}
                      disabled={actionLoading}
                      className="px-4 py-2 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {actionLoading ? 'Processing...' : (manualAccessAction === 'grant' ? 'Grant Access' : 'Revoke Access')}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Protect Account Modal */}
            {showProtectModal && selectedBusiness && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-4">
                    {protectAction === 'protect' ? 'Protect Account' : 'Unprotect Account'}
                  </h3>
                  
                  {protectAction === 'protect' ? (
                    <div className="space-y-4">
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        Protected businesses are skipped by cleanup/reset operations. This is useful for admin accounts or important test data.
                      </p>
                      
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                          Reason
                        </label>
                        <select
                          value={protectReason}
                          onChange={(e) => setProtectReason(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-foreground"
                        >
                          <option value="">Select reason...</option>
                          <option value="admin_account">Admin account</option>
                          <option value="production_customer">Production customer</option>
                          <option value="important_test">Important test data</option>
                          <option value="demo_account">Demo account</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        Are you sure you want to unprotect this account? It will no longer be excluded from cleanup/reset operations.
                      </p>
                      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                        <p className="text-sm text-amber-800 dark:text-amber-300">
                          <strong>Warning:</strong> This business will be included in future cleanup/reset operations.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end gap-3 mt-6">
                    <button
                      onClick={() => setShowProtectModal(false)}
                      disabled={actionLoading}
                      className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleProtect}
                      disabled={actionLoading || (protectAction === 'protect' && !protectReason)}
                      className={`px-4 py-2 text-white font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                        protectAction === 'protect'
                          ? 'bg-green-600 hover:bg-green-700'
                          : 'bg-red-600 hover:bg-red-700'
                      }`}
                    >
                      {actionLoading ? 'Processing...' : (protectAction === 'protect' ? 'Protect Account' : 'Unprotect Account')}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Delete Test Business Data Modal */}
            {showDeleteModal && selectedBusiness && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-2xl w-full mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-4">
                    Delete Test Business Data
                  </h3>

                  {deleteConfirmPhase === 'dry-run' && (
                    <div className="space-y-4">
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        This will show you what data would be deleted. You'll need to confirm before the actual deletion.
                      </p>

                      <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-foreground mb-3">Business Details</h4>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-xs text-slate-500 dark:text-slate-500">Business Name</p>
                            <p className="text-slate-900 dark:text-foreground">{selectedBusiness.business_name}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 dark:text-slate-500">Business Phone</p>
                            <p className="text-slate-900 dark:text-foreground">{selectedBusiness.business_phone}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 dark:text-slate-500">ReplyFlow Number</p>
                            <p className="text-slate-900 dark:text-foreground">{selectedBusiness.twilio_phone_number || 'Not set'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 dark:text-slate-500">Twilio SID</p>
                            <p className="text-slate-900 dark:text-foreground font-mono text-xs">{selectedBusiness.twilio_phone_number_sid || 'Not set'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 dark:text-slate-500">Stripe Customer ID</p>
                            <p className="text-slate-900 dark:text-foreground font-mono text-xs">{selectedBusiness.stripe_customer_id || 'Not set'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 dark:text-slate-500">Stripe Subscription ID</p>
                            <p className="text-slate-900 dark:text-foreground font-mono text-xs">{selectedBusiness.stripe_subscription_id || 'Not set'}</p>
                          </div>
                        </div>
                      </div>

                      {deleteDryRunResult && (
                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                          <h4 className="text-sm font-semibold text-slate-900 dark:text-foreground mb-3">Records to be Deleted</h4>
                          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                            Total: {deleteDryRunResult.totalRecords} records
                          </p>
                          <div className="space-y-2">
                            {deleteDryRunResult.summary.map((item: any) => (
                              <div key={item.table} className="flex justify-between text-sm">
                                <span className="text-slate-700 dark:text-slate-300">{item.description}</span>
                                <span className="font-medium text-slate-900 dark:text-foreground">{item.count}</span>
                              </div>
                            ))}
                          </div>
                          {deleteDryRunResult.warnings && deleteDryRunResult.warnings.length > 0 && (
                            <div className="mt-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded p-2">
                              {deleteDryRunResult.warnings.map((warning: string, idx: number) => (
                                <p key={idx} className="text-xs text-amber-800 dark:text-amber-300">{warning}</p>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {selectedBusiness.call_forwarding_enabled && (
                        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                          <p className="text-sm text-amber-800 dark:text-amber-300">
                            <strong>Warning:</strong> Call forwarding is enabled for this business. You must manually disable call forwarding on {selectedBusiness.business_phone} after deletion to prevent misdirected calls.
                          </p>
                        </div>
                      )}

                      {deleteDryRunResult && deleteDryRunResult.affectedTwilioNumbers && deleteDryRunResult.affectedTwilioNumbers.length > 0 && (
                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                          <p className="text-sm text-blue-800 dark:text-blue-300">
                            <strong>Note:</strong> The ReplyFlow number(s) will be detached from this business and made available for reassignment, but will NOT be released from Twilio. The Twilio SID and Messaging Service attachment will be preserved.
                          </p>
                        </div>
                      )}

                      <div className="flex justify-end gap-3">
                        <button
                          onClick={() => {
                            setShowDeleteModal(false)
                            setDeleteConfirmPhase('dry-run')
                            setDeleteDryRunResult(null)
                          }}
                          disabled={deleteLoading}
                          className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleDeleteTestBusinessData}
                          disabled={deleteLoading}
                          className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {deleteLoading ? 'Loading...' : 'Show Preview'}
                        </button>
                      </div>
                    </div>
                  )}

                  {deleteConfirmPhase === 'confirm' && deleteDryRunResult && (
                    <div className="space-y-4">
                      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                        <h4 className="text-sm font-semibold text-red-900 dark:text-red-400 mb-2">Confirm Deletion</h4>
                        <p className="text-sm text-red-800 dark:text-red-300">
                          You are about to delete {deleteDryRunResult.totalRecords} records for this business. This action cannot be undone.
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                          Type to confirm: <code className="bg-slate-100 dark:bg-slate-900 px-2 py-1 rounded">I confirm full deletion of this test business</code>
                        </label>
                        <input
                          type="text"
                          value={deleteConfirmation}
                          onChange={(e) => setDeleteConfirmation(e.target.value)}
                          placeholder="Type the confirmation phrase above"
                          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-foreground"
                        />
                      </div>

                      <div className="flex justify-end gap-3">
                        <button
                          onClick={() => {
                            setDeleteConfirmPhase('dry-run')
                            setDeleteConfirmation('')
                          }}
                          disabled={deleteLoading}
                          className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Back
                        </button>
                        <button
                          onClick={handleDeleteTestBusinessData}
                          disabled={deleteLoading || deleteConfirmation !== 'I confirm full deletion of this test business'}
                          className="px-4 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {deleteLoading ? 'Deleting...' : 'Confirm Deletion'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AuthGuard>
  )
}
