'use client'

import { useState, useEffect, useRef } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { Mail, Phone, MessageSquare, FileText, MapPin, Clock, User } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { getCurrentCustomerContext } from '@/lib/customer-context'

interface EditCustomerModalProps {
  isOpen: boolean
  onClose: () => void
  leadId: string
  leadData: any
  onCustomerUpdated?: () => void
}

interface CustomerFormData {
  customerName: string
  reasonForCalling: string
  details: string
  location: string
  desiredCompletionTime: string
  preferredCallbackTime: string
  phoneNumber: string
  email: string
}

export default function EditCustomerModal({ isOpen, onClose, leadId, leadData, onCustomerUpdated }: EditCustomerModalProps) {
  const { business } = useBusiness()
  const supabase = createBrowserClient()
  // Note: useModalBackButton is owned by the shared <Modal> component below.

  const [formData, setFormData] = useState<CustomerFormData>({
    customerName: '',
    reasonForCalling: '',
    details: '',
    location: '',
    desiredCompletionTime: '',
    preferredCallbackTime: '',
    phoneNumber: '',
    email: ''
  })

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submitInFlightRef = useRef(false)

  // Initialize form from the canonical current customer context
  useEffect(() => {
    if (isOpen && leadData) {
      const context = getCurrentCustomerContext(leadData)
      setFormData({
        customerName: context.customerName,
        reasonForCalling: context.reasonForCalling,
        details: context.details,
        location: context.location,
        desiredCompletionTime: context.desiredCompletionTime,
        preferredCallbackTime: context.preferredCallbackTime,
        phoneNumber: context.phoneNumber,
        email: context.email
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

    // Validate phone format if provided
    if (formData.phoneNumber.trim()) {
      const phoneDigits = formData.phoneNumber.replace(/\D/g, '')
      if (phoneDigits.length < 10) {
        setError('Please enter a valid phone number')
        return
      }
    }

    // Validate email format if provided
    if (formData.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(formData.email.trim())) {
        setError('Please enter a valid email address')
        return
      }
    }

    if (submitInFlightRef.current) return
    submitInFlightRef.current = true
    setIsSubmitting(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        throw new Error('Not authenticated')
      }

      // Build update payload with canonical current fields only
      // Historical AI intake data (ai_call_records) is never mutated here.
      const updatePayload: any = {
        is_simple_update: true,
        contact_name: formData.customerName.trim() || null,
        reasonForCalling: formData.reasonForCalling.trim() || null,
        importantDetails: formData.details.trim() || null,
        addressOrLocation: formData.location.trim() || null,
        desiredCompletionTime: formData.desiredCompletionTime.trim() || null,
        preferredCallbackTime: formData.preferredCallbackTime.trim() || null,
        caller_phone: formData.phoneNumber.trim() || null,
        email: formData.email.trim() || null
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
      submitInFlightRef.current = false
    }
  }

  if (!isOpen) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Customer"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        {/* Customer Name */}
        <div>
          <label className="block text-xs text-muted-foreground font-medium mb-1.5 flex items-center gap-2">
            <User className="w-4 h-4" />
            Customer Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.customerName}
            onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
            className="w-full px-3 py-2.5 bg-muted/30 dark:bg-slate-900/55 border border-border/50 dark:border-slate-700/60 rounded-lg text-base sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/60"
            placeholder="Enter customer name"
            disabled={isSubmitting}
          />
        </div>

        {/* Reason for Calling */}
        <div>
          <label className="block text-xs text-muted-foreground font-medium mb-1.5 flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Reason for Calling
          </label>
          <input
            type="text"
            value={formData.reasonForCalling}
            onChange={(e) => setFormData({ ...formData, reasonForCalling: e.target.value })}
            className="w-full px-3 py-2.5 bg-muted/30 dark:bg-slate-900/55 border border-border/50 dark:border-slate-700/60 rounded-lg text-base sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/60"
            placeholder="What service are they requesting?"
            disabled={isSubmitting}
          />
        </div>

        {/* Details */}
        <div>
          <label className="block text-xs text-muted-foreground font-medium mb-1.5 flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Details
          </label>
          <textarea
            value={formData.details}
            onChange={(e) => setFormData({ ...formData, details: e.target.value })}
            rows={3}
            className="w-full px-3 py-2.5 bg-muted/30 dark:bg-slate-900/55 border border-border/50 dark:border-slate-700/60 rounded-lg text-base sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/60 resize-none"
            placeholder="Important details about the request"
            disabled={isSubmitting}
          />
        </div>

        {/* Location */}
        <div>
          <label className="block text-xs text-muted-foreground font-medium mb-1.5 flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            Location
          </label>
          <input
            type="text"
            value={formData.location}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            className="w-full px-3 py-2.5 bg-muted/30 dark:bg-slate-900/55 border border-border/50 dark:border-slate-700/60 rounded-lg text-base sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/60"
            placeholder="Service address"
            disabled={isSubmitting}
          />
        </div>

        {/* Desired Completion Time */}
        <div>
          <label className="block text-xs text-muted-foreground font-medium mb-1.5 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Desired Completion Time
          </label>
          <input
            type="text"
            value={formData.desiredCompletionTime}
            onChange={(e) => setFormData({ ...formData, desiredCompletionTime: e.target.value })}
            className="w-full px-3 py-2.5 bg-muted/30 dark:bg-slate-900/55 border border-border/50 dark:border-slate-700/60 rounded-lg text-base sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/60"
            placeholder="e.g. Tomorrow, This week"
            disabled={isSubmitting}
          />
        </div>

        {/* Preferred Callback Time */}
        <div>
          <label className="block text-xs text-muted-foreground font-medium mb-1.5 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Preferred Callback Time
          </label>
          <input
            type="text"
            value={formData.preferredCallbackTime}
            onChange={(e) => setFormData({ ...formData, preferredCallbackTime: e.target.value })}
            className="w-full px-3 py-2.5 bg-muted/30 dark:bg-slate-900/55 border border-border/50 dark:border-slate-700/60 rounded-lg text-base sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/60"
            placeholder="e.g. 3 PM"
            disabled={isSubmitting}
          />
        </div>

        {/* Phone Number */}
        <div>
          <label className="block text-xs text-muted-foreground font-medium mb-1.5 flex items-center gap-2">
            <Phone className="w-4 h-4" />
            Phone Number
          </label>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            name="phoneNumber"
            id="phoneNumber"
            value={formData.phoneNumber}
            onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
            className="w-full px-3 py-2.5 bg-muted/30 dark:bg-slate-900/55 border border-border/50 dark:border-slate-700/60 rounded-lg text-base sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/60"
            placeholder="(555) 123-4567"
            disabled={isSubmitting}
          />
        </div>

        {/* Email */}
        <div>
          <label className="block text-xs text-muted-foreground font-medium mb-1.5 flex items-center gap-2">
            <Mail className="w-4 h-4" />
            Email
          </label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="w-full px-3 py-2.5 bg-muted/30 dark:bg-slate-900/55 border border-border/50 dark:border-slate-700/60 rounded-lg text-base sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/60"
            placeholder="customer@example.com"
            disabled={isSubmitting}
          />
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-sm font-medium bg-muted hover:bg-muted/80 text-foreground rounded-lg transition-all duration-200 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-muted"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2.5 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-all duration-200 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-primary disabled:active:scale-100"
          >
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
