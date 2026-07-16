'use client'

import { useState, useEffect } from 'react'
import { CheckCircle, AlertTriangle, XCircle, RefreshCw, Clock } from 'lucide-react'
import { createBrowserClient } from '@/lib/supabase/browser'
import { SystemHealth, ServiceHealth, OperationalIssue, HealthStatus } from '@/lib/system-health'

export default function SystemHealthPage() {
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [testAlertResult, setTestAlertResult] = useState<string | null>(null)
  const [isTestAlertLoading, setIsTestAlertLoading] = useState(false)
  const supabase = createBrowserClient()

  const fetchHealth = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        setError('Authentication required')
        return
      }

      const response = await fetch('/api/admin/system-health', {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (response.status === 403) {
        setError('Access denied - Admin only')
        return
      }

      if (!response.ok) {
        throw new Error('Failed to fetch system health')
      }

      const data = await response.json()
      setHealth(data)
    } catch (err) {
      setError('Failed to load system health data')
      console.error('[System Health] Error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const triggerTestAlert = async () => {
    setIsTestAlertLoading(true)
    setTestAlertResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        setTestAlertResult('Authentication required')
        return
      }

      const response = await fetch('/api/admin/system-health/test-alert', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'trigger' })
      })

      if (response.status === 403) {
        setTestAlertResult('Access denied - Admin only')
        return
      }

      if (!response.ok) {
        throw new Error('Failed to trigger test alert')
      }

      const data = await response.json()
      if (data.sent) {
        setTestAlertResult(`Test alert sent successfully. Alert count: ${data.alertCount}`)
      } else {
        setTestAlertResult(`Test alert in cooldown. ${data.reason}`)
      }
    } catch (err) {
      setTestAlertResult('Failed to trigger test alert')
      console.error('[Test Alert] Error:', err)
    } finally {
      setIsTestAlertLoading(false)
    }
  }

  const resolveTestAlert = async () => {
    setIsTestAlertLoading(true)
    setTestAlertResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        setTestAlertResult('Authentication required')
        return
      }

      const response = await fetch('/api/admin/system-health/test-alert', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'resolve' })
      })

      if (response.status === 403) {
        setTestAlertResult('Access denied - Admin only')
        return
      }

      if (!response.ok) {
        throw new Error('Failed to resolve test alert')
      }

      setTestAlertResult('Test alert resolved successfully')
    } catch (err) {
      setTestAlertResult('Failed to resolve test alert')
      console.error('[Test Alert] Error:', err)
    } finally {
      setIsTestAlertLoading(false)
    }
  }

  useEffect(() => {
    fetchHealth()
  }, [])

  const getStatusIcon = (status: HealthStatus) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="w-5 h-5" />
      case 'degraded':
        return <AlertTriangle className="w-5 h-5" />
      case 'critical':
        return <XCircle className="w-5 h-5" />
      case 'unknown':
        return <Clock className="w-5 h-5" />
    }
  }

  const getStatusColor = (status: HealthStatus) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800'
      case 'degraded':
        return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
      case 'critical':
        return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800'
      case 'unknown':
        return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
    }
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`
    return date.toLocaleDateString()
  }

  const ServiceCard = ({ service }: { service: ServiceHealth }) => (
    <div className={`p-4 rounded-lg border ${getStatusColor(service.status)}`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          {getStatusIcon(service.status)}
          <h3 className="font-semibold text-sm">{service.name}</h3>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getStatusColor(service.status)}`}>
          {service.status.charAt(0).toUpperCase() + service.status.slice(1)}
        </span>
      </div>
      <p className="text-sm mb-2">{service.summary}</p>
      {service.lastActivity && (
        <p className="text-xs opacity-70">Last activity: {formatTimestamp(service.lastActivity)}</p>
      )}
      {service.failureCount !== undefined && service.failureCount > 0 && (
        <p className="text-xs opacity-70">Recent failures: {service.failureCount}</p>
      )}
    </div>
  )

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-700 dark:text-red-300">{error}</p>
        </div>
      </div>
    )
  }

  if (isLoading || !health) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-foreground">System Health</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Last checked: {formatTimestamp(health.lastChecked)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={triggerTestAlert}
            disabled={isTestAlertLoading}
            className="flex items-center gap-2 px-4 py-2 bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-900/50 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 text-amber-700 dark:text-amber-300"
          >
            <AlertTriangle className="w-4 h-4" />
            Send Test Alert
          </button>
          <button
            onClick={resolveTestAlert}
            disabled={isTestAlertLoading}
            className="flex items-center gap-2 px-4 py-2 bg-green-100 dark:bg-green-900/30 hover:bg-green-200 dark:hover:bg-green-900/50 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 text-green-700 dark:text-green-300"
          >
            <CheckCircle className="w-4 h-4" />
            Resolve Test Alert
          </button>
          <button
            onClick={fetchHealth}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Test Alert Result */}
      {testAlertResult && (
        <div className={`p-4 rounded-lg border ${
          testAlertResult.includes('success') || testAlertResult.includes('resolved')
            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
            : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'
        }`}>
          <p className="text-sm">{testAlertResult}</p>
        </div>
      )}

      {/* Overall Status */}
      <div className={`p-6 rounded-lg border ${getStatusColor(health.overall)}`}>
        <div className="flex items-center gap-3">
          {getStatusIcon(health.overall)}
          <div>
            <h2 className="text-lg font-semibold">Overall Status</h2>
            <p className="text-sm opacity-80">
              {health.overall === 'healthy' && 'All systems operating normally'}
              {health.overall === 'degraded' && 'Some systems experiencing issues'}
              {health.overall === 'critical' && 'Critical system failures detected'}
              {health.overall === 'unknown' && 'Unable to determine system status'}
            </p>
          </div>
        </div>
      </div>

      {/* Service Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <ServiceCard service={health.services.application} />
        <ServiceCard service={health.services.aiVoice} />
        <ServiceCard service={health.services.twilioVoice} />
        <ServiceCard service={health.services.twilioSms} />
        <ServiceCard service={health.services.stripe} />
        <ServiceCard service={health.services.provisioning} />
      </div>

      {/* Recent Issues */}
      {health.recentIssues.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-4">
            Recent Issues
          </h3>
          <div className="space-y-2">
            {health.recentIssues.map((issue) => (
              <div
                key={issue.id}
                className={`p-4 rounded-lg border ${
                  issue.severity === 'critical'
                    ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                    : issue.severity === 'degraded'
                      ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium">{issue.service}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        issue.severity === 'critical'
                          ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                          : issue.severity === 'degraded'
                            ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}>
                        {issue.severity.charAt(0).toUpperCase() + issue.severity.slice(1)}
                      </span>
                    </div>
                    <p className="text-sm">{issue.summary}</p>
                    <p className="text-xs opacity-70 mt-1">{formatTimestamp(issue.timestamp)}</p>
                  </div>
                  {issue.resolved && (
                    <span className="text-xs text-green-600 dark:text-green-400">Resolved</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {health.recentIssues.length === 0 && health.overall === 'healthy' && (
        <div className="p-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
            <p className="text-sm text-green-700 dark:text-green-300">
              No recent issues detected. All systems operating normally.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
