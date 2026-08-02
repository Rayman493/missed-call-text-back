'use client'

import { useState } from 'react'
import { RefreshCw, AlertTriangle, CheckCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react'

interface TwilioHealthData {
  overallHealth: 'healthy' | 'needs_attention' | 'critical'
  overallHealthMessage: string
  lastChecked: string
  inventory: {
    total: number
    assigned: number
    active: number
    available: number
    reserved: number
    retired: number
    releasePending: number
    failed: number
    quarantined: number
  }
  warmPool: {
    count: number
    health: 'green' | 'amber' | 'red'
    minimum: number
    message: string
  }
  provisioning: {
    ready: number
    pending: number
    failed: number
    stuck: number
    smsReady: number
    smsPending: number
    smsFailed: number
  }
  release: {
    retiredEligible: number
    releaseAttemptsPending: number
    releaseFailures: number
    exhaustedRetries: number
    retryScheduled: number
    retiredOlderThan30Days: number
  }
  integrity: {
    orphanLiveNumbers: number
    missingBusinessLinks: number
    duplicatePhoneNumbers: number
    duplicateTwilioSids: number
    businessesWithMultipleLiveNumbers: number
    availableWithBusiness: number
    expiredReservations: number
    contradictoryStatus: number
  }
  protectedSystemNumber: {
    phoneNumber: string | null
    twilioSid: string | null
    status: string | null
    provisioningStatus: string | null
    smsStatus: string | null
    protectedStatus: string | null
    purpose: string
  } | null
  anomalies: {
    orphanLiveNumbers: any[]
    missingBusinessLinks: any[]
    duplicatePhoneNumbers: any[]
    duplicateTwilioSids: any[]
    businessesWithMultipleLiveNumbers: any[]
    availableWithBusiness: any[]
    expiredReservations: any[]
    contradictoryStatus: any[]
  }
}

interface TwilioHealthDashboardProps {
  data: TwilioHealthData | null
  loading: boolean
  error: string | null
  onRefresh: () => void
}

export default function TwilioHealthDashboard({ data, loading, error, onRefresh }: TwilioHealthDashboardProps) {
  const [expandedSection, setExpandedSection] = useState<string | null>(null)

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section)
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-foreground">Twilio Number Provisioning</h2>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent border-solid animate-spin rounded-full"></div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-foreground">Twilio Number Provisioning</h2>
          <button
            onClick={onRefresh}
            className="flex items-center gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
        </div>
      </div>
    )
  }

  if (!data) {
    return null
  }

  const getHealthColor = (health: string) => {
    switch (health) {
      case 'healthy':
      case 'green':
        return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800'
      case 'needs_attention':
      case 'amber':
        return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'
      case 'critical':
      case 'red':
        return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800'
      default:
        return 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600'
    }
  }

  const getHealthIcon = (health: string) => {
    switch (health) {
      case 'healthy':
      case 'green':
        return <CheckCircle className="w-5 h-5" />
      case 'needs_attention':
      case 'amber':
        return <AlertTriangle className="w-5 h-5" />
      case 'critical':
      case 'red':
        return <XCircle className="w-5 h-5" />
      default:
        return null
    }
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-foreground">Twilio Number Provisioning</h2>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Overall Health */}
      <div className={`mb-6 rounded-lg p-4 border ${getHealthColor(data.overallHealth)}`}>
        <div className="flex items-center gap-3">
          {getHealthIcon(data.overallHealth)}
          <div>
            <p className="font-semibold capitalize">{data.overallHealth.replace('_', ' ')}</p>
            <p className="text-sm opacity-90">{data.overallHealthMessage}</p>
          </div>
        </div>
        <p className="text-xs mt-2 opacity-75">Last checked: {new Date(data.lastChecked).toLocaleString()}</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Live Numbers" value={data.inventory.assigned} color="blue" />
        <MetricCard label="Warm Pool" value={data.warmPool.count} color={data.warmPool.health} />
        <MetricCard label="Reserved" value={data.inventory.reserved} color="amber" />
        <MetricCard label="Retired" value={data.inventory.retired} color="red" />
        <MetricCard label="Provisioning Issues" value={data.provisioning.failed + data.provisioning.stuck} color="red" />
        <MetricCard label="Release Issues" value={data.release.releaseFailures} color="red" />
        <MetricCard label="Integrity Issues" value={
          data.integrity.orphanLiveNumbers +
          data.integrity.missingBusinessLinks +
          data.integrity.duplicatePhoneNumbers +
          data.integrity.duplicateTwilioSids
        } color="red" />
        <MetricCard label="Inventory Health" value={data.inventory.available} color="green" />
      </div>

      {/* Warm Pool Detail */}
      <div className={`mb-4 rounded-lg p-4 border ${getHealthColor(data.warmPool.health)}`}>
        <p className="text-sm font-medium">{data.warmPool.message}</p>
      </div>

      {/* Expandable Detail Panels */}
      <DetailPanel
        title="Live Numbers"
        count={data.inventory.assigned}
        items={data.anomalies.orphanLiveNumbers}
        expanded={expandedSection === 'liveNumbers'}
        onToggle={() => toggleSection('liveNumbers')}
        columns={['Phone Number', 'Status', 'Business ID', 'Twilio SID', 'Provisioning Status', 'SMS Status']}
      />

      <DetailPanel
        title="Warm Inventory"
        count={data.warmPool.count}
        items={[]}
        expanded={expandedSection === 'warmInventory'}
        onToggle={() => toggleSection('warmInventory')}
        columns={['Phone Number', 'Status', 'Twilio SID', 'Provisioning Status']}
        emptyMessage="Warm inventory is healthy."
      />

      <DetailPanel
        title="Provisioning Issues"
        count={data.provisioning.failed + data.provisioning.stuck}
        items={[]} // Would need to aggregate from all numbers
        expanded={expandedSection === 'provisioningIssues'}
        onToggle={() => toggleSection('provisioningIssues')}
        columns={['Phone Number', 'Status', 'Provisioning Status', 'Error', 'Last Attempt']}
        emptyMessage="No provisioning issues detected."
      />

      <DetailPanel
        title="Release Queue"
        count={data.release.releaseAttemptsPending}
        items={[]} // Would need to aggregate from all numbers
        expanded={expandedSection === 'releaseQueue'}
        onToggle={() => toggleSection('releaseQueue')}
        columns={['Phone Number', 'Status', 'Release Attempts', 'Last Error', 'Next Retry']}
        emptyMessage="No release operations pending."
      />

      <DetailPanel
        title="Protected/System Numbers"
        count={data.protectedSystemNumber ? 1 : 0}
        items={data.protectedSystemNumber ? [data.protectedSystemNumber] : []}
        expanded={expandedSection === 'protectedNumbers'}
        onToggle={() => toggleSection('protectedNumbers')}
        columns={['Phone Number', 'Twilio SID', 'Status', 'Provisioning Status', 'SMS Status', 'Purpose']}
        emptyMessage="No protected system numbers found."
      />

      <DetailPanel
        title="Inventory Anomalies"
        count={
          data.integrity.orphanLiveNumbers +
          data.integrity.missingBusinessLinks +
          data.integrity.duplicatePhoneNumbers +
          data.integrity.duplicateTwilioSids
        }
        items={[]} // Would need to aggregate all anomaly types
        expanded={expandedSection === 'anomalies'}
        onToggle={() => toggleSection('anomalies')}
        columns={['Anomaly Type', 'Count', 'Details']}
        emptyMessage="No inventory anomalies detected."
      />
    </div>
  )
}

function MetricCard({ label, value, color }: { label: string; value: number; color: string }) {
  const getColorClasses = (color: string) => {
    switch (color) {
      case 'green':
        return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
      case 'amber':
        return 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
      case 'red':
        return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
      case 'blue':
        return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
      default:
        return 'bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600'
    }
  }

  return (
    <div className={`rounded-lg p-4 border ${getColorClasses(color)}`}>
      <p className="text-2xl font-bold text-slate-900 dark:text-foreground">{value}</p>
      <p className="text-sm text-slate-600 dark:text-slate-400">{label}</p>
    </div>
  )
}

function DetailPanel({
  title,
  count,
  items,
  expanded,
  onToggle,
  columns,
  emptyMessage = 'No items found.',
}: {
  title: string
  count: number
  items: any[]
  expanded: boolean
  onToggle: () => void
  columns: string[]
  emptyMessage?: string
}) {
  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg mb-4">
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
      >
        <div className="flex items-center gap-3">
          {expanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
          <span className="font-medium text-slate-900 dark:text-foreground">{title}</span>
          <span className="text-sm text-slate-500 dark:text-slate-400">({count})</span>
        </div>
        {count > 0 && (
          <span className={`px-2 py-1 text-xs font-medium rounded ${
            count > 0 ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
          }`}>
            {count} {count === 1 ? 'item' : 'items'}
          </span>
        )}
      </button>
      {expanded && (
        <div className="px-4 pb-4">
          {items.length === 0 ? (
            <div className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">
              {emptyMessage}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    {columns.map((col) => (
                      <th key={col} className="text-left py-2 px-2 font-medium text-slate-700 dark:text-slate-300">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={idx} className="border-b border-slate-100 dark:border-slate-800">
                      {columns.map((col) => (
                        <td key={col} className="py-2 px-2 text-slate-600 dark:text-slate-400">
                          {item[col.toLowerCase().replace(/ /g, '')] || '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}