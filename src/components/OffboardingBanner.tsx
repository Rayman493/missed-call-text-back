'use client'

import { useState } from 'react'
import { createBrowserClient } from '@/lib/supabase/browser'

interface OffboardingBannerProps {
  business: {
    id: string
    carrier?: string | null
    forwarding_disabled_at?: string | null
  }
  subscriptionStatus: string
  onDismiss?: () => void
}

// Carrier-specific disable forwarding codes
const CARRIER_CODES: Record<string, { code: string; instructions: string; name: string }> = {
  verizon: {
    code: '*73',
    instructions: 'Dial *73 from your business phone to disable call forwarding.',
    name: 'Verizon'
  },
  att: {
    code: '##004#',
    instructions: 'Dial ##004# from your business phone to disable call forwarding.',
    name: 'AT&T'
  },
  tmobile: {
    code: '##004#',
    instructions: 'Dial ##004# from your business phone to disable call forwarding.',
    name: 'T-Mobile'
  },
  sprint: {
    code: '*720',
    instructions: 'Dial *720 from your business phone to disable call forwarding.',
    name: 'Sprint'
  },
  comcast: {
    code: '*73',
    instructions: 'Dial *73 from your business phone to disable call forwarding.',
    name: 'Comcast/Xfinity'
  },
  spectrum: {
    code: '*73',
    instructions: 'Dial *73 from your business phone to disable call forwarding.',
    name: 'Spectrum'
  },
  cox: {
    code: '*73',
    instructions: 'Dial *73 from your business phone to disable call forwarding.',
    name: 'Cox'
  },
  frontier: {
    code: '*73',
    instructions: 'Dial *73 from your business phone to disable call forwarding.',
    name: 'Frontier'
  },
  vonage: {
    code: '*73',
    instructions: 'Dial *73 from your business phone to disable call forwarding.',
    name: 'Vonage'
  },
  ooma: {
    code: '*73',
    instructions: 'Dial *73 from your business phone to disable call forwarding.',
    name: 'Ooma'
  },
  ringcentral: {
    code: '',
    instructions: 'Log into your RingCentral account, go to Settings > Phone > Call Forwarding, and disable forwarding.',
    name: 'RingCentral'
  },
  grasshopper: {
    code: '',
    instructions: 'Log into your Grasshopper account, go to Extensions > Call Forwarding, and disable forwarding.',
    name: 'Grasshopper'
  },
  nextiva: {
    code: '',
    instructions: 'Log into your Nextiva account, go to Features > Call Forwarding, and disable forwarding.',
    name: 'Nextiva'
  },
  '8x8': {
    code: '',
    instructions: 'Log into your 8x8 account, go to Account Manager > Call Forwarding, and disable forwarding.',
    name: '8x8'
  },
  google_voice: {
    code: '',
    instructions: 'In Google Voice settings, go to Calls > Call Forwarding and disable forwarding to your ReplyFlow number.',
    name: 'Google Voice'
  },
  other: {
    code: '',
    instructions: 'Contact your phone carrier or check your phone settings to disable no-answer/busy call forwarding.',
    name: 'Other Carrier'
  }
}

export default function OffboardingBanner({ business, subscriptionStatus, onDismiss }: OffboardingBannerProps) {
  const [isDisabled, setIsDisabled] = useState(!!business.forwarding_disabled_at)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [copied, setCopied] = useState(false)
  const supabase = createBrowserClient()

  const carrier = business.carrier || 'other'
  const carrierInfo = CARRIER_CODES[carrier] || CARRIER_CODES.other

  const handleCopyCode = () => {
    if (carrierInfo.code) {
      navigator.clipboard.writeText(carrierInfo.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleConfirmDisabled = async () => {
    setIsSubmitting(true)
    try {
      const { error } = await supabase
        .from('businesses')
        .update({ forwarding_disabled_at: new Date().toISOString() })
        .eq('id', business.id)

      if (error) throw error
      
      setIsDisabled(true)
      onDismiss?.()
    } catch (error) {
      console.error('Error marking forwarding as disabled:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isDisabled) return null

  return (
    <div className="bg-red-900/20 border border-red-800 rounded-xl p-4 sm:p-6 mb-6">
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <div className="flex-shrink-0 w-10 h-10 bg-red-900/30 rounded-full flex items-center justify-center">
          <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 15.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-red-100">
            Action Required: Disable Call Forwarding
          </h3>
          <p className="text-sm text-red-200/80 mt-1">
            Your subscription is {subscriptionStatus}. You must disable call forwarding from your business phone to prevent missed calls from being sent to ReplyFlow.
          </p>
        </div>
      </div>

      {/* Important Warning */}
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-4">
        <div className="flex items-start gap-2">
          <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 15.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <div>
            <h4 className="text-sm font-semibold text-red-100 mb-1">Why this is important</h4>
            <p className="text-xs text-red-200/90">
              If you don't disable call forwarding, missed calls to your business number will still be routed to ReplyFlow. This could cause customer calls to be handled incorrectly or not at all. Please complete this step now.
            </p>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-muted/50 rounded-lg p-4 mb-4 border border-border">
        <h4 className="text-sm font-medium text-foreground mb-2">
          Disable call forwarding from your business phone
        </h4>
        <p className="text-sm text-muted-foreground mb-3">
          Use the code below to turn off call forwarding on your {carrierInfo.name} phone:
        </p>

        {/* Carrier Code Display */}
        {carrierInfo.code ? (
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 bg-card rounded-lg p-3 border border-border">
              <span className="text-xl font-mono font-bold text-foreground">{carrierInfo.code}</span>
            </div>
            <button
              onClick={handleCopyCode}
              className="px-4 py-3 bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              {copied ? (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy
                </>
              )}
            </button>
          </div>
        ) : null}

        <p className="text-sm text-muted-foreground">
          {carrierInfo.instructions}
        </p>

        {/* Carrier Info */}
        <p className="text-xs text-muted-foreground mt-3">
          Carrier detected: {carrierInfo.name}
          {carrier !== 'other' && carrier !== business.carrier && (
            <button 
              className="ml-2 text-blue-400 hover:text-blue-300 underline"
              onClick={() => {/* Could add carrier change UI here */}}
            >
              Not your carrier?
            </button>
          )}
        </p>
      </div>

      {/* Confirmation Button */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
        <button
          onClick={handleConfirmDisabled}
          disabled={isSubmitting}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-800 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {isSubmitting ? 'Saving...' : "I've disabled call forwarding"}
        </button>
        <p className="text-xs text-muted-foreground">
          Confirm after you've disabled forwarding from your business phone. This dismisses this warning.
        </p>
      </div>

      {/* Additional Help */}
      <div className="mt-4 pt-4 border-t border-red-800/30">
        <p className="text-xs text-red-200/70">
          Need help? Contact <a href="mailto:support@replyflowhq.com" className="text-red-300 hover:text-red-200 underline">support@replyflowhq.com</a> for assistance with disabling call forwarding.
        </p>
      </div>
    </div>
  )
}
