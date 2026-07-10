'use client'

import { useState, useEffect, useMemo } from 'react'
import { X } from 'lucide-react'
import { formatCurrency, formatPhoneNumber } from '@/lib/utils'
import { getLeadAIIntake } from '@/lib/ai-field-mapping'
import { createBrowserClient } from '@/lib/supabase/browser'

interface Lead {
  id: string
  caller_phone: string
  raw_metadata: any
}

interface Business {
  id: string
  stripe_connect_account_id?: string | null
  stripe_connect_status?: string | null
  stripe_charges_enabled?: boolean | null
  venmo_username?: string | null
  paypal_payment_link?: string | null
}

interface RequestPaymentModalProps {
  isOpen: boolean
  onClose: () => void
  business: Business
  onPaymentCreated?: () => void
  prefillLeadId?: string
  prefillDescription?: string
}

export default function RequestPaymentModal({
  isOpen,
  onClose,
  business,
  onPaymentCreated,
  prefillLeadId,
  prefillDescription,
}: RequestPaymentModalProps) {
  const [recipientType, setRecipientType] = useState<'lead' | 'manual'>('lead')
  const [selectedLeadId, setSelectedLeadId] = useState('')
  const [manualPhone, setManualPhone] = useState('')
  const [manualName, setManualName] = useState('')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentDescription, setPaymentDescription] = useState('')
  const [paymentProvider, setPaymentProvider] = useState<'stripe' | 'venmo' | 'paypal'>('stripe')
  const [isCreatingPayment, setIsCreatingPayment] = useState(false)
  const [error, setError] = useState('')
  const [leads, setLeads] = useState<Lead[]>([])

  // Determine which payment methods are configured
  const isStripeConfigured = business?.stripe_connect_status === 'connected' && business?.stripe_charges_enabled === true
  const isVenmoConfigured = business?.venmo_username && business.venmo_username.length > 0
  const isPaypalConfigured = business?.paypal_payment_link && business.paypal_payment_link.length > 0

  const configuredPaymentMethods = useMemo(() => {
    const methods: Array<'stripe' | 'venmo' | 'paypal'> = []
    if (isStripeConfigured) methods.push('stripe')
    if (isVenmoConfigured) methods.push('venmo')
    if (isPaypalConfigured) methods.push('paypal')
    return methods
  }, [isStripeConfigured, isVenmoConfigured, isPaypalConfigured])

  const hasAnyPaymentMethod = configuredPaymentMethods.length > 0

  // Auto-select first available method when modal opens
  useEffect(() => {
    if (isOpen && configuredPaymentMethods.length > 0) {
      setPaymentProvider(configuredPaymentMethods[0])
    }
  }, [isOpen, configuredPaymentMethods])

  // Auto-switch if current selection becomes unavailable
  useEffect(() => {
    if (paymentProvider === 'stripe' && !isStripeConfigured && configuredPaymentMethods.length > 0) {
      setPaymentProvider(configuredPaymentMethods[0])
    } else if (paymentProvider === 'venmo' && !isVenmoConfigured && configuredPaymentMethods.length > 0) {
      setPaymentProvider(configuredPaymentMethods[0])
    } else if (paymentProvider === 'paypal' && !isPaypalConfigured && configuredPaymentMethods.length > 0) {
      setPaymentProvider(configuredPaymentMethods[0])
    }
  }, [isStripeConfigured, isVenmoConfigured, isPaypalConfigured, configuredPaymentMethods, paymentProvider])

  // Prefill lead and description when modal opens
  useEffect(() => {
    if (isOpen) {
      if (prefillLeadId) {
        setSelectedLeadId(prefillLeadId)
        setRecipientType('lead')
      }
      if (prefillDescription) {
        setPaymentDescription(prefillDescription)
      }
      fetchLeads()
    } else {
      // Reset when closed
      setSelectedLeadId('')
      setManualPhone('')
      setManualName('')
      setPaymentAmount('')
      setPaymentDescription('')
      setPaymentProvider('stripe')
      setError('')
    }
  }, [isOpen, prefillLeadId, prefillDescription])

  const fetchLeads = async () => {
    try {
      const supabase = createBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      const response = await fetch('/api/leads', { headers })
      if (!response.ok) return
      const data = await response.json()
      setLeads(data.leads || [])
    } catch (err) {
      console.error('Error fetching leads:', err)
    }
  }

  function formatManualPhoneInput(value: string): string {
    const digits = value.replace(/\D/g, '').slice(0, 10)

    if (digits.length <= 3) {
      return digits
    }

    if (digits.length <= 6) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
    }

    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }

  const handleCreatePayment = async () => {
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
      setError('Please enter a valid amount')
      return
    }

    if (recipientType === 'lead' && !selectedLeadId) {
      setError('Please select a lead')
      return
    }

    if (recipientType === 'manual' && !manualPhone) {
      setError('Please enter a phone number')
      return
    }

    // Client-side validation for payment method configuration
    if (paymentProvider === 'venmo' && !business?.venmo_username) {
      setError('Venmo hasn\'t been connected yet. Connect Venmo in Settings → Payments before sending Venmo payment requests.')
      return
    }

    if (paymentProvider === 'paypal' && !business?.paypal_payment_link) {
      setError('PayPal hasn\'t been connected yet. Connect PayPal in Settings → Payments before sending PayPal payment requests.')
      return
    }

    if (paymentProvider === 'stripe' && (!business?.stripe_connect_account_id || business.stripe_connect_status !== 'connected' || !business.stripe_charges_enabled)) {
      setError('Stripe hasn\'t been connected yet. Connect Stripe in Settings → Payments before sending Stripe payment requests.')
      return
    }

    setIsCreatingPayment(true)
    setError('')

    try {
      const supabase = createBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        throw new Error('Not authenticated')
      }

      let leadId: string
      let conversationId: string

      if (recipientType === 'manual') {
        // Create lead/conversation for manual phone number
        const createResponse = await fetch('/api/leads', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            phone: manualPhone,
            name: manualName || undefined,
          }),
        })

        if (!createResponse.ok) {
          const contentType = createResponse.headers.get('content-type')
          let errorMessage = 'Failed to create lead'
          
          if (contentType && contentType.includes('application/json')) {
            try {
              const error = await createResponse.json()
              errorMessage = error.error || errorMessage
            } catch (e) {
              console.error('Failed to parse error JSON:', e)
            }
          } else {
            const text = await createResponse.text()
            console.error('Non-JSON error response:', text)
            errorMessage = 'Server error creating lead'
          }
          
          throw new Error(errorMessage)
        }

        const contentType = createResponse.headers.get('content-type')
        if (!contentType || !contentType.includes('application/json')) {
          const text = await createResponse.text()
          console.error('Non-JSON response:', text)
          throw new Error('Invalid response from server')
        }

        const createData = await createResponse.json()
        leadId = createData.lead.id
        conversationId = createData.conversation?.id
      } else {
        // Use existing lead
        const selectedLead = leads.find(l => l.id === selectedLeadId)
        if (!selectedLead) {
          throw new Error('Lead not found')
        }
        leadId = selectedLead.id
        conversationId = selectedLead.raw_metadata?.conversationId
      }

      const payload = {
        business_id: business?.id,
        lead_id: leadId,
        conversation_id: conversationId,
        amount_cents: Math.round(parseFloat(paymentAmount) * 100),
        description: paymentDescription || undefined,
        payment_provider: paymentProvider,
      }

      const response = await fetch('/api/payments/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create payment request')
      }

      onClose()
      setSelectedLeadId('')
      setManualPhone('')
      setManualName('')
      setPaymentAmount('')
      setPaymentDescription('')
      setPaymentProvider('stripe')
      
      // Notify parent that payment was created
      if (onPaymentCreated) {
        onPaymentCreated()
      }
    } catch (err) {
      console.error('Error creating payment request:', err)
      setError(err instanceof Error ? err.message : 'Failed to create payment request')
    } finally {
      setIsCreatingPayment(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-sm md:items-center md:justify-center">
      <div className="bg-[#1e293b] dark:bg-[#1e293b] rounded-xl shadow-xl max-w-md w-full max-h-[calc(100dvh-1rem)] md:max-h-[90vh] overflow-hidden flex flex-col border border-slate-700">
        {/* Header - shrink-0 */}
        <div className="flex items-center justify-between px-4 py-3.5 md:px-5 md:py-4 border-b border-slate-700 shrink-0">
          <div className="min-w-0 pr-3">
            <h3 className="text-lg font-semibold text-white leading-tight">
              New Payment Request
            </h3>
            <p className="text-xs sm:text-sm text-gray-400 mt-0.5">
              Send a secure payment link by text.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content - flex-1 overflow-y-auto */}
        <div data-scroll-lock-allow className="overflow-y-auto flex-1 overscroll-contain px-4 py-3 md:px-5 md:py-4 space-y-2.5 md:space-y-3" style={{ maxHeight: 'calc(100dvh-10rem)', WebkitOverflowScrolling: 'touch' }}>
          <div>
            <label className="block text-sm font-medium text-slate-100 mb-1.5">
              Recipient
            </label>
            <select
              value={recipientType}
              onChange={(e) => setRecipientType(e.target.value as 'lead' | 'manual')}
              disabled={isCreatingPayment}
              className="w-full px-3 py-2 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-[#0f172a] text-white disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <option value="lead">Select existing lead</option>
              <option value="manual">Enter phone number</option>
            </select>
          </div>

          {recipientType === 'lead' ? (
            <div>
              <label className="block text-sm font-medium text-slate-100 mb-1.5">
                Select Lead
              </label>
              <select
                value={selectedLeadId}
                onChange={(e) => setSelectedLeadId(e.target.value)}
                disabled={isCreatingPayment}
                className="w-full px-3 py-2 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-[#0f172a] text-white disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <option value="">Select a lead</option>
                {leads.map((lead) => {
                  const intake = getLeadAIIntake(lead)
                  const displayName = intake.customerName || 'Customer'
                  return (
                    <option key={lead.id} value={lead.id}>
                      {formatPhoneNumber(lead.caller_phone)} - {displayName}
                    </option>
                  )
                })}
              </select>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-100 mb-1.5">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={manualPhone}
                  onChange={(e) => setManualPhone(formatManualPhoneInput(e.target.value))}
                  placeholder="(555) 123-4567"
                  disabled={isCreatingPayment}
                  className="w-full px-3 py-2 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-[#0f172a] text-white disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-100 mb-1.5">
                  Customer Name
                </label>
                <input
                  type="text"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="Optional"
                  disabled={isCreatingPayment}
                  className="w-full px-3 py-2 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-[#0f172a] text-white disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-white mb-1.5 md:mb-2">
              Amount (USD)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
              <input
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="0.00"
                step="0.01"
                min="0.01"
                disabled={isCreatingPayment}
                className="w-full pl-8 pr-3 py-2 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-[#0f172a] text-white disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-1.5 md:mb-2">
              Payment Method
            </label>
            {hasAnyPaymentMethod ? (
              <div className="grid grid-cols-3 gap-2.5 pt-0.5">
                <button
                  type="button"
                  onClick={() => setPaymentProvider('stripe')}
                  disabled={!isStripeConfigured || isCreatingPayment}
                  className={`min-h-[44px] px-2 py-2 text-xs sm:text-sm font-medium rounded-lg border transition-all ${
                    paymentProvider === 'stripe' && isStripeConfigured
                      ? 'bg-blue-600 border-blue-400 text-white shadow-[0_0_0_1px_rgba(96,165,250,0.35),0_8px_24px_rgba(37,99,235,0.25)]'
                      : !isStripeConfigured
                      ? 'bg-slate-800/60 border-slate-700 text-slate-500 cursor-not-allowed opacity-50'
                      : 'bg-[#0f172a] border-slate-600 text-gray-300 hover:border-slate-500'
                  }`}
                >
                  Stripe
                  {!isStripeConfigured && (
                    <div className="text-[10px] md:text-xs text-slate-500 mt-0.5">Configure first</div>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentProvider('venmo')}
                  disabled={!isVenmoConfigured || isCreatingPayment}
                  className={`min-h-[44px] px-2 py-2 text-xs sm:text-sm font-medium rounded-lg border transition-all ${
                    paymentProvider === 'venmo' && isVenmoConfigured
                      ? 'bg-blue-600 border-blue-400 text-white shadow-[0_0_0_1px_rgba(96,165,250,0.35),0_8px_24px_rgba(37,99,235,0.25)]'
                      : !isVenmoConfigured
                      ? 'bg-slate-800/60 border-slate-700 text-slate-500 cursor-not-allowed opacity-50'
                      : 'bg-[#0f172a] border-slate-600 text-gray-300 hover:border-slate-500'
                  }`}
                >
                  Venmo
                  {!isVenmoConfigured && (
                    <div className="text-[10px] md:text-xs text-slate-500 mt-0.5">Configure first</div>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentProvider('paypal')}
                  disabled={!isPaypalConfigured || isCreatingPayment}
                  className={`min-h-[44px] px-2 py-2 text-xs sm:text-sm font-medium rounded-lg border transition-all ${
                    paymentProvider === 'paypal' && isPaypalConfigured
                      ? 'bg-blue-600 border-blue-400 text-white shadow-[0_0_0_1px_rgba(96,165,250,0.35),0_8px_24px_rgba(37,99,235,0.25)]'
                      : !isPaypalConfigured
                      ? 'bg-slate-800/60 border-slate-700 text-slate-500 cursor-not-allowed opacity-50'
                      : 'bg-[#0f172a] border-slate-600 text-gray-300 hover:border-slate-500'
                  }`}
                >
                  PayPal
                  {!isPaypalConfigured && (
                    <div className="text-[10px] md:text-xs text-slate-500 mt-0.5">Configure first</div>
                  )}
                </button>
              </div>
            ) : (
              <div className="p-3 md:p-4 bg-yellow-900/20 border border-yellow-700/50 rounded-lg">
                <p className="text-sm text-yellow-200 mb-2 md:mb-3">
                  No payment methods have been configured yet.
                </p>
                <p className="text-sm text-yellow-200 mb-2 md:mb-3">
                  Connect Stripe, Venmo, or PayPal in your account settings to start accepting payments.
                </p>
                <button
                  onClick={() => {
                    window.location.href = '/dashboard/settings#payments'
                    onClose()
                  }}
                  className="px-3 py-1.5 md:px-4 md:py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  Configure Payment Methods
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-1.5 md:mb-2">
              Description
            </label>
            <textarea
              value={paymentDescription}
              onChange={(e) => setPaymentDescription(e.target.value)}
              placeholder="Service payment"
              rows={2}
              disabled={isCreatingPayment}
              className="w-full px-3 py-2 min-h-[76px] border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-[#0f172a] text-white resize-none disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg">
              <p className="text-sm text-red-200">{error}</p>
            </div>
          )}
        </div>

        {/* Footer/Actions - shrink-0 */}
        <div className="flex gap-2.5 justify-end px-4 py-3 md:px-5 md:py-4 border-t border-slate-700 shrink-0 pb-safe bg-[#1e293b]">
          <button
            onClick={onClose}
            disabled={isCreatingPayment}
            className="px-4 py-2 text-sm font-medium text-gray-300 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleCreatePayment}
            disabled={isCreatingPayment || !paymentAmount || parseFloat(paymentAmount) <= 0 || (recipientType === 'lead' && !selectedLeadId) || (recipientType === 'manual' && !manualPhone) || !hasAnyPaymentMethod}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCreatingPayment ? 'Sending Request...' : 'Send Payment Request'}
          </button>
        </div>
      </div>
    </div>
  )
}
