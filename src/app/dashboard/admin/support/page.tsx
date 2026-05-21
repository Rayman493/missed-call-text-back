'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { isAdminUser } from '@/lib/admin'
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
  created_at: string
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

  useEffect(() => {
    const checkAdmin = () => {
      if (!user?.email) return
      
      const adminCheck = isAdminUser(user.email)
      if (!adminCheck) {
        router.push('/dashboard')
        return
      }
      
      setIsAdmin(true)
      setLoading(false)
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
        // Refresh business data
        if (selectedBusiness?.id === businessId) {
          const updatedBusiness = searchResults.find(b => b.id === businessId)
          if (updatedBusiness) {
            setSelectedBusiness(updatedBusiness)
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
      <div className="min-h-screen bg-gradient-to-br from-[#f8fafc] via-[#f3f6fb] to-[#f1f5f9] dark:from-background dark:via-slate-900/40 dark:to-background flex flex-col">
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
                </div>

                {/* Admin Actions */}
                <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-4">
                    Admin Actions
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AuthGuard>
  )
}
