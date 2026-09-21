'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Trash2, Search, User, X, Loader2, Eye, CalendarDays, AlertCircle } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { createBrowserClient } from '@/lib/supabase/browser'
import { formatCurrency, isDomNode } from '@/lib/utils'
import { useBusiness } from '@/contexts/BusinessContext'
import DocumentRenderer from './DocumentRenderer'
import { DocumentPresentation } from '@/lib/billing/document-presentation'

export type BillingDocumentType = 'quote' | 'invoice'

// Common unit options for the Per Unit pricing mode selector.
// The `value` is what gets stored in `unit_label` (preserved on save).
// Old saved units that match these values load seamlessly into the select.
const UNIT_OPTIONS: { label: string; value: string }[] = [
  { label: 'Each', value: 'ea' },
  { label: 'Hour', value: 'hrs' },
  { label: 'Foot', value: 'ft' },
  { label: 'Square foot', value: 'sq ft' },
  { label: 'Day', value: 'day' },
  { label: 'Job', value: 'job' },
]

export interface BillingLineItem {
  id?: string
  description: string
  quantity: string
  unit_label: string
  unit_price_cents: string // dollar string for input (e.g. "35.00"), converted to cents on save
  pricing_mode?: 'flat' | 'unit' // UI-only: determines which inputs to show
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
  display_name?: string | null
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
  return { description: '', quantity: '1', unit_label: '', unit_price_cents: '', pricing_mode: 'flat' }
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

// Convert cents (number) to dollar string for input: 3500 -> "35.00"
function centsToDollars(cents: number | string | null | undefined): string {
  const n = typeof cents === 'string' ? parseInt(cents) || 0 : (cents || 0)
  return (n / 100).toFixed(2)
}

// Convert dollar string to cents: "35.00" -> 3500, "35" -> 3500
function dollarsToCents(dollars: string): number {
  const n = parseFloat(dollars)
  if (isNaN(n)) return 0
  return Math.round(n * 100)
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
  const [displayName, setDisplayName] = useState('')
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
  const [taxMode, setTaxMode] = useState<'percent' | 'dollars'>('percent')
  const [taxPercent, setTaxPercent] = useState('0')
  const [lineItems, setLineItems] = useState<BillingLineItem[]>([emptyLineItem()])
  const [pendingAction, setPendingAction] = useState<'draft' | 'send' | null>(null)
  const [saveError, setSaveError] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [previewDoc, setPreviewDoc] = useState<DocumentPresentation | null>(null)
  const { business } = useBusiness()

  // Customer picker state
  const [showCustomerPicker, setShowCustomerPicker] = useState(false)
  const [customerSearch, setCustomerSearch] = useState('')
  const [leads, setLeads] = useState<LeadOption[]>([])
  const [loadingLeads, setLoadingLeads] = useState(false)

  // Saved document state (set after saving from preview, so the preview
  // can transition to "saved" mode without closing/reopening the editor)
  const [savedDoc, setSavedDoc] = useState<{ id: string; document_number: string } | null>(null)

  // Unsaved-changes confirmation state
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const [showCreateAndSendConfirm, setShowCreateAndSendConfirm] = useState(false)
  const [createAndSendError, setCreateAndSendError] = useState('')
  const isDirtyRef = useRef(false)
  const markDirty = useCallback(() => { isDirtyRef.current = true }, [])
  const markClean = useCallback(() => { isDirtyRef.current = false }, [])

  // Ref for outside-click dismissal of the customer picker
  const customerFieldRef = useRef<HTMLDivElement>(null)

  // Hydrate from existing document when opening
  useEffect(() => {
    if (!isOpen) return
    if (existingDocument) {
      setDocNumber(existingDocument.document_number || '')
      setDisplayName(existingDocument.display_name || '')
      setIssueDate(existingDocument.issue_date || todayStr())
      setValidUntil(existingDocument.valid_until || '')
      setDueDate(existingDocument.due_date || '')
      setCustomerId(existingDocument.customer_id || null)
      setCustomerName(existingDocument.customer_name || '')
      setCustomerPhone(existingDocument.customer_phone || '')
      setCustomerEmail(existingDocument.customer_email || '')
      setNotes(existingDocument.notes || '')
      setTerms(existingDocument.terms || '')
      setDiscountCents(centsToDollars(existingDocument.discount_cents))
      setTaxCents(centsToDollars(existingDocument.tax_cents))
      // Load existing docs in $ mode to preserve exact saved tax amount
      setTaxMode('dollars')
      setTaxPercent('0')
      setLineItems(
        existingDocument.line_items && existingDocument.line_items.length > 0
          ? existingDocument.line_items.map((item) => {
              const qty = String(item.quantity || '1')
              const unitLabel = item.unit_label || ''
              // Infer pricing mode: if quantity is 1 and no unit label, it's a flat rate
              const inferredMode = (qty === '1' && !unitLabel) ? 'flat' : 'unit'
              return {
                id: item.id,
                description: item.description || '',
                quantity: qty,
                unit_label: unitLabel,
                unit_price_cents: centsToDollars(item.unit_price_cents),
                pricing_mode: inferredMode as 'flat' | 'unit',
              }
            })
          : [emptyLineItem()]
      )
    } else {
      // New document defaults
      setDocNumber('')
      setDisplayName('')
      setIssueDate(todayStr())
      setValidUntil(isInvoice ? '' : '')
      setDueDate('')
      setCustomerId(null)
      setCustomerName('')
      setCustomerPhone('')
      setCustomerEmail('')
      setNotes('')
      setTerms('')
      setDiscountCents('0.00')
      setTaxCents('0.00')
      setTaxMode('percent')
      setTaxPercent('0')
      setLineItems([emptyLineItem()])
    }
    setSavedDoc(null)
    setSaveError('')
    markClean()
  }, [isOpen, existingDocument, isInvoice])

  // Outside-click dismissal for customer picker
  // Uses CAPTURE phase so the handler fires BEFORE the target element's
  // own handlers. This closes the picker immediately and lets the
  // destination control (Issue Date, line-item input, blank space)
  // naturally receive the same pointer event — no swallowed first click,
  // no delay, no preventDefault/stopPropagation needed.
  useEffect(() => {
    if (!showCustomerPicker) return
    const handlePointerDown = (e: PointerEvent) => {
      if (isDomNode(e.target) && customerFieldRef.current && !customerFieldRef.current.contains(e.target)) {
        setShowCustomerPicker(false)
        setCustomerSearch('')
      }
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [showCustomerPicker])

  // Escape closes picker only (does not close editor modal)
  useEffect(() => {
    if (!showCustomerPicker) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setShowCustomerPicker(false)
        setCustomerSearch('')
      }
    }
    // Capture phase so we intercept before the modal's Escape handler
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [showCustomerPicker])

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
          caller_phone: l.caller_phone || null,
          email: null,
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
    markDirty()
    setCustomerId(lead.id)
    setCustomerName(lead.contact_name || lead.name || '')
    setCustomerPhone(lead.caller_phone || '')
    setCustomerEmail(lead.email || '')
    setShowCustomerPicker(false)
    setCustomerSearch('')
  }

  const clearCustomer = () => {
    markDirty()
    setCustomerId(null)
    setCustomerName('')
    setCustomerPhone('')
    setCustomerEmail('')
  }

  // Line item helpers
  const addLineItem = () => {
    markDirty()
    setLineItems([...lineItems, emptyLineItem()])
  }

  const removeLineItem = (index: number) => {
    markDirty()
    setLineItems(lineItems.filter((_, i) => i !== index))
  }

  const updateLineItem = (index: number, field: keyof BillingLineItem, value: string) => {
    markDirty()
    setLineItems(lineItems.map((item, i) => (i === index ? { ...item, [field]: value } : item)))
  }

  const setLineItemPricingMode = (index: number, mode: 'flat' | 'unit') => {
    markDirty()
    setLineItems(lineItems.map((item, i) => {
      if (i !== index) return item
      if (mode === 'flat') {
        // Flat rate: quantity=1, unit_label cleared
        return { ...item, pricing_mode: 'flat', quantity: '1', unit_label: '' }
      }
      // Per unit: keep existing values, but ensure quantity is set
      return { ...item, pricing_mode: 'unit', quantity: item.quantity || '1' }
    }))
  }

  // Compute line total cents for a single item (used for inline display)
  const lineTotalCents = (item: BillingLineItem): number => {
    const qty = parseFloat(item.quantity) || 0
    const priceCents = dollarsToCents(item.unit_price_cents)
    return Math.round(qty * priceCents)
  }

  // Format the calculation formula for a line item
  const lineFormula = (item: BillingLineItem): string => {
    const total = lineTotalCents(item)
    const totalStr = formatCurrency(total, true)
    if (item.pricing_mode === 'flat' || (!item.pricing_mode && item.quantity === '1' && !item.unit_label)) {
      return `Flat rate = ${totalStr}`
    }
    const qty = item.quantity || '1'
    const unit = item.unit_label || ''
    // When no unit is selected, show a clean formula without "unit" label:
    //   "2 × $15.00 = $30.00"  (not "2 unit × $15/unit = $30.00")
    if (!unit) {
      const rateStr = item.unit_price_cents ? `$${item.unit_price_cents}` : `$0.00`
      return `${qty} × ${rateStr} = ${totalStr}`
    }
    const rateStr = item.unit_price_cents ? `$${item.unit_price_cents}/${unit}` : `$0.00/${unit}`
    return `${qty} ${unit} × ${rateStr} = ${totalStr}`
  }

  // Live totals calculation (client-side preview only; server recalculates)
  const subtotal = lineItems.reduce((sum, item) => {
    const qty = parseFloat(item.quantity) || 0
    const priceCents = dollarsToCents(item.unit_price_cents)
    return sum + Math.round(qty * priceCents)
  }, 0)
  const discount = dollarsToCents(discountCents)
  // Tax: percent mode computes from subtotal, $ mode uses absolute input
  const tax = taxMode === 'percent'
    ? Math.round(subtotal * (parseFloat(taxPercent) || 0) / 100)
    : dollarsToCents(taxCents)
  const total = Math.max(0, subtotal - discount + tax)

  // Build a preview presentation from current editor state (live data)
  const buildPreviewDoc = useCallback((): DocumentPresentation => {
    const subtotal = lineItems.reduce((sum, item) => {
      const qty = parseFloat(item.quantity) || 0
      const priceCents = dollarsToCents(item.unit_price_cents)
      return sum + Math.round(qty * priceCents)
    }, 0)
    const disc = dollarsToCents(discountCents)
    const tx = taxMode === 'percent'
      ? Math.round(subtotal * (parseFloat(taxPercent) || 0) / 100)
      : dollarsToCents(taxCents)
    const total = Math.max(0, subtotal - disc + tx)
    return {
      document_type: documentType,
      document_number: existingDocument?.document_number || savedDoc?.document_number || '(unsaved draft)',
      status: existingDocument?.status || (savedDoc ? 'draft' : 'draft'),
      issue_date: issueDate,
      valid_until: isInvoice ? null : (validUntil || null),
      due_date: isInvoice ? (dueDate || null) : null,
      business_name: business?.name || 'Your Business Name',
      business_phone: business?.business_phone_number || business?.twilio_phone_number || null,
      business_email: (business as any)?.business_email || null,
      business_address: [business && (business as any).business_address, business && (business as any).business_city, business && (business as any).business_state, business && (business as any).business_zip].filter(Boolean).join(', ') || null,
      business_logo_url: (business as any)?.logo_url || null,
      customer_name: customerName || null,
      customer_phone: customerPhone || null,
      customer_email: customerEmail || null,
      customer_address: null,
      line_items: lineItems.map((item) => ({
        description: item.description,
        quantity: parseFloat(item.quantity) || 0,
        unit_label: item.unit_label || null,
        unit_price_cents: dollarsToCents(item.unit_price_cents),
        line_total_cents: Math.round((parseFloat(item.quantity) || 0) * dollarsToCents(item.unit_price_cents)),
      })),
      subtotal_cents: subtotal,
      discount_cents: disc,
      tax_cents: tx,
      total_cents: total,
      notes: notes || null,
      terms: terms || null,
      payment_url: null,
    }
  }, [lineItems, discountCents, taxCents, taxMode, taxPercent, issueDate, validUntil, dueDate, isInvoice, documentType, existingDocument, savedDoc, customerName, customerPhone, customerEmail, notes, terms, business])

  const handleSaveDraft = useCallback(async (sendAfterSave = false) => {
    setPendingAction(sendAfterSave ? 'send' : 'draft')
    setSaveError('')
    try {
      const supabase = createBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`

      const payload = {
        document_type: documentType,
        customer_id: customerId || null,
        display_name: displayName.trim() || null,
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
          unit_price_cents: dollarsToCents(item.unit_price_cents),
        })),
      }

      let res: Response
      const existingId = existingDocument?.id || savedDoc?.id
      if (existingId) {
        res = await fetch(`/api/billing-documents/${existingId}`, {
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
      const savedDocument = json.document
      markClean()
      if (sendAfterSave) {
        const sendRes = await fetch(`/api/billing-documents/${savedDocument.id}/send`, { method: 'POST', headers })
        if (!sendRes.ok) {
          const sendError = await sendRes.json().catch(() => ({}))
          setSavedDoc({ id: savedDocument.id, document_number: savedDocument.document_number })
          onSaved?.(savedDocument)
          throw new Error(`${sendError.error || 'Failed to send document'}. Draft saved and ready to retry.`)
        }
        const sentJson = await sendRes.json()
        onSaved?.(sentJson.document || savedDocument)
      } else {
        onSaved?.(savedDocument)
      }
      onClose()
    } catch (err: any) {
      setSaveError(err.message || 'Failed to save')
    } finally {
      setPendingAction(null)
    }
  }, [
    customerId, displayName, issueDate, validUntil, dueDate, notes, terms, discount, tax,
    lineItems, documentType, isInvoice, existingDocument, savedDoc, onSaved, onClose,
    markClean,
  ])

  // Intercept all close paths (X, Cancel, backdrop, Escape, Android Back).
  // If there are unsaved changes, show a discard confirmation dialog.
  // If not, close immediately.
  const handleAttemptClose = useCallback(() => {
    if (isDirtyRef.current) {
      setShowDiscardConfirm(true)
    } else {
      onClose()
    }
  }, [onClose])

  const handlePreview = () => {
    setPreviewDoc(buildPreviewDoc())
    setShowPreview(true)
  }

  const footer = (
    <div className="flex flex-col gap-2 px-1 pb-[env(safe-area-inset-bottom)]">
      {/* Mobile: primary actions on top; desktop: primary right, secondary left */}
      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
        {/* Secondary row */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={handlePreview}
            disabled={pendingAction !== null}
            className="flex-1 sm:flex-none h-11 px-5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <Eye className="w-4 h-4" />
            Preview
          </button>
          <button
            onClick={handleAttemptClose}
            disabled={pendingAction !== null}
            className="flex-1 sm:flex-none h-11 px-5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
        {/* Primary row */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => handleSaveDraft(false)}
            disabled={pendingAction !== null}
            className="flex-1 sm:flex-none h-11 px-5 text-sm font-medium text-foreground border border-border/50 hover:bg-muted/50 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {pendingAction === 'draft' && <Loader2 className="w-4 h-4 animate-spin" />}
            {existingDocument ? 'Save Changes' : 'Create Draft'}
          </button>
          {!existingDocument && (
            <button
              onClick={() => {
                if (!customerId || !customerPhone) {
                  setSaveError('Select a customer with a valid phone number before creating and sending.')
                  return
                }
                setShowCreateAndSendConfirm(true)
              }}
              disabled={pendingAction !== null}
              className="flex-1 sm:flex-none h-11 px-5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {pendingAction === 'send' && <Loader2 className="w-4 h-4 animate-spin" />}
              Create & Send
            </button>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleAttemptClose}
      title={title}
      bottomSheetOnMobile
      footer={footer}
      contentMaxHeight="85vh"
    >
      <div className="space-y-4 min-w-0">
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

        {/* Document name (optional) */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Document name (optional)
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => { markDirty(); setDisplayName(e.target.value) }}
            maxLength={80}
            disabled={!!existingDocument && existingDocument.status !== 'draft'}
            placeholder={isInvoice ? 'e.g. Kitchen Sink Repair' : 'e.g. Backyard Fence Installation'}
            className="w-full min-w-0 max-w-full box-border px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
        </div>

        {/* Customer */}
        <div ref={customerFieldRef}>
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
        <div className="min-w-0">
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Issue Date
          </label>
          <div className="relative min-w-0">
            <input
              type="date"
              value={issueDate}
              onChange={(e) => { markDirty(); setIssueDate(e.target.value) }}
              className="w-full min-w-0 max-w-full box-border px-3 py-2.5 sm:py-2 text-base sm:text-sm leading-5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 focus:outline-none focus:ring-2 focus:ring-blue-500/40 appearance-none hide-native-picker min-h-10 pr-[44px]"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <CalendarDays className="w-4 h-4 text-slate-400" />
            </div>
          </div>
        </div>

        {/* Quote: Valid Until / Invoice: Due Date */}
        {isInvoice ? (
          <div className="min-w-0">
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Due Date
            </label>
            <div className="relative min-w-0">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => { markDirty(); setDueDate(e.target.value) }}
                className="w-full min-w-0 max-w-full box-border px-3 py-2.5 sm:py-2 text-base sm:text-sm leading-5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 focus:outline-none focus:ring-2 focus:ring-blue-500/40 appearance-none hide-native-picker min-h-10 pr-[44px]"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <CalendarDays className="w-4 h-4 text-slate-400" />
              </div>
            </div>
          </div>
        ) : (
          <div className="min-w-0">
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Valid Until
            </label>
            <div className="relative min-w-0">
              <input
                type="date"
                value={validUntil}
                onChange={(e) => { markDirty(); setValidUntil(e.target.value) }}
                className="w-full min-w-0 max-w-full box-border px-3 py-2.5 sm:py-2 text-base sm:text-sm leading-5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 focus:outline-none focus:ring-2 focus:ring-blue-500/40 appearance-none hide-native-picker min-h-10 pr-[44px]"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <CalendarDays className="w-4 h-4 text-slate-400" />
              </div>
            </div>
          </div>
        )}

        {/* Line Items */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-2">
            Line Items
          </label>
          <div className="space-y-2">
            {lineItems.map((item, index) => {
              const mode = item.pricing_mode || (item.quantity === '1' && !item.unit_label ? 'flat' : 'unit')
              return (
              <div key={index} className="space-y-2 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30">
                {/* Description - full width */}
                <input
                  type="text"
                  value={item.description}
                  onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                  placeholder="Description (e.g. Fence installation)"
                  className="w-full min-w-0 max-w-full box-border px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
                {/* Pricing mode toggle */}
                <div className="flex items-center gap-1 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setLineItemPricingMode(index, 'flat')}
                    className={`px-2 py-0.5 rounded font-medium transition-colors ${mode === 'flat' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    Flat rate
                  </button>
                  <button
                    type="button"
                    onClick={() => setLineItemPricingMode(index, 'unit')}
                    className={`px-2 py-0.5 rounded font-medium transition-colors ${mode === 'unit' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    Per unit
                  </button>
                </div>
                {mode === 'flat' ? (
                  /* Flat rate: only Amount */
                  <div>
                    <label className="block text-[10px] text-muted-foreground mb-0.5">Amount ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.unit_price_cents}
                      onChange={(e) => updateLineItem(index, 'unit_price_cents', e.target.value)}
                      placeholder="500.00"
                      className="w-full px-2 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    />
                  </div>
                ) : (
                  /* Per unit: Qty / Unit / Rate */
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
                      <select
                        value={
                          // Map stored unit_label to select value.
                          // If unit_label matches a known option, use it.
                          // If it's a custom value, show "custom".
                          // If empty, show "" (the placeholder option).
                          item.unit_label
                            ? (UNIT_OPTIONS.some(o => o.value === item.unit_label) ? item.unit_label : 'custom')
                            : ''
                        }
                        onChange={(e) => {
                          const val = e.target.value
                          if (val === 'custom') {
                            // Keep existing unit_label if it's already custom,
                            // otherwise clear it so the user can type a new one
                            if (!item.unit_label || UNIT_OPTIONS.some(o => o.value === item.unit_label)) {
                              updateLineItem(index, 'unit_label', '')
                            }
                          } else if (val === '') {
                            updateLineItem(index, 'unit_label', '')
                          } else {
                            updateLineItem(index, 'unit_label', val)
                          }
                        }}
                        className="w-full px-2 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                      >
                        <option value="">—</option>
                        {UNIT_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                        <option value="custom">Custom…</option>
                      </select>
                      {/* Custom unit text input — revealed when select is "custom" */}
                      {item.unit_label !== '' && !UNIT_OPTIONS.some(o => o.value === item.unit_label) && (
                        <input
                          type="text"
                          value={item.unit_label}
                          onChange={(e) => updateLineItem(index, 'unit_label', e.target.value)}
                          placeholder="Enter unit"
                          className="w-full mt-1 px-2 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                        />
                      )}
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <label className="block text-[10px] text-muted-foreground mb-0.5">
                        Rate ({item.unit_label ? `$/${item.unit_label}` : '$'})
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.unit_price_cents}
                        onChange={(e) => updateLineItem(index, 'unit_price_cents', e.target.value)}
                        placeholder="40.00"
                        className="w-full px-2 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                      />
                    </div>
                  </div>
                )}
                {/* Calculation formula + remove */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground font-mono">
                    {lineFormula(item)}
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
              )
            })}
          </div>
          <button
            onClick={addLineItem}
            className="mt-2 inline-flex items-center gap-1.5 text-sm leading-none text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span className="leading-none">Add Line Item</span>
          </button>
        </div>

        {/* Totals */}
        <div className="space-y-1.5 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-medium">{formatCurrency(subtotal, true)}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Discount ($)</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={discountCents}
              onChange={(e) => { markDirty(); setDiscountCents(e.target.value) }}
              placeholder="0.00"
              className="w-28 px-2 py-1 text-sm text-right rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Tax</span>
            <div className="flex items-center gap-1.5">
              {/* %/$ toggle */}
              <div className="flex rounded border border-slate-200 dark:border-slate-700 overflow-hidden">
                <button
                  type="button"
                  onClick={() => { markDirty(); setTaxMode('percent') }}
                  className={`w-10 sm:w-9 h-9 sm:h-8 flex items-center justify-center text-sm sm:text-xs font-medium transition-colors ${
                    taxMode === 'percent'
                      ? 'bg-blue-600 text-white'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  %
                </button>
                <button
                  type="button"
                  onClick={() => { markDirty(); setTaxMode('dollars') }}
                  className={`w-10 sm:w-9 h-9 sm:h-8 flex items-center justify-center text-sm sm:text-xs font-medium transition-colors ${
                    taxMode === 'dollars'
                      ? 'bg-blue-600 text-white'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  $
                </button>
              </div>
              <input
                type="number"
                step="0.01"
                min="0"
                value={taxMode === 'percent' ? taxPercent : taxCents}
                onChange={(e) => {
                  markDirty()
                  if (taxMode === 'percent') {
                    setTaxPercent(e.target.value)
                  } else {
                    setTaxCents(e.target.value)
                  }
                }}
                placeholder={taxMode === 'percent' ? '0' : '0.00'}
                className="w-20 px-2 py-1 text-sm text-right rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
            </div>
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
            onChange={(e) => { markDirty(); setNotes(e.target.value) }}
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
            onChange={(e) => { markDirty(); setTerms(e.target.value) }}
            rows={2}
            placeholder="e.g. 50% deposit required before work begins"
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 focus:outline-none focus:ring-2 focus:ring-blue-500/40 resize-none"
          />
        </div>
      </div>

      {/* Preview Modal */}
      {showPreview && previewDoc && (
        <Modal
          isOpen={showPreview}
          onClose={() => setShowPreview(false)}
          title="Document Preview"
          bottomSheetOnMobile
          contentMaxHeight="85vh"
          footer={
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => setShowPreview(false)}
                className="px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50 rounded-lg transition-colors"
              >
                Back to Edit
              </button>
              <button
                onClick={() => handleSaveDraft(false)}
                disabled={pendingAction !== null}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {pendingAction === 'draft' && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Draft
              </button>
            </div>
          }
        >
          <div className="bg-slate-50 dark:bg-slate-950 rounded-lg overflow-hidden">
            <DocumentRenderer doc={previewDoc} showStatusBadge isPreview />
          </div>
        </Modal>
      )}

      <Modal
        isOpen={showCreateAndSendConfirm}
        onClose={() => { setShowCreateAndSendConfirm(false); setCreateAndSendError('') }}
        title={`Send ${isInvoice ? 'invoice' : 'quote'} to customer?`}
      >
        <div className="space-y-3">
          <div className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-1">
            <p className="text-xs text-muted-foreground">{isInvoice ? 'Invoice' : 'Quote'}</p>
            <p className="text-sm font-semibold text-foreground truncate">
              {displayName.trim() || `New ${isInvoice ? 'Invoice' : 'Quote'}`}
            </p>
            <p className="text-xs text-muted-foreground">{customerName} • {customerPhone}</p>
            <p className="text-lg font-semibold text-foreground">{formatCurrency(total, true)}</p>
          </div>
          {createAndSendError && (
            <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-3 py-2 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
              <div className="flex-1 text-xs text-red-900 dark:text-red-100">{createAndSendError}</div>
            </div>
          )}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => { setShowCreateAndSendConfirm(false); setCreateAndSendError('') }}
              className="flex-1 h-10 px-4 text-sm font-medium text-foreground hover:bg-muted/50 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (isInvoice && total <= 0) {
                  setCreateAndSendError('Add an amount greater than $0 before sending this invoice.')
                  return
                }
                setCreateAndSendError('')
                setShowCreateAndSendConfirm(false)
                handleSaveDraft(true)
              }}
              disabled={pendingAction !== null}
              className="flex-1 h-10 px-4 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {pendingAction === 'send' && <Loader2 className="w-4 h-4 animate-spin" />}
              Send {isInvoice ? 'Invoice' : 'Quote'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Discard unsaved changes confirmation */}
      <Modal
        isOpen={showDiscardConfirm}
        onClose={() => setShowDiscardConfirm(false)}
        title="Discard unsaved changes?"
        bottomSheetOnMobile
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Your {isInvoice ? 'invoice' : 'quote'} hasn't been saved. Your changes will be lost.
          </p>
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setShowDiscardConfirm(false)}
              className="px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50 rounded-lg transition-colors"
            >
              Keep Editing
            </button>
            <button
              onClick={() => {
                setShowDiscardConfirm(false)
                markClean()
                onClose()
              }}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-sm"
            >
              Discard
            </button>
          </div>
        </div>
      </Modal>
    </Modal>
  )
}
