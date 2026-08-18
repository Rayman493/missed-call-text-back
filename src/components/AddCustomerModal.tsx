'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'

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
  useBodyScrollLock(isOpen)

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
      let errorMessage = 'Failed to add customer. Try again.'
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

  // Reset duplicateLead when modal closes
  useEffect(() => {
    if (!isOpen) {
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
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4 md:p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg max-h-[calc(100dvh-10rem-env(safe-area-inset-bottom))] md:max-h-[90vh] overflow-hidden rounded-2xl border border-border/50 bg-card shadow-2xl shadow-black/10 dark:shadow-black/30 flex flex-col animate-in zoom-in-95 duration-200">
        {/* Sticky Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 flex-shrink-0">
          <h2 className="text-lg font-semibold text-foreground">Add Customer</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="overflow-y-auto flex-1 overflow-x-hidden overscroll-contain" data-scroll-lock-allow style={{ WebkitOverflowScrolling: 'touch' }}>
          <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5 pb-4">
            {/* CONTACT Section */}
            <div className="space-y-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contact</h3>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
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
                  className="premium-input w-full px-3 py-2.5 rounded-lg focus:outline-none"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Phone Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  value={formData.phoneNumber}
                  onChange={(e) => handleInputChange('phoneNumber', e.target.value)}
                  placeholder="(412) 253-3598"
                  className="premium-input w-full px-3 py-2.5 rounded-lg focus:outline-none"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
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
                  className="premium-input w-full px-3 py-2.5 rounded-lg focus:outline-none"
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {/* INTAKE Section */}
            <div className="space-y-4 pt-4 border-t border-border/50">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Intake</h3>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Reason for Calling
                </label>
                <input
                  type="text"
                  value={formData.reasonForCalling}
                  onChange={(e) => handleInputChange('reasonForCalling', e.target.value)}
                  placeholder="e.g., Piano lessons, HVAC repair, Consultation"
                  className="premium-input w-full px-3 py-2.5 rounded-lg focus:outline-none"
                  disabled={isSubmitting}
                  autoCapitalize="sentences"
                  autoCorrect="on"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Details
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => handleInputChange('notes', e.target.value)}
                  placeholder="Any additional details..."
                  rows={2}
                  className="premium-input w-full px-3 py-2.5 rounded-lg focus:outline-none resize-none"
                  disabled={isSubmitting}
                  autoCapitalize="sentences"
                  autoCorrect="on"
                  spellCheck="true"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Location
                </label>
                <input
                  type="text"
                  autoComplete="street-address"
                  value={formData.address}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                  placeholder="123 Main St, City, State"
                  className="premium-input w-full px-3 py-2.5 rounded-lg focus:outline-none"
                  disabled={isSubmitting}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Optional: Use with Schedule Map and service locations
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Desired Completion Time
                </label>
                <input
                  type="text"
                  value={formData.desiredCompletionTime}
                  onChange={(e) => handleInputChange('desiredCompletionTime', e.target.value)}
                  placeholder="e.g., tomorrow, next week, by Friday"
                  className="premium-input w-full px-3 py-2.5 rounded-lg focus:outline-none"
                  disabled={isSubmitting}
                  autoCapitalize="sentences"
                  autoCorrect="on"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Preferred Callback Time
                </label>
                <input
                  type="text"
                  value={formData.preferredCallbackTime}
                  onChange={(e) => handleInputChange('preferredCallbackTime', e.target.value)}
                  placeholder="e.g., afternoon, 2pm, morning"
                  className="premium-input w-full px-3 py-2.5 rounded-lg focus:outline-none"
                  disabled={isSubmitting}
                  autoCapitalize="sentences"
                  autoCorrect="on"
                />
              </div>
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
        </div>

        {/* Sticky Footer */}
        <div className="flex gap-3 px-5 py-4 border-t border-border/50 flex-shrink-0 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 px-4 py-2.5 border border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
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
            className="flex-1 px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
        </div>
      </div>
    </div>
  )
}
