'use client'

import { useState, useEffect } from 'react'
import { X, User, Copy, ExternalLink } from 'lucide-react'
import { formatCurrency, formatPhoneNumber } from '@/lib/utils'
import { getPaymentStatusStyle } from '@/lib/payment-status'

interface PaymentEditModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (label: string) => Promise<void>
  onViewCustomer?: (customerId: string) => void
  onCopyLink?: (url: string) => void
  onCancelPayment?: (payment: any) => void
  isCancelling?: boolean
  payment: {
    id: string
    amount_cents: number
    description: string
    status: string
    created_at: string
    paid_at: string | null
    checkout_url: string | null
    payment_provider: string | null
    payment_method_type: string | null
    display_name: string | null
    leads: {
      id: string
      caller_phone: string
      raw_metadata: any
    } | null
    jobs: {
      id: string
      title: string
    } | null
  } | null
  currentLabel: string
  methodBadge: React.ReactNode
}

export default function PaymentEditModal({
  isOpen,
  onClose,
  onSave,
  onViewCustomer,
  onCopyLink,
  onCancelPayment,
  isCancelling,
  payment,
  currentLabel,
  methodBadge,
}: PaymentEditModalProps) {
  const [label, setLabel] = useState(currentLabel)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  // Reset form when payment changes or modal opens/closes
  useEffect(() => {
    if (isOpen && payment) {
      setLabel(currentLabel)
      setError('')
    }
  }, [isOpen, payment, currentLabel])

  if (!payment) return null

  const handleSave = async () => {
    if (!label.trim()) return

    setIsSaving(true)
    setError('')

    try {
      await onSave(label)
      onClose()
    } catch (err) {
      console.error('Error saving payment label:', err)
      setError(err instanceof Error ? err.message : 'Failed to save payment label')
    } finally {
      setIsSaving(false)
    }
  }

  const handleClose = () => {
    setLabel(currentLabel)
    setError('')
    onClose()
  }

  const statusStyle = getPaymentStatusStyle(payment.status)

  const isSmsLink = payment.payment_method_type === 'card' && payment.checkout_url
  const isPending = payment.status === 'pending'
  const hasCustomer = payment.leads !== null

  const handleCopyLink = () => {
    if (onCopyLink && payment.checkout_url) {
      onCopyLink(payment.checkout_url)
    }
  }

  const handleViewCustomer = () => {
    if (onViewCustomer && payment.leads) {
      onViewCustomer(payment.leads.id)
    }
  }

  const handleCancel = () => {
    if (onCancelPayment) {
      onCancelPayment(payment)
    }
  }

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-sm md:items-center md:justify-center">
          <div className="bg-card dark:bg-[#1e293b] rounded-xl shadow-xl max-w-md w-full max-h-[calc(100dvh-1rem)] md:max-h-[90vh] overflow-hidden flex flex-col border border-slate-200 dark:border-slate-700">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3.5 md:px-5 md:py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
              <div className="min-w-0 pr-3">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground leading-tight">
                  Edit Payment
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                  View payment details and manage this payment
                </p>
              </div>
              <button
                onClick={handleClose}
                className="p-1.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Header Summary */}
            <div className="px-4 py-3 md:px-5 md:py-4 bg-slate-50 dark:bg-slate-900/30 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="text-xl font-semibold text-slate-900 dark:text-foreground">
                  {formatCurrency(payment.amount_cents / 100)}
                </div>
                {methodBadge}
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${statusStyle.badgeClass}`}>
                  {statusStyle.label}
                </span>
              </div>
            </div>

            {/* Content */}
            <div className="overflow-y-auto flex-1 px-4 py-3 md:px-5 md:py-4 space-y-4">
              {/* Payment Details Section */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-slate-900 dark:text-foreground">Payment Details</h4>
                
                {payment.leads && (
                  <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-sm text-slate-600 dark:text-slate-400">Customer</span>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-slate-400" />
                      <span className="text-sm font-medium text-slate-900 dark:text-foreground">
                        {payment.leads.raw_metadata?.customer_name || 'Unknown'}
                      </span>
                    </div>
                  </div>
                )}

                {payment.leads && (
                  <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-sm text-slate-600 dark:text-slate-400">Phone</span>
                    <span className="text-sm text-slate-900 dark:text-foreground">
                      {formatPhoneNumber(payment.leads.caller_phone)}
                    </span>
                  </div>
                )}

                {payment.description && (
                  <div className="flex items-start justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-sm text-slate-600 dark:text-slate-400">Description</span>
                    <span className="text-sm text-slate-900 dark:text-foreground text-right max-w-[60%]">
                      {payment.description}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-sm text-slate-600 dark:text-slate-400">Requested</span>
                  <span className="text-sm text-slate-900 dark:text-foreground">
                    {new Date(payment.created_at).toLocaleDateString()}
                  </span>
                </div>

                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-slate-600 dark:text-slate-400">Paid</span>
                  <span className="text-sm text-slate-900 dark:text-foreground">
                    {payment.paid_at ? new Date(payment.paid_at).toLocaleDateString() : '—'}
                  </span>
                </div>
              </div>

              {/* SMS Link Actions Section */}
              {isSmsLink && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-slate-900 dark:text-foreground">Payment Actions</h4>

                  {hasCustomer && onViewCustomer && (
                    <button
                      onClick={handleViewCustomer}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm text-left text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                    >
                      <span>View Customer</span>
                      <span className="text-blue-600 dark:text-blue-400">→</span>
                    </button>
                  )}

                  {isPending && payment.checkout_url && (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={handleCopyLink}
                        className="flex items-center justify-center gap-2 px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                      >
                        <Copy className="h-4 w-4" />
                        <span>Copy Link</span>
                      </button>
                      <a
                        href={payment.checkout_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                      >
                        <ExternalLink className="h-4 w-4" />
                        <span>Open Link</span>
                      </a>
                    </div>
                  )}

                  {isPending && onCancelPayment && (
                    <button
                      onClick={handleCancel}
                      disabled={isCancelling}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span>{isCancelling ? 'Canceling...' : 'Cancel Payment'}</span>
                    </button>
                  )}
                </div>
              )}

              {/* Payment Name Section */}
              <div>
                <label className="block text-sm font-medium text-slate-900 dark:text-foreground mb-1.5 md:mb-2">
                  Payment name
                </label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g., Kitchen deposit, Emergency repair"
                  maxLength={80}
                  disabled={isSaving}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white disabled:opacity-60 disabled:cursor-not-allowed"
                />
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5">
                  This name is only for organizing payments in ReplyFlow. It won't change the customer name or affect receipts.
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  {label.length}/80 characters
                </p>
              </div>

              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg">
                  <p className="text-sm text-red-700 dark:text-red-200">{error}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-2.5 justify-end px-4 py-3 md:px-5 md:py-4 border-t border-slate-200 dark:border-slate-700 shrink-0">
              <button
                onClick={handleClose}
                disabled={isSaving}
                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || !label.trim()}
                className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}