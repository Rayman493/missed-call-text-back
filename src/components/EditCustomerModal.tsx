'use client'

import { useState, useEffect } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { Mail, MapPin, Clock, Phone } from 'lucide-react'

interface EditCustomerModalProps {
  isOpen: boolean
  onClose: () => void
  leadId: string
  leadData: any
  onCustomerUpdated?: () => void
}

interface CustomerFormData {
  customerName: string
  phoneNumber: string
  email: string
  address: string
  details: string
  reasonForCalling: string
  desiredCompletionTime: string
  preferredCallbackTime: string
}

export default function EditCustomerModal({ isOpen, onClose, leadId, leadData, onCustomerUpdated }: EditCustomerModalProps) {
  const { business } = useBusiness()
  const supabase = createBrowserClient()
  useBodyScrollLock(isOpen)

  const [formData, setFormData] = useState<CustomerFormData>({
    customerName: '',
    phoneNumber: '',
    email: '',
    address: '',
    details: '',
    reasonForCalling: '',
    desiredCompletionTime: '',
    preferredCallbackTime: ''
  })

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Initialize form with existing lead data when modal opens
  useEffect(() => {
    if (isOpen && leadData) {
      const intake = leadData.raw_metadata?.extracted_info || {}
      setFormData({
        customerName: leadData.name || leadData.contact_name || intake.callerName || '',
        phoneNumber: leadData.caller_phone || '',
        email: leadData.email || intake.email || '',
        address: intake.addressOrLocation || '',
        details: intake.importantDetails || '',
        reasonForCalling: intake.reasonForCalling || intake.serviceRequested || '',
        desiredCompletionTime: intake.desiredCompletionTime || '',
        preferredCallbackTime: intake.preferredCallbackTime || ''
      })
    }
  }, [isOpen, leadData])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validate required fields
    if (!formData.customerName.trim()) {
      setError('Customer name is required')
      return
    }

    // Validate email format if provided
    if (formData.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(formData.email.trim())) {
        setError('Please enter a valid email address')
        return
      }
    }

    setIsSubmitting(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        throw new Error('Not authenticated')
      }

      // Build update payload with proper field mapping
      // Use null for empty strings to clear fields
      const updatePayload: any = {
        is_simple_update: true,
        contact_name: formData.customerName.trim() || null,
        raw_metadata: {
          ...leadData.raw_metadata,
          extracted_info: {
            ...leadData.raw_metadata?.extracted_info,
            callerName: formData.customerName.trim() || null,
            email: formData.email.trim() || null,
            addressOrLocation: formData.address.trim() || null,
            importantDetails: formData.details.trim() || null,
            reasonForCalling: formData.reasonForCalling.trim() || null,
            serviceRequested: formData.reasonForCalling.trim() || null,
            desiredCompletionTime: formData.desiredCompletionTime.trim() || null,
            preferredCallbackTime: formData.preferredCallbackTime.trim() || null
          }
        }
      }

      const response = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(updatePayload)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update customer')
      }

      if (onCustomerUpdated) {
        onCustomerUpdated()
      }

      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to update customer')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center p-0 md:p-4 pb-[calc(var(--bottom-nav-height,80px)+env(safe-area-inset-bottom)+16px)] md:pb-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div className="relative w-full max-w-lg max-h-[calc(100dvh-var(--bottom-nav-height,80px)-32px)] md:max-h-[90vh] overflow-hidden rounded-2xl border border-border/50 bg-white dark:bg-slate-900 shadow-2xl shadow-black/10 dark:shadow-black/30 flex flex-col animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0 bg-white dark:bg-slate-900">
          <h2 className="text-lg font-semibold text-foreground tracking-tight">Edit Customer</h2>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4 flex-1 overflow-y-auto min-h-0">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          {/* Customer Name */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Customer Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.customerName}
              onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
              className="premium-input w-full px-3 py-2.5 rounded-lg focus:outline-none"
              placeholder="Enter customer name"
              disabled={isSubmitting}
            />
          </div>

          {/* Reason for Calling */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Reason for Calling
            </label>
            <input
              type="text"
              value={formData.reasonForCalling}
              onChange={(e) => setFormData({ ...formData, reasonForCalling: e.target.value })}
              className="premium-input w-full px-3 py-2.5 rounded-lg focus:outline-none"
              placeholder="What do they need?"
              disabled={isSubmitting}
            />
          </div>

          {/* Details */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Details
            </label>
            <textarea
              value={formData.details}
              onChange={(e) => setFormData({ ...formData, details: e.target.value })}
              rows={2}
              className="premium-input w-full px-3 py-2.5 rounded-lg focus:outline-none resize-none"
              placeholder="Enter details"
              disabled={isSubmitting}
            />
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5 flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Location
            </label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="premium-input w-full px-3 py-2.5 rounded-lg focus:outline-none"
              placeholder="Enter address"
              disabled={isSubmitting}
            />
          </div>

          {/* Desired Completion Time */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Desired Completion Time
            </label>
            <input
              type="text"
              value={formData.desiredCompletionTime}
              onChange={(e) => setFormData({ ...formData, desiredCompletionTime: e.target.value })}
              className="premium-input w-full px-3 py-2.5 rounded-lg focus:outline-none"
              placeholder="e.g., tomorrow, next week"
              disabled={isSubmitting}
            />
          </div>

          {/* Preferred Callback Time */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Preferred Callback Time
            </label>
            <input
              type="text"
              value={formData.preferredCallbackTime}
              onChange={(e) => setFormData({ ...formData, preferredCallbackTime: e.target.value })}
              className="premium-input w-full px-3 py-2.5 rounded-lg focus:outline-none"
              placeholder="e.g., 3PM, morning"
              disabled={isSubmitting}
            />
          </div>

          {/* Phone Number - Read Only */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5 flex items-center gap-2">
              <Phone className="w-4 h-4" />
              Phone Number
            </label>
            <input
              type="text"
              value={formatPhoneNumber(formData.phoneNumber)}
              disabled
              className="w-full px-3 py-2 border border-border rounded-lg text-sm text-muted-foreground bg-muted cursor-not-allowed"
              title="Phone number cannot be edited"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Phone number cannot be changed to preserve customer identity
            </p>
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5 flex items-center gap-2">
              <Mail className="w-4 h-4" />
              Email
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="premium-input w-full px-3 py-2.5 rounded-lg focus:outline-none"
              placeholder="customer@example.com"
              disabled={isSubmitting}
            />
          </div>

          {/* Save Button inside form */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12a8 8 0 01-8 8V0a8 8 0 000 16h4z"></path>
                </svg>
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </button>
        </form>

        {/* Cancel Button outside form */}
        <div className="px-5 py-4 border-t border-border bg-white dark:bg-slate-900 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
            disabled={isSubmitting}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// Helper function
function formatPhoneNumber(phone: string): string {
  if (!phone) return ''
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`
  }
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+${cleaned.slice(0, 1)} (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`
  }
  return phone
}