'use client'

import { useState } from 'react'

export default function ReplenishWarmNumbersPage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const handleReplenish = async () => {
    setLoading(true)
    setResult(null)
    setError(null)

    try {
      const adminSecret = prompt('Enter admin secret:')
      
      if (!adminSecret) {
        setError('Admin secret is required')
        setLoading(false)
        return
      }

      const response = await fetch('/api/admin/replenish-warm-numbers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': adminSecret,
        },
      })

      const data = await response.json()

      if (response.ok) {
        setResult(data)
      } else {
        setError(data.error || 'Failed to replenish warm numbers')
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Replenish Warm Numbers (Dev Only)</h1>
        
        <div className="bg-card border border-border rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Manual Warm Number Replenishment</h2>
          <p className="text-muted-foreground mb-4">
            This will check the current available warm numbers and provision enough new numbers 
            to restore the minimum of 2 available warm numbers.
          </p>
          
          <button
            onClick={handleReplenish}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Replenishing...' : 'Replenish Warm Numbers'}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
            <h3 className="text-red-800 dark:text-red-200 font-semibold mb-2">Error</h3>
            <p className="text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {result && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-6">
            <h3 className="text-green-800 dark:text-green-200 font-semibold mb-4">Replenishment Result</h3>
            <div className="space-y-2 text-sm">
              <div>
                <span className="font-medium">Available Before:</span> {result.available_before}
              </div>
              <div>
                <span className="font-medium">Numbers Added:</span> {result.numbers_added}
              </div>
              <div>
                <span className="font-medium">Available After:</span> {result.available_after}
              </div>
              {result.stats_before && (
                <div className="mt-4 pt-4 border-t border-green-200 dark:border-green-800">
                  <h4 className="font-semibold mb-2">Stats Before:</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div>Available: {result.stats_before.availableCount}</div>
                    <div>Assigned: {result.stats_before.assignedCount}</div>
                    <div>Failed: {result.stats_before.failedCount}</div>
                    <div>Quarantined: {result.stats_before.quarantinedCount}</div>
                  </div>
                </div>
              )}
              {result.stats_after && (
                <div className="mt-4 pt-4 border-t border-green-200 dark:border-green-800">
                  <h4 className="font-semibold mb-2">Stats After:</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div>Available: {result.stats_after.availableCount}</div>
                    <div>Assigned: {result.stats_after.assignedCount}</div>
                    <div>Failed: {result.stats_after.failedCount}</div>
                    <div>Quarantined: {result.stats_after.quarantinedCount}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
