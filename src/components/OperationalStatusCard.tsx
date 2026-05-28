'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { formatPhoneNumber, formatRelativeTime } from '@/lib/utils'
import { Business } from '@/lib/types'
import { createBrowserClient } from '@/lib/supabase/browser'
import TestReplyFlowModal from '@/components/TestReplyFlowModal'

interface OperationalStatusCardProps {
  business: Business | null
  missedCallCount?: number
  lastActivity?: string
  onReviewSetup?: () => void
  forwardingComplete?: boolean
}

export default function OperationalStatusCard({ 
  business, 
  missedCallCount = 0, 
  lastActivity,
  onReviewSetup,
  forwardingComplete
}: OperationalStatusCardProps) {
  const [showSystemDetails, setShowSystemDetails] = useState(false)
  const [showTestModal, setShowTestModal] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const getStatusIndicator = (status: 'active' | 'inactive' | 'warning' | 'needs-attention') => {
    const colors = {
      active: 'bg-green-500',
      inactive: 'bg-gray-400',
      warning: 'bg-amber-500',
      'needs-attention': 'bg-amber-500'
    }
    return (
      <div className={`w-2 h-2 ${colors[status]} rounded-full ${status === 'active' ? 'animate-pulse' : ''}`}></div>
    )
  }

  const getStatusText = (status: 'active' | 'inactive' | 'warning') => {
    const texts = {
      active: 'Active',
      inactive: 'Inactive',
      warning: 'Warning'
    }
    return texts[status]
  }

  const isTextReplyActive = business?.messaging_status === 'active'
  
  console.log('[FORWARDING COMPLETE]', forwardingComplete)
  
  // ONLY use forwardingComplete prop - no other logic
  const isForwardingActive = forwardingComplete === true
  
  // Clear monitoring status logic
  const isMonitoringHealthy = isForwardingActive && isTextReplyActive
  const monitoringStatus = isMonitoringHealthy ? 'active' : 'needs-attention'
  
  // Context for why attention is needed
  const getMonitoringContext = () => {
    if (!isForwardingActive && !isTextReplyActive) {
      return 'Call forwarding and text messaging need to be activated'
    }
    if (!isForwardingActive) {
      return 'Call forwarding needs to be verified'
    }
    if (!isTextReplyActive) {
      return 'Text messaging needs to be activated'
    }
    return null
  }

  // Show compact version when setup is complete (both mobile and desktop)
  // Show full version when setup needs attention
  if (monitoringStatus === 'active') {
    return (
      <>
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 dark:from-slate-800 dark:to-slate-900 border border-slate-700 rounded-xl p-4 sm:p-5 hover:shadow-xl transition-all duration-300">
          {/* Compact Header */}
          <div className="flex items-center justify-center mb-2">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-green-500 rounded-full flex-shrink-0"></div>
              <h3 className="text-base sm:text-lg font-bold text-white">ReplyFlow Active</h3>
            </div>
          </div>

          {/* Primary Status */}
          <div className="text-center mb-4">
            <p className="text-xs sm:text-sm text-slate-300 mb-1">System Status</p>
            <p className="text-4xl sm:text-5xl font-bold text-white mb-2">
              {isForwardingActive ? 'Active' : 'Setup'}
            </p>
          </div>

          {/* Health Status Pills */}
          <div className="flex flex-wrap justify-center gap-2 mb-4">
            <div className="inline-flex items-center px-3 py-1.5 bg-green-500/20 border border-green-400/30 rounded-full">
              <svg className="w-3 h-3 text-green-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-xs text-green-300">Calls Active</span>
            </div>
            <div className="inline-flex items-center px-3 py-1.5 bg-green-500/20 border border-green-400/30 rounded-full">
              <svg className="w-3 h-3 text-green-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-xs text-green-300">Text Replies Active</span>
            </div>
            <div className="inline-flex items-center px-3 py-1.5 bg-green-500/20 border border-green-400/30 rounded-full">
              <svg className="w-3 h-3 text-green-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-xs text-green-300">Follow-Ups Active</span>
            </div>
          </div>

          {/* Improved Copy */}
          <p className="text-xs sm:text-sm text-slate-300 text-center mb-4">
            Monitoring calls and responding automatically.
            <br />
            <span className="text-slate-400">
              {isForwardingActive 
                ? 'System is actively monitoring calls'
                : 'Setup required to begin monitoring'
              }
            </span>
          </p>

          {/* Action Buttons */}
          <div className="flex gap-2 sm:gap-3">
            <button
              onClick={() => setShowTestModal(true)}
              className="flex-1 px-3 py-1.5 sm:px-4 sm:py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-medium rounded-lg transition-colors"
            >
              Test ReplyFlow
            </button>
            <button
              onClick={() => setShowSystemDetails(true)}
              className="flex-1 px-3 py-1.5 sm:px-4 sm:py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs sm:text-sm font-medium rounded-lg transition-colors"
            >
              System Details
            </button>
          </div>
        </div>

        {/* System Details Modal */}
        {showSystemDetails && (
          <div className="fixed inset-0 z-50 overflow-hidden">
            {/* Backdrop */}
            <div 
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setShowSystemDetails(false)}
            />

            {/* Modal */}
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <div className="bg-slate-900 dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md border border-slate-700">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-700">
                  <h3 className="text-lg font-semibold text-white">System Details</h3>
                  <button
                    onClick={() => setShowSystemDetails(false)}
                    className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Content */}
                <div className="p-4 space-y-4">
                  {/* Phone Numbers Section */}
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Business Number</span>
                      <span className="text-white font-medium">
                        {business?.business_phone_number ? formatPhoneNumber(business.business_phone_number) : 'Not set'}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">ReplyFlow Number</span>
                      <span className="text-white font-medium">
                        {business?.twilio_phone_number ? formatPhoneNumber(business.twilio_phone_number) : 'Not assigned'}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Forwarding Status</span>
                      <span className={`font-medium flex items-center gap-1 ${
                        business?.forwarding_verified 
                          ? 'text-green-400' 
                          : business?.business_phone_number && business?.twilio_phone_number
                          ? 'text-amber-400'
                          : 'text-slate-400'
                      }`}>
                        {business?.forwarding_verified ? (
                          <>
                            Connected ✅
                          </>
                        ) : business?.business_phone_number && business?.twilio_phone_number ? (
                          <>
                            Needs Setup ⚠️
                          </>
                        ) : (
                          <>
                            Not Set ⚠️
                          </>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* System Status Section */}
                  <div className="space-y-3 border-t border-slate-700 pt-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Monitoring:</span>
                      <span className="text-green-400 font-medium">Active</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Text Replies:</span>
                      <span className="text-green-400 font-medium">Active</span>
                    </div>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Status:</span>
                    <span className="text-white font-medium">
                      {isForwardingActive ? 'Active' : 'Setup'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Forwarding:</span>
                    <span className="text-white font-medium">
                      {isForwardingActive ? 'Verified' : 'Pending'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Messaging:</span>
                    <span className="text-white font-medium">
                      {isTextReplyActive ? 'Active' : 'Setup'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 dark:from-slate-800 dark:to-slate-900 border border-slate-700 rounded-xl p-4 sm:p-6 hover:shadow-xl transition-all duration-300">
      {/* Header with Operational Summary */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {getStatusIndicator(monitoringStatus)}
            <div>
              <h3 className="text-xl font-bold text-white">ReplyFlow Status</h3>
              <p className="text-sm text-slate-300">
                 Setup Required
              </p>
            </div>
          </div>
          
          {/* Health Indicator */}
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-500"></div>
            <span className="text-xs font-medium text-amber-400">
              Attention Needed
            </span>
          </div>
        </div>

        {/* Operational Summary */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
          <p className="text-sm text-slate-300 mb-3">
            Complete setup to start monitoring your business line and capturing missed calls.
          </p>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Status:</span>
              <span className="text-white font-medium">
                {isForwardingActive ? 'Active' : 'Setup'}
              </span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Forwarding:</span>
              <span className="text-white font-medium">
                {isForwardingActive ? 'Verified' : 'Pending'}
              </span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Messaging:</span>
              <span className="text-white font-medium">
                {isTextReplyActive ? 'Active' : 'Setup'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Core Status Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
        {/* Business Phone */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            <span className="text-xs font-medium text-slate-300">Business Phone</span>
          </div>
          <div className="text-sm font-mono text-white">
            {business?.business_phone_number ? formatPhoneNumber(business.business_phone_number) : 'Not set'}
          </div>
        </div>

        {/* ReplyFlow Number */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span className="text-xs font-medium text-slate-300">ReplyFlow Number</span>
          </div>
          <div className="text-sm font-mono text-white">
            {business?.twilio_phone_number ? formatPhoneNumber(business.twilio_phone_number) : 'Not assigned'}
          </div>
        </div>

        {/* Monitoring Status */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            {getStatusIndicator(monitoringStatus)}
            <span className="text-xs font-medium text-slate-300">Monitoring</span>
          </div>
          <div className="text-sm text-white">
            {getStatusText('warning')}
          </div>
          
          {/* Context for why attention is needed */}
          {monitoringStatus === 'needs-attention' && (
            <div className="text-xs text-amber-400 mt-1">
              {getMonitoringContext()}
            </div>
          )}
        </div>

        {/* Text Reply Status */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            {getStatusIndicator(isTextReplyActive ? 'active' : 'inactive')}
            <span className="text-xs font-medium text-slate-300">Text Replies</span>
          </div>
          <div className="text-sm text-white">
            {getStatusText(isTextReplyActive ? 'active' : 'inactive')}
          </div>
        </div>
      </div>

      {/* Additional Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        {/* Forwarding Status */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getStatusIndicator(isForwardingActive ? 'active' : 'warning')}
              <span className="text-sm font-medium text-slate-300">Call Forwarding</span>
            </div>
            <div className="text-sm text-white">
              {getStatusText(isForwardingActive ? 'active' : 'warning')}
            </div>
          </div>
        </div>

        {/* Last Lead Activity */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs font-medium text-slate-300">Total Leads</span>
          </div>
          <div className="text-sm text-white">
            {isForwardingActive ? 'Active' : 'Setup'}
          </div>
        </div>

        {/* Last Successful SMS */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            <span className="text-xs font-medium text-slate-300">Messaging</span>
          </div>
          <div className="text-sm text-white">
            {isTextReplyActive ? 'Active' : 'Setup'}
          </div>
        </div>
      </div>

      {/* Trial Status */}
      {business?.trial_ends_at && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium text-slate-300">Trial Status</span>
            </div>
            <div className="text-sm text-amber-400">
              Ends {formatRelativeTime(business.trial_ends_at)}
            </div>
          </div>
        </div>
      )}

      {/* Primary Actions */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
        <Link
          href="/dashboard/test-setup"
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Test ReplyFlow
        </Link>
        
        <button
          onClick={onReviewSetup}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-lg transition-colors text-sm font-medium"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
          Review Setup
        </button>
      </div>

      {/* Test ReplyFlow Modal */}
      <TestReplyFlowModal 
        isOpen={showTestModal}
        onClose={() => setShowTestModal(false)}
      />
    </div>
  )
}
