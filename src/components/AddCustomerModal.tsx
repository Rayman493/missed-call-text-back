'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import Modal from '@/components/ui/Modal'
import { useModalBackButton } from '@/hooks/useModalBackButton'

interface AddCustomerModalProps {
  isOpen: boolean
  onClose: () => void
  returnTo?: string
  onLeadCreated?: (leadId: string, leadData?: any) => void
}

export default function AddCustomerModal({ isOpen, onClose, returnTo, onLeadCreated }: AddCustomerModalProps) {
  const router = useRouter()
  const { business } = useBusiness()
  const supabase = createBrowserClient()
  useModalBackButton({ isOpen, onClose })

  const [formData, setFormData] = useState({
    customerName: '',
    phoneNumber: '',
    email: '',
    address: '',
    notes: '',
    reasonForCalling: '',
    desiredCompletionTime: '',
    preferredCallbackTime: ''
  })

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [duplicateLead, setDuplicateLead] = useState<any | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validate required fields
    if (!formData.customerName.trim()) {
      setError('Customer name is required')
      return
    }

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

    // Validate email format if provided
    if (formData.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(formData.email.trim())) {
        setError('Please enter a valid email address')
        return
      }
    }

    setIsSubmitting(true)

    // Check for duplicate customer by phone
    try {
      const phoneDigits = formData.phoneNumber.replace(/\D/g, '')
      const { data: existingLeads } = await supabase
        .from('leads')
        .select('id, caller_phone, raw_metadata')
        .eq('business_id', business?.id)
        .eq('caller_phone', phoneDigits.startsWith('1') ? phoneDigits : '1' + phoneDigits)
        .limit(1)

      if (existingLeads && existingLeads.length > 0) {
        setDuplicateLead(existingLeads[0])
        setIsSubmitting(false)
        return
      }
    } catch (err) {
      // If duplicate check fails, continue with submission
      console.error('Duplicate check failed:', err)
    }

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
          customerName: formData.customerName.trim(),
          phoneNumber: formData.phoneNumber.trim(),
          email: formData.email.trim() || undefined,
          address: formData.address.trim() || undefined,
          notes: formData.notes.trim() || undefined,
          reasonForCalling: formData.reasonForCalling.trim() || undefined,
          desiredCompletionTime: formData.desiredCompletionTime.trim() || undefined,
          preferredCallbackTime: formData.preferredCallbackTime.trim() || undefined
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
        email: '',
        address: '',
        notes: '',
        reasonForCalling: '',
        desiredCompletionTime: '',
        preferredCallbackTime: ''
      })

      // If a workflow provided a callback, hand the lead back without redirecting
      if (data.leadId && onLeadCreated) {
        onLeadCreated(data.leadId, data.lead)
      } else if (data.leadId) {
        // Success - reset form before redirect
        setFormData({
          customerName: '',
          phoneNumber: '',
          email: '',
          address: '',
          notes: '',
          reasonForCalling: '',
          desiredCompletionTime: '',
          preferredCallbackTime: ''
        })
        setError('')
        
        if (returnTo === 'calendar') {
          // Return to calendar page with the new lead selected for job creation
          router.push('/dashboard/calendar?createJob=true&leadId=' + data.leadId)
        } else {
          // Default: redirect to lead detail page
          router.push(`/dashboard/leads/${data.leadId}`)
        }
      }
    } catch (err: any) {
      // Provide user-friendly error messages
      let errorMessage = "We couldn't add this customer. Please try again."
      if (err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
        errorMessage = 'Network error. Check your connection and try again.'
      } else if (err.message?.includes('Not authenticated')) {
        errorMessage = 'Please sign in and try again.'
      } else if (err.message) {
        errorMessage = err.message
      }
      setError(errorMessage)
      // Preserve form data on error so user can retry without retyping
    } finally {
      setIsSubmitting(false)
    }
  }

  // Reset form state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setFormData({
        customerName: '',
        phoneNumber: '',
        email: '',
        address: '',
        notes: '',
        reasonForCalling: '',
        desiredCompletionTime: '',
        preferredCallbackTime: ''
      })
      setDuplicateLead(null)
      setError(null)
    }
  }, [isOpen])

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    setError(null)
  }

  if (!isOpen) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Customer"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2.5 text-sm font-medium bg-muted hover:bg-muted/80 text-foreground rounded-lg transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
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
            className="px-4 py-2.5 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground"></div>
                Adding...
              </>
            ) : (
              'Add Customer'
            )}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
            {/* Customer Name */}
            <div>
              <label className="block text-xs text-muted-foreground font-medium mb-1.5">
                Customer Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                autoComplete="name"
                autoCapitalize="words"
                autoCorrect="off"
                spellCheck="false"
                value={formData.customerName}
                onChange={(e) => handleInputChange('customerName', e.target.value)}
                placeholder="John Smith"
                className="w-full px-4 py-2.5 sm:px-3 sm:py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                disabled={isSubmitting}
              />
            </div>

            {/* Reason for Calling */}
            <div>
              <label className="block text-xs text-muted-foreground font-medium mb-1.5">
                Reason for Calling
              </label>
              <input
                type="text"
                value={formData.reasonForCalling}
                onChange={(e) => handleInputChange('reasonForCalling', e.target.value)}
                placeholder="e.g., Piano lessons, HVAC repair, Consultation"
                className="w-full px-4 py-2.5 sm:px-3 sm:py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                disabled={isSubmitting}
                autoCapitalize="sentences"
                autoCorrect="on"
              />
            </div>

            {/* Details */}
            <div>
              <label className="block text-xs text-muted-foreground font-medium mb-1.5">
                Details
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                placeholder="Any additional details..."
                rows={2}
                className="w-full px-4 py-2.5 sm:px-3 sm:py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                disabled={isSubmitting}
                autoCapitalize="sentences"
                autoCorrect="on"
                spellCheck="true"
              />
            </div>

            {/* Location */}
            <div>
              <label className="block text-xs text-muted-foreground font-medium mb-1.5">
                Location
              </label>
              <input
                type="text"
                autoComplete="street-address"
                value={formData.address}
                onChange={(e) => handleInputChange('address', e.target.value)}
                placeholder="123 Main St, City, State"
                className="w-full px-4 py-2.5 sm:px-3 sm:py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground/70 mt-1.5">
                Optional: Use with Schedule Map and service locations
              </p>
            </div>

            {/* Desired Completion Time */}
            <div>
              <label className="block text-xs text-muted-foreground font-medium mb-1.5">
                Desired Completion Time
              </label>
              <input
                type="text"
                value={formData.desiredCompletionTime}
                onChange={(e) => handleInputChange('desiredCompletionTime', e.target.value)}
                placeholder="e.g., tomorrow, next week, by Friday"
                className="w-full px-4 py-2.5 sm:px-3 sm:py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                disabled={isSubmitting}
                autoCapitalize="sentences"
                autoCorrect="on"
              />
            </div>

            {/* Preferred Callback Time */}
            <div>
              <label className="block text-xs text-muted-foreground font-medium mb-1.5">
                Preferred Callback Time
              </label>
              <input
                type="text"
                value={formData.preferredCallbackTime}
                onChange={(e) => handleInputChange('preferredCallbackTime', e.target.value)}
                placeholder="e.g., afternoon, 2pm, morning"
                className="w-full px-4 py-2.5 sm:px-3 sm:py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                disabled={isSubmitting}
                autoCapitalize="sentences"
                autoCorrect="on"
              />
            </div>

            {/* Phone Number */}
            <div>
              <label className="block text-xs text-muted-foreground font-medium mb-1.5">
                Phone Number <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                value={formData.phoneNumber}
                onChange={(e) => handleInputChange('phoneNumber', e.target.value)}
                placeholder="(412) 253-3598"
                className="w-full px-4 py-2.5 sm:px-3 sm:py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                disabled={isSubmitting}
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs text-muted-foreground font-medium mb-1.5">
                Email
              </label>
              <input
                type="email"
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                placeholder="john@example.com"
                className="w-full px-4 py-2.5 sm:px-3 sm:py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                disabled={isSubmitting}
              />
            </div>

            {/* Duplicate Customer Warning */}
            {duplicateLead && (
              <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-4">
                <p className="text-sm text-amber-200 font-medium mb-3">Customer already exists</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => router.push(`/dashboard/leads/${duplicateLead.id}`)}
                    className="flex-1 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    View Customer
                  </button>
                  <button
                    onClick={() => {
                      setDuplicateLead(null)
                      setError(null)
                    }}
                    className="flex-1 px-3 py-2 border border-amber-400/30 text-amber-200 hover:bg-amber-500/20 rounded-lg text-sm font-medium transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-3">
                <p className="text-sm text-red-200">{error}</p>
              </div>
            )}
          </form>
    </Modal>
  )
}
