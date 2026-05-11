'use client'

import { useEffect, useState, useRef } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { formatPhoneNumber } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, Loader2, ArrowRight } from 'lucide-react'

interface ProvisioningSuccessBannerProps {
  checkoutSuccess?: boolean
}

export default function ProvisioningSuccessBanner({ checkoutSuccess = false }: ProvisioningSuccessBannerProps) {
  const { business, refreshBusiness } = useBusiness()
  const router = useRouter()
  const gettingStartedRef = useRef<HTMLDivElement>(null)
  const [isPolling, setIsPolling] = useState(false)
  const [pollCount, setPollCount] = useState(0)

  // Auto-expand Getting Started after checkout success
  useEffect(() => {
    if (checkoutSuccess && business?.provisioning_status === 'attached') {
      // Find Getting Started component and expand it
      const gettingStartedElement = document.querySelector('[data-getting-started]')
      if (gettingStartedElement) {
        // Dispatch custom event to expand Getting Started
        const event = new CustomEvent('expandGettingStarted')
        window.dispatchEvent(event)
      }
    }
  }, [checkoutSuccess, business?.provisioning_status])

  // Poll for provisioning status when checkout success and not attached yet
  useEffect(() => {
    if (!checkoutSuccess || !business) return

    const shouldPoll = 
      business.provisioning_status === 'provisioning' || 
      (!business.twilio_phone_number && business.subscription_status !== 'incomplete')

    if (!shouldPoll || pollCount >= 20) {
      setIsPolling(false)
      return
    }

    setIsPolling(true)
    const pollInterval = setInterval(async () => {
      console.log('[ProvisioningBanner] Polling provisioning status...')
      await refreshBusiness()
      setPollCount(prev => prev + 1)
    }, 2000)

    return () => clearInterval(pollInterval)
  }, [checkoutSuccess, business, refreshBusiness, pollCount])

  // Scroll to forwarding setup section after provisioning completes
  useEffect(() => {
    if (checkoutSuccess && business?.provisioning_status === 'attached' && business.twilio_phone_number) {
      console.log('[ProvisioningBanner] Provisioning complete, scrolling to Getting Started...')
      // Scroll to Getting Started component
      gettingStartedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [checkoutSuccess, business?.provisioning_status, business?.twilio_phone_number])

  // Only show banner after checkout success
  if (!checkoutSuccess) {
    return null
  }

  // Show pending state if provisioning is in progress
  if (business?.provisioning_status === 'provisioning' || (!business?.twilio_phone_number && business?.provisioning_status !== 'failed')) {
    return (
      <div 
        ref={gettingStartedRef}
        className="bg-blue-900/20 border border-blue-800 rounded-xl p-6 mb-6"
      >
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-blue-100 mb-2">
              Setting up your ReplyFlow number...
            </h3>
            <p className="text-sm text-blue-300 mb-4">
              We're provisioning your dedicated phone number. This usually takes 10-20 seconds.
            </p>
            {isPolling && (
              <div className="flex items-center gap-2 text-xs text-blue-400">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Checking status... ({pollCount}/20)</span>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Show error state if provisioning failed
  if (business?.provisioning_status === 'failed') {
    return (
      <div 
        ref={gettingStartedRef}
        className="bg-red-900/20 border border-red-800 rounded-xl p-6 mb-6"
      >
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            <div className="w-6 h-6 bg-red-600 rounded-full flex items-center justify-center">
              <span className="text-white text-sm">✕</span>
            </div>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-red-100 mb-2">
              Number provisioning failed
            </h3>
            <p className="text-sm text-red-300 mb-4">
              {business.provisioning_error || 'Something went wrong while provisioning your number. Please try again.'}
            </p>
            <Link
              href="/dashboard/settings"
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Retry Provisioning
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Show success state when provisioning is attached
  if (business?.provisioning_status === 'attached' && business.twilio_phone_number) {
    return (
      <div 
        ref={gettingStartedRef}
        data-getting-started
        className="bg-green-900/20 border border-green-800 rounded-xl p-6 mb-6"
      >
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-white" />
            </div>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-green-100 mb-2">
              Your ReplyFlow number is ready
            </h3>
            <p className="text-sm text-green-300 mb-4">
              To activate ReplyFlow, forward missed calls from your business phone to your ReplyFlow number.
            </p>
            
            <div className="bg-green-900/30 rounded-lg p-4 mb-4">
              <p className="text-xs text-green-400 mb-1">Your ReplyFlow number:</p>
              <p className="text-2xl font-mono font-semibold text-green-100">
                {formatPhoneNumber(business.twilio_phone_number)}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/onboarding/phone-setup"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                View Forwarding Instructions
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/dashboard/test-setup"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-green-700 hover:bg-green-800 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Test Setup
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return null
}
