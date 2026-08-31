'use client'

import { useState, useEffect } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { useModalBackButton } from '@/hooks/useModalBackButton'
import { Mail } from 'lucide-react'
import Modal from '@/components/ui/Modal'

interface EditCustomerModalProps {
  isOpen: boolean
  onClose: () => void
  leadId: string
  leadData: any
  onCustomerUpdated?: () => void
}

interface CustomerFormData {
  customerName: string
  email: string
  companyName: string
  notes: string
}

export default function EditCustomerModal({ isOpen, onClose, leadId, leadData, onCustomerUpdated }: EditCustomerModalProps) {
  const { business } = useBusiness()
  const supabase = createBrowserClient()
  useModalBackButton({ isOpen, onClose })

  const [formData, setFormData] = useState<CustomerFormData>({
    customerName: '',
    email: '',
    companyName: '',
    notes: ''
  })

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Initialize form with existing lead data when modal opens
  useEffect(() => {
    if (isOpen && leadData) {
      setFormData({
        customerName: leadData.name || leadData.contact_name || '',
        email: leadData.email || '',
        companyName: leadData.company_name || '',
        notes: leadData.notes || ''
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

      // Build update payload with canonical fields only
      // AI Intake data (raw_metadata.extracted_info) is historical and should not be edited here
      const updatePayload: any = {
        is_simple_update: true,
        contact_name: formData.customerName.trim() || null,
        email: formData.email.trim() || null,
        company_name: formData.companyName.trim() || null,
        notes: formData.notes.trim() || null
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

        {/* Company Name */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Company Name
          </label>
          <input
            type="text"
            value={formData.companyName}
            onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
            className="premium-input w-full px-3 py-2.5 rounded-lg focus:outline-none"
            placeholder="Enter company name"
            disabled={isSubmitting}
          />
        </div>

        {/* Internal Notes */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Internal Notes
          </label>
          <textarea
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            rows={3}
            className="premium-input w-full px-3 py-2.5 rounded-lg focus:outline-none resize-none"
            placeholder="Add internal notes about this customer"
            disabled={isSubmitting}
          />
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

        {/* Action Buttons */}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  )
}