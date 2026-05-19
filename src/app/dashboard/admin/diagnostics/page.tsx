'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'
import { useAuth } from '@/contexts/AuthContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { isAdminUser } from '@/lib/admin'
import AuthGuard from '@/components/AuthGuard'
import BusinessGuard from '@/components/BusinessGuard'
import Navigation from '@/components/Navigation'
import UserDropdown from '@/components/UserDropdown'
import MobileMenu from '@/components/MobileMenu'
import AppHeader from '@/components/AppHeader'
import { reconcileWarmNumbers, getWarmInventoryStats } from '@/app/admin/actions'

export default function AdminDiagnosticsPage() {
  const router = useRouter()
  const { business } = useBusiness()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  
  // Warm number inventory stats
  const [stats, setStats] = useState<{ success: boolean; stats?: any; error?: any } | null>(null)
  const [refreshingStats, setRefreshingStats] = useState(false)
  
  // Reconciliation result
  const [reconciling, setReconciling] = useState(false)
  const [reconciliationResult, setReconciliationResult] = useState<{ success: boolean; data?: any; error?: string } | null>(null)
  
  const supabase = createBrowserClient()

  useEffect(() => {
    const checkAdminAndLoadData = async () => {
      if (!user?.email) return
      
      const adminCheck = isAdminUser(user.email)
      if (!adminCheck) {
        router.push('/dashboard')
        return
      }
      
      setIsAdmin(true)
      await loadWarmNumberStats()
      setLoading(false)
    }

    checkAdminAndLoadData()
  }, [user, router])

  const loadWarmNumberStats = async () => {
    try {
      const result = await getWarmInventoryStats()
      setStats(result)
    } catch (error) {
      console.error('[Admin Diagnostics] Error loading warm number stats:', error)
    }
  }

  const handleRefreshStats = async () => {
    setRefreshingStats(true)
    await loadWarmNumberStats()
    setRefreshingStats(false)
  }

  const handleReconcileWarmNumbers = async () => {
    setReconciling(true)
    setReconciliationResult(null)
    
    try {
      const result = await reconcileWarmNumbers()
      setReconciliationResult(result)
      await loadWarmNumberStats()
    } catch (error: any) {
      setReconciliationResult({ success: false, error: error.message })
    } finally {
      setReconciling(false)
    }
  }

  const handleRetryProvisioning = async () => {
    if (!business?.id) return
    
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'https://replyflowhq.com'
    
    try {
      const response = await fetch(`${appUrl}/api/business/retry-provisioning`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business.id }),
      })

      const result = await response.json()

      if (result.success) {
        alert('Provisioning retry initiated successfully')
        window.location.reload()
      } else {
        alert(`Provisioning retry failed: ${result.error}`)
      }
    } catch (error: any) {
      alert(`Provisioning retry failed: ${error.message}`)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p>Loading...</p>
      </div>
    )
  }

  if (!isAdmin) {
    return null
  }

  return (
    <AuthGuard>
      <BusinessGuard>
        <div className="min-h-screen bg-background">
          <Navigation />
          <div className="lg:pl-64">
            <AppHeader />
            <main className="p-8">
              <div className="max-w-7xl mx-auto">
                <div className="mb-8">
                  <h1 className="text-3xl font-bold text-foreground mb-2">Admin Diagnostics</h1>
                  <p className="text-muted-foreground">Technical provisioning, Twilio status, webhook diagnostics, and onboarding health</p>
                </div>

                <div className="space-y-6">
                  {/* Provisioning Status */}
                  <div className="bg-card border border-border rounded-lg p-6">
                    <h2 className="text-xl font-semibold text-foreground mb-4">Provisioning Status</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm text-muted-foreground">Status</label>
                        <p className={`font-mono font-medium ${
                          business?.provisioning_status === 'active' ? 'text-green-600' : 
                          business?.provisioning_status === 'failed' ? 'text-red-600' : 
                          business?.provisioning_status === 'assigned' ? 'text-blue-600' : 
                          business?.provisioning_status === 'ready' ? 'text-yellow-600' : 
                          'text-muted-foreground'
                        }`}>
                          {business?.provisioning_status || 'N/A'}
                        </p>
                      </div>
                      <div>
                        <label className="text-sm text-muted-foreground">Twilio SID</label>
                        <p className="font-mono text-foreground" title={business?.twilio_phone_number_sid || 'N/A'}>
                          {business?.twilio_phone_number_sid || 'N/A'}
                        </p>
                      </div>
                      <div>
                        <label className="text-sm text-muted-foreground">Phone Number</label>
                        <p className="font-mono text-foreground">{business?.twilio_phone_number || 'N/A'}</p>
                      </div>
                      {business?.provisioning_error && (
                        <div className="col-span-full">
                          <label className="text-sm text-muted-foreground">Error</label>
                          <p className="font-mono text-red-600 text-sm">{business.provisioning_error}</p>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={handleRetryProvisioning}
                      disabled={!business?.id}
                      className="mt-4 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-md font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Retry Provisioning
                    </button>
                  </div>

                  {/* Warm Number Inventory */}
                  <div className="bg-card border border-border rounded-lg p-6">
                    <h2 className="text-xl font-semibold text-foreground mb-4">Warm Number Inventory</h2>
                    {stats?.success ? (
                      <div className="grid grid-cols-3 gap-4 mb-4">
                        <div className="bg-muted rounded-lg p-4">
                          <p className="text-sm text-muted-foreground mb-1">Available</p>
                          <p className={`text-2xl font-bold ${
                            stats.stats.availableCount > 0 ? 'text-green-600' : 'text-muted-foreground'
                          }`}>
                            {stats.stats.availableCount}
                          </p>
                        </div>
                        <div className="bg-muted rounded-lg p-4">
                          <p className="text-sm text-muted-foreground mb-1">Assigned</p>
                          <p className="text-2xl font-bold text-blue-600">
                            {stats.stats.assignedCount}
                          </p>
                        </div>
                        <div className="bg-muted rounded-lg p-4">
                          <p className="text-sm text-muted-foreground mb-1">Failed</p>
                          <p className={`text-2xl font-bold ${
                            stats.stats.failedCount > 0 ? 'text-red-600' : 'text-muted-foreground'
                          }`}>
                            {stats.stats.failedCount}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-muted-foreground mb-4">Loading stats...</p>
                    )}
                    <button
                      onClick={handleRefreshStats}
                      disabled={refreshingStats}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-md font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {refreshingStats ? 'Refreshing...' : 'Refresh Stats'}
                    </button>
                  </div>

                  {/* Recovery / Repair */}
                  <div className="bg-card border border-border rounded-lg p-6">
                    <h2 className="text-xl font-semibold text-foreground mb-4">Recovery / Repair</h2>
                    <button
                      onClick={handleReconcileWarmNumbers}
                      disabled={reconciling}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-md font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {reconciling ? 'Reconciling...' : 'Reconcile Warm Numbers'}
                    </button>

                    {reconciliationResult && (
                      <div className="mt-4 p-4 bg-muted rounded-lg">
                        {reconciliationResult.success ? (
                          <div className="text-green-600">
                            <p className="font-semibold mb-2">Reconciliation Complete</p>
                            <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                              <div>Checked: {reconciliationResult.data.checked_count}</div>
                              <div>Kept: {reconciliationResult.data.kept_available_count}</div>
                              <div>Failed: {reconciliationResult.data.marked_failed_count}</div>
                              <div>Replenished: {reconciliationResult.data.replenished_count}</div>
                            </div>
                            <p className="text-sm text-muted-foreground mt-2">Available After: {reconciliationResult.data.available_after}</p>
                          </div>
                        ) : (
                          <p className="text-red-600">Error: {reconciliationResult.error}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </main>
          </div>
        </div>
      </BusinessGuard>
    </AuthGuard>
  )
}
