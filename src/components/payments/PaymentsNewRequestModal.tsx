'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { formatPhoneNumber } from '@/lib/utils'
import Modal from '@/components/ui/Modal'
import { useModalBackButton } from '@/hooks/useModalBackButton'
import type { JobPrefill } from '@/components/jobs/JobComposer'

interface Business {
  id: string
  stripe_connect_account_id?: string | null
  stripe_connect_status?: string | null
  stripe_charges_enabled?: boolean | null
  venmo_username?: string | null
  paypal_payment_link?: string | null
}

interface PaymentsNewRequestModalProps {
  isOpen: boolean
  onClose: () => void
  business: Business
  paymentPrefill?: JobPrefill
  onSubmit: (data: {
    amount: string
    description: string
    paymentProvider: 'stripe' | 'venmo' | 'paypal'
  }) => Promise<void>
  onChangeCustomer?: () => void
}

export default function PaymentsNewRequestModal({
  isOpen,
  onClose,
  business,
  paymentPrefill,
  onSubmit,
  onChangeCustomer,
}: PaymentsNewRequestModalProps) {
  const router = useRouter()
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentDescription, setPaymentDescription] = useState('')
  const [paymentProvider, setPaymentProvider] = useState<'stripe' | 'venmo' | 'paypal'>('stripe')
  const [isCreatingPayment, setIsCreatingPayment] = useState(false)
  const [error, setError] = useState('')

  // Handle Android back button
  useModalBackButton({ isOpen, onClose })

  // Determine which payment methods are configured
  const isStripeConfigured = business?.stripe_connect_status === 'connected' && business?.stripe_charges_enabled === true
  const isVenmoConfigured = business?.venmo_username && business.venmo_username.length > 0
  const isPaypalConfigured = business?.paypal_payment_link && business.paypal_payment_link.length > 0

  const configuredPaymentMethods = ['stripe', 'venmo', 'paypal'].filter(method => {
    if (method === 'stripe') return isStripeConfigured
    if (method === 'venmo') return isVenmoConfigured
    if (method === 'paypal') return isPaypalConfigured
    return false
  }) as Array<'stripe' | 'venmo' | 'paypal'>

  const hasAnyPaymentMethod = configuredPaymentMethods.length > 0

  // Auto-select first available method when modal opens
  useEffect(() => {
    if (isOpen && configuredPaymentMethods.length > 0) {
      setPaymentProvider(configuredPaymentMethods[0])
    }
  }, [isOpen, configuredPaymentMethods])

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setPaymentAmount('')
      setPaymentDescription('')
      setPaymentProvider('stripe')
      setError('')
    }
  }, [isOpen])

  const handleClose = () => {
    onClose()
  }

  const handleChangeCustomer = () => {
    if (onChangeCustomer) {
      onChangeCustomer()
    }
    onClose()
  }

  const handleSubmit = async () => {
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
      setError('Please enter a valid amount')
      return
    }

    if (!paymentPrefill?.lead_id) {
      setError('Customer is required')
      return
    }

    if (!hasAnyPaymentMethod) {
      setError('No payment method configured')
      return
    }

    setIsCreatingPayment(true)
    setError('')

    try {
      await onSubmit({
        amount: paymentAmount,
        description: paymentDescription,
        paymentProvider,
      })
      handleClose()
    } catch (err) {
      console.error('Error creating payment request:', err)
      setError(err instanceof Error ? err.message : 'Failed to create payment request')
    } finally {
      setIsCreatingPayment(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="New Payment Request"
      footer={
        <div className="flex gap-2.5 justify-end">
          <button
            onClick={handleClose}
            disabled={isCreatingPayment}
            className="px-4 py-2 text-sm font-medium text-foreground hover:bg-muted dark:text-gray-300 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isCreatingPayment || !paymentAmount || parseFloat(paymentAmount) <= 0 || !paymentPrefill?.lead_id || !hasAnyPaymentMethod}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCreatingPayment ? 'Sending Request...' : 'Send Payment Request'}
          </button>
        </div>
      }
    >
      <div className="space-y-2.5 md:space-y-3">
        <p className="text-xs sm:text-sm text-muted-foreground">
          Send a secure payment link by text.
        </p>
        {paymentPrefill && (
          <div className="p-3 bg-muted/50 dark:bg-[#0f172a] border border-border dark:border-slate-700 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Customer</p>
                <p className="text-sm font-medium text-foreground">
                  {paymentPrefill.customer_name || 'Customer'}
                </p>
                {paymentPrefill.customer_phone && (
                  <p className="text-xs text-muted-foreground">
                    {formatPhoneNumber(paymentPrefill.customer_phone)}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={handleChangeCustomer}
                disabled={isCreatingPayment}
                className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 disabled:opacity-50"
              >
                Change
              </button>
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5 md:mb-2">
            Amount (USD)
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
            <input
              type="number"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              placeholder="0.00"
              step="0.01"
              min="0.01"
              disabled={isCreatingPayment}
              className="w-full pl-8 pr-3 py-2 border border-border dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-background dark:bg-[#0f172a] text-foreground dark:text-white disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5 md:mb-2">
            Payment Method
          </label>
          {hasAnyPaymentMethod ? (
            <div className="grid grid-cols-3 gap-2.5 pt-0.5">
              <div className="relative pb-5">
                <button
                  type="button"
                  onClick={() => isStripeConfigured && setPaymentProvider('stripe')}
                  disabled={isCreatingPayment}
                  className={`w-full min-h-[44px] px-2 py-2 text-xs sm:text-sm font-medium rounded-lg border transition-all ${
                    paymentProvider === 'stripe' && isStripeConfigured
                      ? 'bg-blue-600 border-blue-400 text-white shadow-[0_0_0_1px_rgba(96,165,250,0.35),0_8px_24px_rgba(37,99,235,0.25)]'
                      : !isStripeConfigured
                      ? 'bg-muted dark:bg-slate-800/60 border-border dark:border-slate-700 text-muted-foreground dark:text-slate-500'
                      : 'bg-background dark:bg-[#0f172a] border-border dark:border-slate-600 text-foreground dark:text-gray-300 hover:bg-muted dark:hover:border-slate-500'
                  }`}
                >
                  Stripe
                </button>
                {!isStripeConfigured && (
                  <button
                    type="button"
                    onClick={() => {
                      router.push('/dashboard/settings#payments')
                      handleClose()
                    }}
                    className="absolute bottom-0 left-0 right-0 text-[10px] md:text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium text-center"
                  >
                    Configure →
                  </button>
                )}
              </div>
              <div className="relative pb-5">
                <button
                  type="button"
                  onClick={() => isVenmoConfigured && setPaymentProvider('venmo')}
                  disabled={isCreatingPayment}
                  className={`w-full min-h-[44px] px-2 py-2 text-xs sm:text-sm font-medium rounded-lg border transition-all ${
                    paymentProvider === 'venmo' && isVenmoConfigured
                      ? 'bg-blue-600 border-blue-400 text-white shadow-[0_0_0_1px_rgba(96,165,250,0.35),0_8px_24px_rgba(37,99,235,0.25)]'
                      : !isVenmoConfigured
                      ? 'bg-muted dark:bg-slate-800/60 border-border dark:border-slate-700 text-muted-foreground dark:text-slate-500'
                      : 'bg-background dark:bg-[#0f172a] border-border dark:border-slate-600 text-foreground dark:text-gray-300 hover:bg-muted dark:hover:border-slate-500'
                  }`}
                >
                  Venmo
                </button>
                {!isVenmoConfigured && (
                  <button
                    type="button"
                    onClick={() => {
                      router.push('/dashboard/settings#payments-venmo')
                      handleClose()
                    }}
                    className="absolute bottom-0 left-0 right-0 text-[10px] md:text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium text-center"
                  >
                    Configure →
                  </button>
                )}
              </div>
              <div className="relative pb-5">
                <button
                  type="button"
                  onClick={() => isPaypalConfigured && setPaymentProvider('paypal')}
                  disabled={isCreatingPayment}
                  className={`w-full min-h-[44px] px-2 py-2 text-xs sm:text-sm font-medium rounded-lg border transition-all ${
                    paymentProvider === 'paypal' && isPaypalConfigured
                      ? 'bg-blue-600 border-blue-400 text-white shadow-[0_0_0_1px_rgba(96,165,250,0.35),0_8px_24px_rgba(37,99,235,0.25)]'
                      : !isPaypalConfigured
                      ? 'bg-muted dark:bg-slate-800/60 border-border dark:border-slate-700 text-muted-foreground dark:text-slate-500'
                      : 'bg-background dark:bg-[#0f172a] border-border dark:border-slate-600 text-foreground dark:text-gray-300 hover:bg-muted dark:hover:border-slate-500'
                  }`}
                >
                  PayPal
                </button>
                {!isPaypalConfigured && (
                  <button
                    type="button"
                    onClick={() => {
                      router.push('/dashboard/settings#payments-paypal')
                      handleClose()
                    }}
                    className="absolute bottom-0 left-0 right-0 text-[10px] md:text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium text-center"
                  >
                    Configure →
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="p-3 md:p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/50 rounded-lg">
              <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-2 md:mb-3">
                No payment methods have been configured yet.
              </p>
              <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-2 md:mb-3">
                Connect Stripe, Venmo, or PayPal in your account settings to start accepting payments.
              </p>
              <button
                onClick={() => {
                  router.push('/dashboard/settings#payments')
                  handleClose()
                }}
                className="px-3 py-1.5 md:px-4 md:py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                Configure Payment Methods
              </button>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5 md:mb-2">
            Description
          </label>
          <textarea
            value={paymentDescription}
            onChange={(e) => setPaymentDescription(e.target.value)}
            placeholder="Service payment"
            rows={2}
            disabled={isCreatingPayment}
            className="w-full px-3 py-2 min-h-[76px] border border-border dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-background dark:bg-[#0f172a] text-foreground dark:text-white resize-none disabled:opacity-60 disabled:cursor-not-allowed"
          />
        </div>

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg">
            <p className="text-sm text-red-700 dark:text-red-200">{error}</p>
          </div>
        )}
      </div>
    </Modal>
  )
}