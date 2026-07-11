'use client'

import React from 'react'
import Link from 'next/link'
import { Business } from '@/lib/types'
import { hasActiveSubscription, deriveSetupState } from '@/lib/subscription-utils'
import { CheckCircle, AlertTriangle, XCircle, ArrowRight } from 'lucide-react'

interface DashboardHeroProps {
  business: Business | null
  setupHealth?: {
    forwardingVerified?: boolean
    smsActive?: boolean
    aiIntakeReady?: boolean
  }
  missedCallCount?: number
}

type HeroState = 
  | 'critical-issue'
  | 'needs-forwarding'
  | 'needs-verification'
  | 'setup-complete-no-leads'
  | 'healthy'

export default function DashboardHero({ 
  business, 
  setupHealth,
  missedCallCount = 0 
}: DashboardHeroProps) {
  const setupState = deriveSetupState(business)
  const hasSubscription = hasActiveSubscription(business)
  
  // Determine hero state based on priority order
  const getHeroState = (): HeroState => {
    // Priority 1: Critical issue requiring action
    if (business?.subscription_status === 'past_due' || business?.subscription_status === 'unpaid') {
      return 'critical-issue'
    }
    
    if (business?.provisioning_status === 'failed') {
      return 'critical-issue'
    }
    
    if (business?.messaging_status !== 'active' && business?.twilio_phone_number) {
      return 'critical-issue'
    }
    
    // Priority 2: Needs call forwarding setup
    if (setupState === 'needs_forwarding') {
      return 'needs-forwarding'
    }
    
    // Priority 3: Needs verification test
    if (setupState === 'needs_final_test') {
      return 'needs-verification'
    }
    
    // Priority 4: Setup complete but no leads yet
    if (setupHealth?.forwardingVerified && missedCallCount === 0) {
      return 'setup-complete-no-leads'
    }
    
    // Priority 5: Healthy account with activity
    return 'healthy'
  }
  
  const heroState = getHeroState()
  
  // Render appropriate hero based on state
  if (heroState === 'critical-issue') {
    return (
      <div className="bg-red-900/20 border border-red-800 rounded-2xl p-6 sm:p-8 shadow-lg">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            <div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-white" />
            </div>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-red-100 mb-2">
              Action Required
            </h3>
            <p className="text-sm text-red-200 mb-4">
              {business?.subscription_status === 'past_due' || business?.subscription_status === 'unpaid'
                ? 'Update your billing information to keep ReplyFlow active.'
                : business?.provisioning_status === 'failed'
                ? 'Number setup failed. Please try again or contact support.'
                : 'SMS service is unavailable. Check your Twilio configuration.'}
            </p>
            <div className="flex gap-3">
              {business?.subscription_status === 'past_due' || business?.subscription_status === 'unpaid' ? (
                <Link
                  href="/dashboard/settings"
                  className="inline-flex items-center justify-center px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Update Billing
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              ) : (
                <Link
                  href="/dashboard/settings"
                  className="inline-flex items-center justify-center px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Fix Issue
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }
  
  if (heroState === 'needs-forwarding') {
    return (
      <div className="bg-gradient-to-br from-blue-600 to-indigo-700 dark:from-blue-700 dark:to-indigo-800 rounded-2xl p-6 sm:p-8 shadow-2xl border border-blue-500/30">
        <div className="flex flex-col gap-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Complete your setup</h1>
            <p className="text-blue-100 text-base sm:text-lg">One final step before ReplyFlow can start capturing missed calls.</p>
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
            <p className="text-white text-sm leading-relaxed">
              Your business phone number stays the same. You'll simply forward missed calls to your ReplyFlow number so we can automatically text customers back.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <Link
              href="/setup/phone-forwarding"
              className="inline-flex items-center justify-center px-8 py-4 bg-white hover:bg-blue-50 text-blue-600 text-base font-bold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
            >
              Set Up Call Forwarding
            </Link>
            <p className="text-blue-200 text-sm">Takes about 2 minutes.</p>
          </div>
        </div>
      </div>
    )
  }
  
  if (heroState === 'needs-verification') {
    return (
      <div className="bg-gradient-to-br from-amber-500 to-orange-600 dark:from-amber-600 dark:to-orange-700 rounded-2xl p-6 sm:p-8 shadow-2xl border border-amber-400/30">
        <div className="flex flex-col gap-6">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <h1 className="text-2xl sm:text-3xl font-bold text-white">Verify Your Setup</h1>
              <span className="inline-flex items-center px-3 py-1 bg-white/20 backdrop-blur-sm border border-white/30 rounded-full text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
                Required
              </span>
            </div>
            <p className="text-amber-50 text-base sm:text-lg font-medium">Complete your setup by testing call forwarding. This step is required before ReplyFlow can start capturing missed calls.</p>
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <span className="text-white text-sm font-medium">ReplyFlow number activated</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <span className="text-white text-sm font-medium">Call forwarding connected</span>
              </div>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
            <h3 className="text-white font-bold mb-3 text-lg">How to test:</h3>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-sm font-bold">1</span>
                </div>
                <p className="text-white text-sm pt-0.5">Call your business phone number from another phone.</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-sm font-bold">2</span>
                </div>
                <p className="text-white text-sm pt-0.5">Let the call ring until it forwards to ReplyFlow.</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-sm font-bold">3</span>
                </div>
                <p className="text-white text-sm pt-0.5">Listen for the AI greeting and complete a short conversation.</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-sm font-bold">4</span>
                </div>
                <p className="text-white text-sm pt-0.5">Confirm that a new customer appears in your dashboard.</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <Link
              href="/setup/phone-forwarding?mode=review"
              className="inline-flex items-center justify-center px-8 py-4 bg-white hover:bg-amber-50 text-amber-600 text-base font-bold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
            >
              View Carrier Instructions
              <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
            <p className="text-amber-100 text-sm font-medium">Takes about 2 minutes to complete.</p>
          </div>
        </div>
      </div>
    )
  }
  
  if (heroState === 'setup-complete-no-leads') {
    return (
      <div className="bg-gradient-to-br from-green-600 to-emerald-700 dark:from-green-700 dark:to-emerald-800 rounded-2xl p-6 sm:p-8 shadow-2xl border border-green-500/30">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-white" />
            </div>
          </div>
          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">You're all set!</h1>
            <p className="text-green-100 text-base sm:text-lg">
              ReplyFlow is now monitoring your missed calls. The next missed call will automatically create a customer and text your customer back.
            </p>
          </div>
        </div>
      </div>
    )
  }
  
  // Healthy state
  return (
    <div className="bg-gradient-to-br from-green-600 to-emerald-700 dark:from-green-700 dark:to-emerald-800 rounded-2xl p-6 sm:p-8 shadow-2xl border border-green-500/30">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
            <CheckCircle className="w-5 h-5 text-white" />
          </div>
        </div>
        <div className="flex-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">ReplyFlow Active</h1>
          <p className="text-green-100 text-base sm:text-lg">
            All systems are operational and ReplyFlow is actively monitoring your missed calls.
          </p>
        </div>
      </div>
    </div>
  )
}
