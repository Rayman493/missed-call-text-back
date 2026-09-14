'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Search, User, X, Loader2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { createBrowserClient } from '@/lib/supabase/browser'
import { formatCurrency } from '@/lib/utils'

export type BillingDocumentType = 'quote' | 'invoice'

export interface BillingLineItem {
  id?: string
  description: string
  quantity: string
  unit_label: string
  unit_price_cents: string // stored as string for input, parsed on save
}

export interface BillingDocumentData {
  id?: string
  document_type: BillingDocumentType
  status: string
  document_number: string
  issue_date: string
  valid_until?: string | null
  due_date?: string | null
  customer_id?: string | null
  customer_name?: string | null
  customer_phone?: string | null
  customer_email?: string | null
  notes?: string | null
  terms?: string | null
  discount_cents: number
  tax_cents: number
  line_items: BillingLineItem[]
}

interface BillingEditorModalProps {
  isOpen: boolean
  onClose: () => void
  documentType: BillingDocumentType
  existingDocument?: BillingDocumentData | null
  onSaved?: (doc: BillingDocumentData) => void
}

interface LeadOption {
  id: string
  contact_name: string | null
  name: string | null
  caller_phone: string | null
  email: string | null
}

function emptyLineItem(): BillingLineItem {
  return { description: '', quantity: '1', unit_label: '', unit_price_cents: '' }
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function BillingEditorModal({
  isOpen,
  onClose,
  documentType,
  existingDocument,
  onSaved,
}: BillingEditorModalProps) {
  const isInvoice = documentType === 'invoice'
  const title = existingDocument
    ? `${isInvoice ? 'Invoice' : 'Quote'} ${existingDocument.document_number}`
    : `New ${isInvoice ? 'Invoice' : 'Quote'}`

  const [docNumber, setDocNumber] = useState('')
  const [issueDate, setIssueDate] = useState(todayStr())
  const [validUntil, setValidUntil] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [terms, setTerms] = useState('')
  const [discountCents, setDiscountCents] = useState('0')
  const [taxCents, setTaxCents] = useState('0')
  const [lineItems, setLineItems] = useState<BillingLineItem[]>([emptyLineItem()])
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  // Customer picker state
  const [showCustomerPicker, setShowCustomerPicker] = useState(false)
  const [customerSearch, setCustomerSearch] = useState('')
  const [leads, setLeads] = useState<LeadOption[]>([])
  const [loadingLeads, setLoadingLeads] = useState(false)

  // Hydrate from existing document when opening
  useEffect(() => {
    if (!isOpen) return
    if (existingDocument) {
      setDocNumber(existingDocument.document_number || '')
      setIssueDate(existingDocument.issue_date || todayStr())
      setValidUntil(existingDocument.valid_until || '')
      setDueDate(existingDocument.due_date || '')
      setCustomerId(existingDocument.customer_id || null)
      setCustomerName(existingDocument.customer_name || '')
      setCustomerPhone(existingDocument.customer_phone || '')
      setCustomerEmail(existingDocument.customer_email || '')
      setNotes(existingDocument.notes || '')
      setTerms(existingDocument.terms || '')
      setDiscountCents(String(existingDocument.discount_cents || 0))
      setTaxCents(String(existingDocument.tax_cents || 0))
      setLineItems(
        existingDocument.line_items && existingDocument.line_items.length > 0
          ? existingDocument.line_items.map((item) => ({
              id: item.id,
              description: item.description || '',
              quantity: String(item.quantity || '1'),
              unit_label: item.unit_label || '',
              unit_price_cents: String(item.unit_price_cents || ''),
            }))
          : [emptyLineItem()]
      )
    } else {
      // New document defaults
      setDocNumber('')
      setIssueDate(todayStr())
      setValidUntil(isInvoice ? '' : '')
      setDueDate('')
      setCustomerId(null)
      setCustomerName('')
      setCustomerPhone('')
      setCustomerEmail('')
      setNotes('')
      setTerms('')
      setDiscountCents('0')
      setTaxCents('0')
      setLineItems([emptyLineItem()])
    }
    setSaveError('')
  }, [isOpen, existingDocument, isInvoice])

  // Fetch leads for customer picker
  useEffect(() => {
    if (!showCustomerPicker) return
    let cancelled = false
    setLoadingLeads(true)
    const fetchLeads = async () => {
      try {
        const supabase = createBrowserClient()
        const { data: { session } } = await supabase.auth.getSession()
        const headers: HeadersInit = { 'Content-Type': 'application/json' }
        if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`
        const res = await fetch('/api/leads', { headers })
        if (!res.ok) return
        const json = await res.json()
        if (cancelled) return
        const allLeads: LeadOption[] = (json.leads || json.data || json || []).map((l: any) => ({
          id: l.id,
          contact_name: l.contact_name || null,
          name: l.name || null,
          caller_phone: l.caller_phone || l.phone || null,
          email: l.email || null,
        }))
        setLeads(allLeads)
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoadingLeads(false)
      }
    }
    fetchLeads()
    return () => { cancelled = true }
  }, [showCustomerPicker])

  const filteredLeads = leads.filter((l) => {
    if (!customerSearch) return true
    const q = customerSearch.toLowerCase()
    return (
      (l.contact_name || '').toLowerCase().includes(q) ||
      (l.name || '').toLowerCase().includes(q) ||
      (l.caller_phone || '').includes(q)
    )
  })

  const selectCustomer = (lead: LeadOption) => {
    setCustomerId(lead.id)
    setCustomerName(lead.contact_name || lead.name || '')
    setCustomerPhone(lead.caller_phone || '')
    setCustomerEmail(lead.email || '')
    setShowCustomerPicker(false)
    setCustomerSearch('')
  }

  const clearCustomer = () => {
    setCustomerId(null)
    setCustomerName('')
    setCustomerPhone('')
    setCustomerEmail('')
  }

  // Line item helpers
  const addLineItem = () => {
    setLineItems([...lineItems, emptyLineItem()])
  }

  const removeLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index))
  }

  const updateLineItem = (index: number, field: keyof BillingLineItem, value: string) => {
    setLineItems(lineItems.map((item, i) => (i === index ? { ...item, [field]: value } : item)))
  }

  // Live totals calculation (client-side preview only; server recalculates)
  const subtotal = lineItems.reduce((sum, item) => {
    const qty = parseFloat(item.quantity) || 0
    const price = parseInt(item.unit_price_cents) || 0
    return sum + Math.round(qty * price)
  }, 0)
  const discount = parseInt(discountCents) || 0
  const tax = parseInt(taxCents) || 0
  const total = Math.max(0, subtotal - discount + tax)

  const handleSaveDraft = useCallback(async () => {
    setIsSaving(true)
    setSaveError('')
    try {
      const supabase = createBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`

      const payload = {
        document_type: documentType,
        customer_id: customerId || null,
        issue_date: issueDate,
        valid_until: isInvoice ? null : (validUntil || null),
        due_date: isInvoice ? (dueDate || null) : null,
        notes: notes || null,
        terms: terms || null,
        discount_cents: discount,
        tax_cents: tax,
        line_items: lineItems.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unit_label: item.unit_label || null,
          unit_price_cents: parseInt(item.unit_price_cents) || 0,
        })),
      }

      let res: Response
      if (existingDocument?.id) {
        res = await fetch(`/api/billing-documents/${existingDocument.id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify(payload),
        })
      } else {
        res = await fetch('/api/billing-documents', {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        })
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson.error || 'Failed to save document')
      }

      const json = await res.json()
      onSaved?.(json.document)
      onClose()
    } catch (err: any) {
      setSaveError(err.message || 'Failed to save')
    } finally {
      setIsSaving(false)
    }
  }, [
    customerId, issueDate, validUntil, dueDate, notes, terms, discount, tax,
    lineItems, documentType, isInvoice, existingDocument, onSaved, onClose,
  ])

  const footer = (
    <div className="flex items-center justify-end gap-2">
      <button
        onClick={onClose}
        className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
        disabled={isSaving}
      >
        Cancel
      </button>
      <button
        onClick={handleSaveDraft}
        disabled={isSaving}
        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
        Save Draft
      </button>
    </div>
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      bottomSheetOnMobile
      footer={footer}
      contentMaxHeight="85vh"
    >
      <div className="space-y-4">
        {saveError && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800/50 text-sm text-red-700 dark:text-red-300">
            {saveError}
          </div>
        )}

        {/* Document Number (read-only after creation) */}
        {docNumber && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Document Number
            </label>
            <input
              type="text"
              value={docNumber}
              readOnly
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-muted-foreground"
            />
          </div>
        )}

        {/* Customer */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Customer
          </label>
          {customerId ? (
            <div className="flex items-center justify-between gap-2 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{customerName || 'Unnamed customer'}</p>
                {customerPhone && <p className="text-xs text-muted-foreground">{customerPhone}</p>}
                {customerEmail && <p className="text-xs text-muted-foreground truncate">{customerEmail}</p>}
              </div>
              <button
                onClick={clearCustomer}
                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors flex-shrink-0"
                aria-label="Remove customer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : showCustomerPicker ? (
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Search customers..."
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  autoFocus
                />
              </div>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                {loadingLeads ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                  </div>
                ) : filteredLeads.length === 0 ? (
                  <div className="py-4 text-center text-sm text-muted-foreground">No customers found</div>
                ) : (
                  filteredLeads.map((lead) => (
                    <button
                      key={lead.id}
                      onClick={() => selectCustomer(lead)}
                      className="w-full flex items-center gap-2 p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left"
                    >
                      <User className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">
                          {lead.contact_name || lead.name || 'Unnamed'}
                        </p>
                        {lead.caller_phone && <p className="text-xs text-muted-foreground">{lead.caller_phone}</p>}
                      </div>
                    </button>
                  ))
                )}
              </div>
              <button
                onClick={() => setShowCustomerPicker(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowCustomerPicker(true)}
              className="w-full flex items-center gap-2 p-3 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-sm text-muted-foreground hover:border-blue-400 dark:hover:border-blue-600 hover:text-blue-600 transition-colors"
            >
              <User className="w-4 h-4" />
              Select customer (optional)
            </button>
          )}
        </div>

        {/* Issue Date */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Issue Date
          </label>
          <input
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
        </div>

        {/* Quote: Valid Until / Invoice: Due Date */}
        {isInvoice ? (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Due Date
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </div>
        ) : (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Valid Until
            </label>
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </div>
        )}

        {/* Line Items */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-2">
            Line Items
          </label>
          <div className="space-y-2">
            {lineItems.map((item, index) => (
              <div key={index} className="space-y-2 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30">
                {/* Description - full width on mobile, first field on desktop */}
                <input
                  type="text"
                  value={item.description}
                  onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                  placeholder="Description (e.g. Fence installation)"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
                {/* Qty / Unit / Rate - stack on mobile, row on sm+ */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] text-muted-foreground mb-0.5">Qty</label>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={item.quantity}
                      onChange={(e) => updateLineItem(index, 'quantity', e.target.value)}
                      placeholder="1"
                      className="w-full px-2 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-muted-foreground mb-0.5">Unit</label>
                    <input
                      type="text"
                      value={item.unit_label}
                      onChange={(e) => updateLineItem(index, 'unit_label', e.target.value)}
                      placeholder="ft, hrs"
                      className="w-full px-2 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-[10px] text-muted-foreground mb-0.5">Rate (cents)</label>
                    <input
                      type="number"
                      min="0"
                      value={item.unit_price_cents}
                      onChange={(e) => updateLineItem(index, 'unit_price_cents', e.target.value)}
                      placeholder="3500"
                      className="w-full px-2 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    />
                  </div>
                </div>
                {/* Line total + remove */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Line total: {formatCurrency(
                      Math.round((parseFloat(item.quantity) || 0) * (parseInt(item.unit_price_cents) || 0)),
                      true
                    )}
                  </span>
                  {lineItems.length > 1 && (
                    <button
                      onClick={() => removeLineItem(index)}
                      className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                      aria-label="Remove line item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={addLineItem}
            className="mt-2 flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
          >
            <Plus className="w-4 h-4" />
            Add Line Item
          </button>
        </div>

        {/* Totals */}
        <div className="space-y-1.5 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-medium">{formatCurrency(subtotal, true)}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Discount (cents)</span>
            <input
              type="number"
              min="0"
              value={discountCents}
              onChange={(e) => setDiscountCents(e.target.value)}
              className="w-24 px-2 py-1 text-sm text-right rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Tax (cents)</span>
            <input
              type="number"
              min="0"
              value={taxCents}
              onChange={(e) => setTaxCents(e.target.value)}
              className="w-24 px-2 py-1 text-sm text-right rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </div>
          <div className="flex justify-between text-sm font-semibold pt-1.5 border-t border-slate-200 dark:border-slate-700">
            <span>Total</span>
            <span>{formatCurrency(total, true)}</span>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Additional notes for the customer"
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 focus:outline-none focus:ring-2 focus:ring-blue-500/40 resize-none"
          />
        </div>

        {/* Terms */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Terms (optional)
          </label>
          <textarea
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            rows={2}
            placeholder="e.g. 50% deposit required before work begins"
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 focus:outline-none focus:ring-2 focus:ring-blue-500/40 resize-none"
          />
        </div>
      </div>
    </Modal>
  )
}
