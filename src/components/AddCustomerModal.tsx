'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'

interface AddCustomerModalProps {
  isOpen: boolean
  onClose: () => void
  returnTo?: string
  onLeadCreated?: (leadId: string) => void
}

export default function AddCustomerModal({ isOpen, onClose, returnTo, onLeadCreated }: AddCustomerModalProps) {
  const router = useRouter()
  const { business } = useBusiness()
  const supabase = createBrowserClient()
  useBodyScrollLock(isOpen)

  const [formData, setFormData] = useState({
    customerName: '',
    phoneNumber: '',
    serviceRequested: '',
    address: '',
    desiredCompletion: '',
    callbackTime: '',
    notes: ''
  })

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validate required fields
    if (!formData.phoneNumber.trim()) {
      setError('Phone number is required')
      return
    }

    // Validate phone format
    const phoneDigits = formData.phoneNumber.replace(/\D/g, '')
    if (phoneDigits.length < 10) {
      setError('Please enter a valid phone number')
      return
    }

    setIsSubmitting(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        throw new Error('Not authenticated')
      }

      const response = await fetch('/api/leads/manual-create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          businessId: business?.id,
          customerName: formData.customerName.trim() || undefined,
          phoneNumber: formData.phoneNumber.trim(),
          serviceRequested: formData.serviceRequested.trim() || undefined,
          address: formData.address.trim() || undefined,
          desiredCompletion: formData.desiredCompletion.trim() || undefined,
          callbackTime: formData.callbackTime.trim() || undefined,
          notes: formData.notes.trim() || undefined
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add customer')
      }

      // Close modal
      onClose()

      // Reset form
      setFormData({
        customerName: '',
        phoneNumber: '',
        serviceRequested: '',
        address: '',
        desiredCompletion: '',
        callbackTime: '',
        notes: ''
      })

      // If a workflow provided a callback, hand the lead back without redirecting
      if (data.leadId && onLeadCreated) {
        onLeadCreated(data.leadId)
      } else if (data.leadId) {
        if (returnTo === 'calendar') {
          // Return to calendar page with the new lead selected for job creation
          router.push('/dashboard/calendar?createJob=true&leadId=' + data.leadId)
        } else {
          // Default: redirect to lead detail page
          router.push(`/dashboard/leads/${data.leadId}`)
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to add customer')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    setError(null)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md">
      <div className="relative w-full max-w-lg max-h-[calc(100dvh-8rem-env(safe-area-inset-bottom))] md:max-h-[90vh] overflow-hidden rounded-2xl border border-white/10 bg-slate-900/90 shadow-[0_1px_0_rgba(255,255,255,0.06),0_28px_90px_rgba(2,6,23,0.65)] backdrop-blur-xl flex flex-col">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-300/40 to-transparent" />
        
        {/* Sticky Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-white/10 bg-white/[0.025] flex-shrink-0">
          <h2 className="text-xl font-semibold text-white">Add Customer</h2>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="overflow-y-auto flex-1 overflow-x-hidden">
          <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-3 sm:space-y-4">
            {/* Required Fields */}
            <div className="space-y-3 sm:space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Phone Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  value={formData.phoneNumber}
                  onChange={(e) => handleInputChange('phoneNumber', e.target.value)}
                  placeholder="+1 (555) 123-4567"
                  className="premium-input w-full px-3 py-2.5 rounded-lg focus:outline-none"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Customer Name
                </label>
                <input
                  type="text"
                  value={formData.customerName}
                  onChange={(e) => handleInputChange('customerName', e.target.value)}
                  placeholder="John Smith"
                  className="premium-input w-full px-3 py-2.5 rounded-lg focus:outline-none"
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {/* Recommended Fields */}
            <div className="space-y-3 sm:space-y-4 pt-3 sm:pt-4 border-t border-white/10">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Service Requested
                </label>
                <input
                  type="text"
                  value={formData.serviceRequested}
                  onChange={(e) => handleInputChange('serviceRequested', e.target.value)}
                  placeholder="Plumbing repair, HVAC service, etc."
                  className="premium-input w-full px-3 py-2.5 rounded-lg focus:outline-none"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Service Address
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                  placeholder="123 Main St, City, State"
                  className="premium-input w-full px-3 py-2.5 rounded-lg focus:outline-none"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Desired Completion
                </label>
                <input
                  type="text"
                  value={formData.desiredCompletion}
                  onChange={(e) => handleInputChange('desiredCompletion', e.target.value)}
                  placeholder="ASAP, Next week, etc."
                  className="premium-input w-full px-3 py-2.5 rounded-lg focus:outline-none"
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {/* Optional Fields */}
            <div className="space-y-3 sm:space-y-4 pt-3 sm:pt-4 border-t border-white/10">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Best Callback Time
                </label>
                <input
                  type="text"
                  value={formData.callbackTime}
                  onChange={(e) => handleInputChange('callbackTime', e.target.value)}
                  placeholder="Morning, Afternoon, etc."
                  className="premium-input w-full px-3 py-2.5 rounded-lg focus:outline-none"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Notes
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => handleInputChange('notes', e.target.value)}
                  placeholder="Any additional details..."
                  rows={3}
                  className="premium-input w-full px-3 py-2.5 rounded-lg focus:outline-none resize-none"
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-3">
                <p className="text-sm text-red-200">{error}</p>
              </div>
            )}
          </form>
        </div>

        {/* Sticky Footer */}
        <div className="flex gap-3 p-4 sm:p-6 border-t border-white/10 bg-white/[0.025] flex-shrink-0 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-6">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 px-4 py-2.5 border border-white/10 text-slate-300 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={(e) => {
              e.preventDefault()
              handleSubmit(e)
            }}
            disabled={isSubmitting}
            className="premium-button flex-1 px-4 py-2.5 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Adding...
              </>
            ) : (
              'Add Customer'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
