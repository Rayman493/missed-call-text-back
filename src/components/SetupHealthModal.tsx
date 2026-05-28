'use client'

import React from 'react'
import { createPortal } from 'react-dom'
import { X, Check, AlertTriangle, Clock, Settings, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { useSetupHealth, HealthStatus } from '@/hooks/useSetupHealth'

interface SetupHealthModalProps {
  isOpen: boolean
  onClose: () => void
  leadsRecovered?: number
  missedCallsCaptured?: number
}

export default function SetupHealthModal({ isOpen, onClose, leadsRecovered, missedCallsCaptured }: SetupHealthModalProps) {
  const { healthChecks, needsAttention, requiredIssues, isHealthy } = useSetupHealth()

  // Override forwarding status based on Business Snapshot metrics
  const forwardingVerified = (leadsRecovered && leadsRecovered > 0) || (missedCallsCaptured && missedCallsCaptured > 0)

  const getStatusIcon = (status: HealthStatus) => {
    switch (status) {
      case 'complete':
        return <Check className="w-4 h-4 text-green-400" />
      case 'needs_attention':
        return <AlertTriangle className="w-4 h-4 text-amber-400" />
      case 'not_configured':
        return <Clock className="w-4 h-4 text-slate-400" />
      case 'optional':
        return <Clock className="w-4 h-4 text-slate-500" />
    }
  }

  const getStatusColor = (status: HealthStatus) => {
    switch (status) {
      case 'complete':
        return 'bg-green-500/10 border-green-500/30'
      case 'needs_attention':
        return 'bg-amber-500/10 border-amber-500/30'
      case 'not_configured':
        return 'bg-slate-500/10 border-slate-500/30'
      case 'optional':
        return 'bg-slate-800/50 border-slate-700'
    }
  }

  if (!isOpen) return null

  const modalContent = (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div>
            <h2 className="text-xl font-semibold text-white">System Health</h2>
            <p className="text-sm text-slate-400 mt-1">
              {isHealthy ? 'All systems operational' : `${requiredIssues.length} issues need attention`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-180px)] p-6">
          <div className="space-y-3">
            {healthChecks.map((check) => {
              // Override forwarding check based on Business Snapshot metrics
              let status = check.status
              let description = check.description
              let details = check.details
              let actionText = check.actionText
              let actionUrl = check.actionUrl

              if (check.id === 'call_forwarding') {
                if (forwardingVerified) {
                  status = 'complete'
                  description = 'Missed calls are being detected successfully.'
                  details = 'Forwarding is operational based on captured leads.'
                  actionText = undefined
                  actionUrl = undefined
                } else {
                  status = 'needs_attention'
                  description = 'Call forwarding needs verification'
                  details = 'Waiting for first missed-call test'
                  actionText = 'Verify forwarding'
                  actionUrl = '/setup/forwarding'
                }
              }

              return (
                <div
                  key={check.id}
                  className={`p-4 rounded-xl border transition-all ${getStatusColor(status)} ${check.isOptional ? 'opacity-70' : ''}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="mt-0.5 flex-shrink-0">
                        {getStatusIcon(status)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium text-white">{check.name}</h3>
                          {check.isOptional && (
                            <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">Optional</span>
                          )}
                        </div>
                        <p className="text-sm text-slate-300">{description}</p>
                        {details && (
                          <p className="text-xs text-slate-400 mt-1">{details}</p>
                        )}
                      </div>
                    </div>
                    {actionText && actionUrl && (
                      <Link
                        href={actionUrl}
                        onClick={onClose}
                        className="flex-shrink-0 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                      >
                        {actionText}
                      </Link>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700 bg-slate-800/50">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-4 text-slate-400">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-green-400"></div>
                Complete
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-amber-400"></div>
                Needs Attention
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-slate-400"></div>
                Not Configured
              </div>
            </div>
            <Link
              href="/dashboard/settings"
              onClick={onClose}
              className="text-blue-400 hover:text-blue-300 flex items-center gap-1"
            >
              Open Settings
              <Settings className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}
