'use client'

import { useState } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { formatPhoneNumber } from '@/lib/utils'
import { CheckCircle2, Loader2, Copy, X } from 'lucide-react'

const CARRIERS = [
  { id: 'verizon', name: 'Verizon', code: '*71' },
  { id: 'at&t', name: 'AT&T', code: '*004*', suffix: '#' },
  { id: 't-mobile', name: 'T-Mobile', code: '**21*', suffix: '#' },
  { id: 'other', name: 'Other', code: null }
]

export default function ForwardingSetupModal() {
  const { business, refreshBusiness } = useBusiness()
  const supabase = createBrowserClient()
  const [selectedCarrier, setSelectedCarrier] = useState('')
  const [loading, setLoading] = useState(false)
  const [copiedNumber, setCopiedNumber] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)

  // Check if modal should show
  const shouldShow = 
    business &&
    business.twilio_phone_number &&
    (business.subscription_status === 'trialing' || business.subscription_status === 'active') &&
    !business.forwarding_verified &&
    business.onboarding_status === 'completed'

  if (!shouldShow) {
    return null
  }

  const handleCopyNumber = () => {
    if (business?.twilio_phone_number) {
      navigator.clipboard.writeText(business.twilio_phone_number)
      setCopiedNumber(true)
      setTimeout(() => setCopiedNumber(false), 2000)
    }
  }

  const handleCopyCode = () => {
    const code = getForwardingCode()
    if (code) {
      navigator.clipboard.writeText(code)
      setCopiedCode(true)
      setTimeout(() => setCopiedCode(false), 2000)
    }
  }

  const getForwardingCode = () => {
    if (!business?.twilio_phone_number) return ''
    const carrier = CARRIERS.find(c => c.id === selectedCarrier)
    if (!carrier || !carrier.code) return 'Contact your carrier to enable call forwarding'
    
    const phoneNumber = business.twilio_phone_number.replace(/^\+/, '')
    const code = carrier.code + ' ' + phoneNumber
    return carrier.suffix ? code + carrier.suffix : code
  }

  const handleCompleteSetup = async () => {
    if (!business) return

    setLoading(true)
    try {
      const { error } = await supabase
        .from('businesses')
        .update({
          forwarding_verified: true,
          forwarding_verified_at: new Date().toISOString(),
          carrier: selectedCarrier
        })
        .eq('id', business.id)

      if (error) throw error

      await refreshBusiness()
    } catch (error) {
      console.error('[ForwardingSetup] Failed to complete setup:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gray-800 border-b border-gray-700 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">Connect your business phone</h2>
            <p className="text-gray-400 text-sm">
              Forward missed calls to ReplyFlow so we can text customers back automatically.
            </p>
          </div>
          <button
            onClick={() => {
              // Allow user to dismiss by marking as verified (they chose to skip)
              if (business) {
                supabase
                  .from('businesses')
                  .update({ forwarding_verified: true })
                  .eq('id', business.id)
                  .then(() => refreshBusiness())
              }
            }}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* ReplyFlow Number */}
          <div className="bg-blue-900/20 border border-blue-800 rounded-xl p-6">
            <p className="text-blue-400 text-sm mb-2">Your ReplyFlow number:</p>
            <div className="flex items-center justify-between gap-4">
              <p className="text-3xl font-mono font-semibold text-white">
                {formatPhoneNumber(business.twilio_phone_number)}
              </p>
              <button
                onClick={handleCopyNumber}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {copiedNumber ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Carrier Selection */}
          <div>
            <p className="text-white font-medium mb-3">What carrier does your business phone use?</p>
            <div className="grid grid-cols-2 gap-3">
              {CARRIERS.map(carrier => (
                <button
                  key={carrier.id}
                  onClick={() => setSelectedCarrier(carrier.id)}
                  className={`p-4 rounded-xl border-2 transition text-left ${
                    selectedCarrier === carrier.id
                      ? 'border-blue-600 bg-blue-600/20'
                      : 'border-gray-700 hover:border-gray-600 bg-gray-800'
                  }`}
                >
                  <div className="text-lg font-semibold text-white">{carrier.name}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Forwarding Instructions */}
          {selectedCarrier && (
            <div className="bg-gray-700 rounded-xl p-6 space-y-4">
              <div>
                <p className="text-gray-400 text-sm mb-2">STEP 1: From your business phone, dial:</p>
                <div className="flex items-center justify-between gap-4">
                  <p className="text-3xl font-mono font-semibold text-white">
                    {getForwardingCode()}
                  </p>
                  <button
                    onClick={handleCopyCode}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {copiedCode ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div>
                <p className="text-gray-400 text-sm mb-2">STEP 2:</p>
                <p className="text-white">Call your business number from another phone and let it ring.</p>
              </div>

              <div>
                <p className="text-gray-400 text-sm mb-2">STEP 3:</p>
                <p className="text-white">ReplyFlow will automatically text the customer back.</p>
              </div>

              <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-4">
                <p className="text-blue-300 text-sm">
                  ✓ Customers still call your normal business number
                </p>
                <p className="text-blue-300 text-sm">
                  ✓ Your phone still rings normally
                </p>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleCompleteSetup}
              disabled={!selectedCarrier || loading}
              className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Saving...
                </>
              ) : (
                'I Enabled Forwarding'
              )}
            </button>
            <button
              onClick={() => {
                if (business) {
                  supabase
                    .from('businesses')
                    .update({ forwarding_verified: true })
                    .eq('id', business.id)
                    .then(() => refreshBusiness())
                }
              }}
              className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-xl transition-colors"
            >
              Skip for Now
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
