'use client'

import React from 'react'
import { createPortal } from 'react-dom'
import { X, Check, AlertTriangle, Clock, Settings, ExternalLink } from 'lucide-react'
import Link from 'next/link'

interface SetupHealthModalProps {
  isOpen: boolean
  onClose: () => void
  setupHealth?: import('@/lib/setup-health').SetupHealth
}

export default function SetupHealthModal({ isOpen, onClose, setupHealth }: SetupHealthModalProps) {
  console.log('[SETUP HEALTH]', setupHealth)

  // Simple health status type
  type HealthStatus = 'complete' | 'needs_attention' | 'not_configured' | 'optional'

  // Health checks based on setupHealth
  const healthChecks = [
    {
      id: 'sms_active',
      name: 'SMS Active',
      status: setupHealth?.smsActive ? 'complete' as HealthStatus : 'needs_attention' as HealthStatus,
      description: setupHealth?.smsActive 
        ? 'Text messaging is active' 
        : 'Text messaging needs to be activated',
      details: setupHealth?.smsActive 
        ? 'SMS configured and operational' 
        : 'Configure SMS messaging',
      actionText: setupHealth?.smsActive ? undefined : 'Configure SMS',
      actionUrl: setupHealth?.smsActive ? undefined : '/dashboard/settings',
      isOptional: false
    },
    {
      id: 'call_forwarding',
      name: 'Call Forwarding Verified',
      status: setupHealth?.forwardingVerified ? 'complete' as HealthStatus : 'needs_attention' as HealthStatus,
      description: setupHealth?.forwardingVerified 
        ? 'Missed calls are being detected successfully' 
        : 'Call forwarding needs verification',
      details: setupHealth?.forwardingVerified 
        ? 'Forwarding verified and operational' 
        : 'Run one missed-call test to confirm',
      actionText: setupHealth?.forwardingVerified ? undefined : 'Test Forwarding',
      actionUrl: setupHealth?.forwardingVerified ? undefined : '/dashboard/settings',
      isOptional: false
    }
  ]

  const isHealthy = setupHealth?.isReady === true
  const requiredIssues = setupHealth?.needsAttention || []

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
              return (
                <div
                  key={check.id}
                  className={`p-4 rounded-xl border transition-all ${getStatusColor(check.status)} ${check.isOptional ? 'opacity-70' : ''}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="mt-0.5 flex-shrink-0">
                        {getStatusIcon(check.status)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium text-white">{check.name}</h3>
                          {check.isOptional && (
                            <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">Optional</span>
                          )}
                        </div>
                        <p className="text-sm text-slate-300">{check.description}</p>
                        {check.details && (
                          <p className="text-xs text-slate-400 mt-1">{check.details}</p>
                        )}
                      </div>
                    </div>
                    {check.actionText && check.actionUrl && (
                      <Link
                        href={check.actionUrl}
                        onClick={onClose}
                        className="flex-shrink-0 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                      >
                        {check.actionText}
                      </Link>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}
