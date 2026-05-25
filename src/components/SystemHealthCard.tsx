'use client'

import React from 'react'
import { Check, AlertTriangle } from 'lucide-react'

interface SystemHealthProps {
  monitoringStatus?: string
  forwardingVerified?: boolean
  hasTwilioPhone?: boolean
  followUpsEnabled?: boolean
}

export default function SystemHealthCard({ 
  monitoringStatus = 'inactive',
  forwardingVerified = false,
  hasTwilioPhone = false,
  followUpsEnabled = false
}: SystemHealthProps) {
  const healthChecks = [
    {
      label: 'Monitoring Active',
      status: monitoringStatus === 'active',
      description: 'ReplyFlow is protecting your business line'
    },
    {
      label: 'Call Forwarding Connected',
      status: forwardingVerified,
      description: 'Missed calls are being captured'
    },
    {
      label: 'Text Messaging Active',
      status: hasTwilioPhone,
      description: 'Automated responses are enabled'
    },
    {
      label: 'Follow-Ups Enabled',
      status: followUpsEnabled,
      description: 'Customer engagement is automated'
    }
  ]

  const allHealthy = healthChecks.every(check => check.status)
  const healthyCount = healthChecks.filter(check => check.status).length

  return (
    <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">System Health</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {allHealthy 
              ? 'All systems operating normally'
              : `${healthyCount} of ${healthChecks.length} systems active`
            }
          </p>
        </div>
        <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${
          allHealthy 
            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
            : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
        }`}>
          {allHealthy ? (
            <>
              <Check className="w-4 h-4" />
              Healthy
            </>
          ) : (
            <>
              <AlertTriangle className="w-4 h-4" />
              Attention Required
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {healthChecks.map((check, index) => (
          <div
            key={index}
            className={`flex items-center gap-2 p-2 rounded-lg border ${
              check.status
                ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
            }`}
          >
            <div className={`flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center ${
              check.status
                ? 'bg-green-600 dark:bg-green-400'
                : 'bg-amber-600 dark:bg-amber-400'
            }`}>
              {check.status ? (
                <Check className="w-2.5 h-2.5 text-white" />
              ) : (
                <AlertTriangle className="w-2.5 h-2.5 text-white" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-medium ${
                check.status
                  ? 'text-green-700 dark:text-green-300'
                  : 'text-amber-700 dark:text-amber-300'
              }`}>
                {check.label}
              </p>
              <p className={`text-xs ${
                check.status
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-amber-600 dark:text-amber-400'
              }`}>
                {check.status ? '✓' : '⚠'}
              </p>
            </div>
          </div>
        ))}
      </div>

      {!allHealthy && (
        <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Some systems need attention. Complete setup to unlock full ReplyFlow capabilities.
          </p>
        </div>
      )}
    </div>
  )
}
