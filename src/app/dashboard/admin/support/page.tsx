'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import AuthGuard from '@/components/AuthGuard'
import Navigation from '@/components/Navigation'
import UserDropdown from '@/components/UserDropdown'
import MobileMenu from '@/components/MobileMenu'
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
  const { user } = useAuth()
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

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    
    setSearchLoading(true)
    try {
      const response = await fetch(`/api/admin/search-businesses?query=${encodeURIComponent(searchQuery)}`)
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

  const handleSelectBusiness = (business: Business) => {
    setSelectedBusiness(business)
    setActionResult(null)
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
    if (!selectedBusiness) return

    if (deleteConfirmPhase === 'dry-run') {
      setDeleteLoading(true)
      try {
        const token = await user?.getIdToken()
        const response = await fetch('/api/admin/reset-test-data', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            mode: 'dry-run',
            filterType: 'businessId',
            filterValue: selectedBusiness.id
          })
        })

        const data = await response.json()
        if (data.blocked) {
          setActionResult({ success: false, message: data.blockReason || 'Operation blocked' })
        } else {
          setDeleteDryRunResult(data)
          setDeleteConfirmPhase('confirm')
        }
      } catch (error) {
        setActionResult({ success: false, message: 'Failed to get dry-run preview' })
      } finally {
        setDeleteLoading(false)
      }
    } else {
      setDeleteLoading(true)
      try {
        const token = await user?.getIdToken()
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
          setActionResult({ success: true, message: `Successfully deleted ${data.totalRecords} records` })
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

            {/* Search Section */}
            <div className="bg-white dark:bg-card border border-slate-200 dark:border-border rounded-xl p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-4">
                Search Businesses
              </h2>
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
                  {searchResults.map((business) => (
                    <div
                      key={business.id}
                      onClick={() => handleSelectBusiness(business)}
                      className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-slate-900 dark:text-foreground">{business.business_name}</p>
                          <p className="text-sm text-slate-600 dark:text-slate-400">{business.business_phone}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-slate-500 dark:text-slate-500">{business.subscription_status}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-500">{business.onboarding_status}</p>
                        </div>
                      </div>
                    </div>
                  ))}
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
              <div className="bg-white dark:bg-card border border-slate-200 dark:border-border rounded-xl p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-4">
                  Business Details
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-500 mb-1">Business Name</p>
                    <p className="text-sm text-slate-900 dark:text-foreground">{selectedBusiness.business_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-500 mb-1">Business Type</p>
                    <p className="text-sm text-slate-900 dark:text-foreground">{selectedBusiness.business_type}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-500 mb-1">Business Phone</p>
                    <p className="text-sm text-slate-900 dark:text-foreground">{selectedBusiness.business_phone}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-500 mb-1">ReplyFlow Phone</p>
                    <p className="text-sm text-slate-900 dark:text-foreground">{selectedBusiness.twilio_phone_number || 'Not set'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-500 mb-1">Twilio Phone SID</p>
                    <p className="text-sm text-slate-900 dark:text-foreground font-mono">{selectedBusiness.twilio_phone_number_sid || 'Not set'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-500 mb-1">Messaging Service SID</p>
                    <p className="text-sm text-slate-900 dark:text-foreground font-mono">{selectedBusiness.messaging_service_sid || 'Not set'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-500 mb-1">A2P Status</p>
                    <p className="text-sm text-slate-900 dark:text-foreground">{selectedBusiness.a2p_status || 'Not set'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-500 mb-1">Onboarding Status</p>
                    <p className="text-sm text-slate-900 dark:text-foreground">{selectedBusiness.onboarding_status}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-500 mb-1">Forwarding Verified</p>
                    <p className="text-sm text-slate-900 dark:text-foreground">{selectedBusiness.forwarding_verified ? 'Yes' : 'No'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-500 mb-1">Subscription Status</p>
                    <p className="text-sm text-slate-900 dark:text-foreground">{selectedBusiness.subscription_status}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-500 mb-1">Trial End Date</p>
                    <p className="text-sm text-slate-900 dark:text-foreground">{selectedBusiness.trial_end_date || 'Not set'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-500 mb-1">Period End</p>
                    <p className="text-sm text-slate-900 dark:text-foreground">{selectedBusiness.current_period_end || 'Not set'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-500 mb-1">Stripe Customer ID</p>
                    <p className="text-sm text-slate-900 dark:text-foreground font-mono">{selectedBusiness.stripe_customer_id || 'Not set'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-500 mb-1">Stripe Subscription ID</p>
                    <p className="text-sm text-slate-900 dark:text-foreground font-mono">{selectedBusiness.stripe_subscription_id || 'Not set'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-500 mb-1">Provisioning Status</p>
                    <p className="text-sm text-slate-900 dark:text-foreground">{selectedBusiness.provisioning_status || 'Not set'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-500 mb-1">Call Forwarding</p>
                    <p className="text-sm text-slate-900 dark:text-foreground">{selectedBusiness.call_forwarding_enabled ? 'Enabled' : 'Disabled'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-500 mb-1">Manual Access</p>
                    <p className="text-sm text-slate-900 dark:text-foreground font-medium">{getManualAccessStatusText(selectedBusiness)}</p>
                  </div>
                  {selectedBusiness.manual_access_enabled && (
                    <>
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-500 mb-1">Manual Access Reason</p>
                        <p className="text-sm text-slate-900 dark:text-foreground">{selectedBusiness.manual_access_reason || 'Not specified'}</p>
                      </div>
                      {selectedBusiness.manual_access_note && (
                        <div>
                          <p className="text-xs text-slate-500 dark:text-slate-500 mb-1">Manual Access Note</p>
                          <p className="text-sm text-slate-900 dark:text-foreground">{selectedBusiness.manual_access_note}</p>
                        </div>
                      )}
                    </>
                  )}
                  {selectedBusiness.twilio_phone_number && (
                    <>
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-500 mb-1">Twilio Release Status</p>
                        <p className="text-sm text-slate-900 dark:text-foreground font-medium">
                          {selectedBusiness.twilio_release_status === 'scheduled' && selectedBusiness.twilio_release_at
                            ? `Release scheduled for ${new Date(selectedBusiness.twilio_release_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`
                            : selectedBusiness.twilio_release_status === 'released' && selectedBusiness.twilio_released_at
                            ? `Released on ${new Date(selectedBusiness.twilio_released_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`
                            : selectedBusiness.twilio_release_status === 'retained'
                            ? 'Retained'
                            : selectedBusiness.twilio_release_status === 'reactivated'
                            ? 'Reactivated'
                            : 'Not scheduled'
                          }
                        </p>
                      </div>
                      {selectedBusiness.twilio_release_reason && (
                        <div>
                          <p className="text-xs text-slate-500 dark:text-slate-500 mb-1">Release Reason</p>
                          <p className="text-sm text-slate-900 dark:text-foreground">{selectedBusiness.twilio_release_reason}</p>
                        </div>
                      )}
                    </>
                  )}
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-500 mb-1">Protected Status</p>
                    <div className="flex items-center gap-2">
                      {selectedBusiness.is_protected_account ? (
                        <>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                            Protected
                          </span>
                          {selectedBusiness.protected_reason && (
                            <p className="text-sm text-slate-600 dark:text-slate-400">({selectedBusiness.protected_reason})</p>
                          )}
                        </>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300">
                          Not Protected
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Admin Actions */}
                <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-4">
                    Admin Actions
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <button
                      onClick={() => {
                        setManualAccessAction(selectedBusiness.manual_access_enabled ? 'revoke' : 'grant')
                        setShowManualAccessModal(true)
                      }}
                      disabled={actionLoading}
                      className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {selectedBusiness.manual_access_enabled ? 'Revoke Manual Access' : 'Grant Manual Access'}
                    </button>
                    <button
                      onClick={() => handleAdminAction('retry_provisioning', selectedBusiness.id)}
                      disabled={actionLoading}
                      className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Retry Provisioning
                    </button>
                    <button
                      onClick={() => handleAdminAction('reconcile_messaging_service', selectedBusiness.id)}
                      disabled={actionLoading}
                      className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Reconcile Messaging Service
                    </button>
                    <button
                      onClick={() => handleAdminAction('mark_forwarding_verified', selectedBusiness.id)}
                      disabled={actionLoading}
                      className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Mark Forwarding Verified
                    </button>
                    <button
                      onClick={() => handleAdminAction('reset_onboarding', selectedBusiness.id)}
                      disabled={actionLoading}
                      className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Reset Onboarding
                    </button>
                    <button
                      onClick={() => handleAdminAction('refresh_subscription', selectedBusiness.id)}
                      disabled={actionLoading}
                      className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Refresh Subscription
                    </button>
                    <button
                      onClick={() => handleAdminAction('view_stripe_portal', selectedBusiness.id)}
                      disabled={actionLoading}
                      className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      View Stripe Portal
                    </button>
                    <button
                      onClick={() => {
                        setProtectAction(selectedBusiness.is_protected_account ? 'unprotect' : 'protect')
                        setShowProtectModal(true)
                      }}
                      disabled={actionLoading}
                      className={`px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                        selectedBusiness.is_protected_account
                          ? 'bg-red-600 hover:bg-red-700'
                          : 'bg-green-600 hover:bg-green-700'
                      }`}
                    >
                      {selectedBusiness.is_protected_account ? 'Unprotect Account' : 'Protect Account'}
                    </button>
                    {selectedBusiness.twilio_phone_number && selectedBusiness.twilio_release_status === 'scheduled' && (
                      <>
                        <button
                          onClick={() => handleAdminAction('cancel_twilio_release', selectedBusiness.id)}
                          disabled={actionLoading}
                          className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Cancel Number Release
                        </button>
                        <button
                          onClick={() => handleAdminAction('extend_grace_period', selectedBusiness.id)}
                          disabled={actionLoading}
                          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Extend Grace Period (30 days)
                        </button>
                      </>
                    )}
                    {selectedBusiness.twilio_phone_number && !selectedBusiness.twilio_release_status && (
                      <button
                        onClick={() => handleAdminAction('release_twilio_number_now', selectedBusiness.id)}
                        disabled={actionLoading}
                        className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Release Number Now
                      </button>
                    )}
                    <button
                      onClick={handleOpenDeleteModal}
                      disabled={actionLoading || selectedBusiness.is_protected_account === true}
                      className="px-4 py-2 bg-red-700 text-white text-sm font-medium rounded-lg hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Delete Test Business Data
                    </button>
                  </div>
                </div>
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
