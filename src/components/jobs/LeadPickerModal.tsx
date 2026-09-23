'use client'

import { useState, useEffect } from 'react'
import { X, Search, Loader2 } from 'lucide-react'
import { createBrowserClient } from '@/lib/supabase/browser'
import PickerListRow from '@/components/ui/PickerListRow'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { useModalBackButton } from '@/hooks/useModalBackButton'
import { getLeadAIIntake, getLeadRequestTitle } from '@/lib/ai-field-mapping'
import { suppressNextHistoryBackCleanup } from '@/lib/modalBackButton'
import type { JobPrefill } from './JobComposer'

interface LeadRecord {
  id: string
  caller_phone: string | null
  name: string | null
  status: string | null
  conversation_id: string | null
  last_activity_at: string | null
  created_at: string
  raw_metadata: Record<string, any> | null
}

interface LeadPickerModalProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (prefill: JobPrefill) => void
  onAddNew?: () => void
  title?: string
  subtitle?: string
}

// Resolve canonical AI intake fields from the lead record
function getIntake(lead: LeadRecord) {
  return getLeadAIIntake(lead)
}

// The API's canonical display name (getLeadDisplayName) takes precedence over
// historical AI intake names — an edited/saved customer name must win.
// Returns null when the canonical value is only a phone or placeholder.
function getPickerCustomerName(lead: LeadRecord, intakeName?: string | null): string | null {
  const apiName = lead.name
  if (apiName && apiName !== 'Unknown Caller' && !/^[\d+()\-\s.x]+$/.test(apiName)) {
    return apiName
  }
  return intakeName || null
}

// Format phone for display
function fmtPhone(phone: string | null): string {
  if (!phone) return ''
  const d = phone.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) return `(${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`
  return phone
}

// Time ago label
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function LeadPickerModal({ isOpen, onClose, onSelect, onAddNew, title, subtitle }: LeadPickerModalProps) {
  const [leads, setLeads] = useState<LeadRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')

  // Shared modal contract: scroll lock sets data-modal-open/data-chrome-covered
  // so app header + bottom nav hide behind this overlay; Android Back closes it.
  useBodyScrollLock(isOpen, 'LeadPickerModal')
  useModalBackButton({ isOpen, onClose })

  useEffect(() => {
    if (!isOpen) return
    setQuery('')
    setError('')
    fetchLeads()
  }, [isOpen])

  const fetchLeads = async () => {
    setIsLoading(true)
    setError('')
    try {
      const supabase = createBrowserClient()
      if (!supabase) throw new Error('Client unavailable')
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Not authenticated')

      const res = await fetch('/api/leads', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Request failed (${res.status})`)
      }
      const data = await res.json()
      setLeads(data.leads || [])
    } catch (e) {
      console.error('[LeadPicker] Failed to load leads:', e)
      setError('Could not load customers. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // Client-side search filter
  const filtered = leads.filter(lead => {
    if (!query.trim()) return true
    const q = query.toLowerCase()
    const intake = getIntake(lead)
    const name = (getPickerCustomerName(lead, intake.customerName) || '').toLowerCase()
    const phone = (intake.customerPhone || '').replace(/\D/g, '')
    const service = (intake.serviceRequested || '').toLowerCase()
    const address = (intake.serviceAddress || '').toLowerCase()
    return (
      name.includes(q) ||
      phone.includes(q.replace(/\D/g, '')) ||
      service.includes(q) ||
      address.includes(q)
    )
  })

  const handleSelect = (lead: LeadRecord) => {
    const intake = getIntake(lead)
    const name = getPickerCustomerName(lead, intake.customerName)
    const address = intake.serviceAddress
    const phone = intake.customerPhone

    // Use canonical request title helper to filter out placeholders
    const canonicalTitle = getLeadRequestTitle(lead)

    const noteParts = [
      intake.additionalDetails,
      intake.desiredCompletion ? `Desired completion: ${intake.desiredCompletion}` : null,
      intake.callbackTime ? `Best callback time: ${intake.callbackTime}` : null,
    ].filter(Boolean)

    const prefill: JobPrefill = {
      customer_name: name || undefined,
      customer_phone: phone || lead.caller_phone || undefined,
      service_address: address || undefined,
      title: canonicalTitle || undefined,
      notes: noteParts.length > 0 ? noteParts.join('\n\n') : undefined,
      lead_id: lead.id,
      conversation_id: lead.conversation_id || undefined,
    }
    onSelect(prefill)
  }

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] animate-in fade-in duration-200" onClick={onClose} />
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-4">
        <div className="relative bg-card rounded-2xl shadow-2xl shadow-black/10 dark:shadow-black/30 border border-border/50 w-full max-w-md flex flex-col max-h-[var(--modal-max-height)] sm:max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-200">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 flex-shrink-0">
            <div>
              <h2 className="text-base font-semibold text-foreground">{title || 'Select a Customer'}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{subtitle || 'Customer info will be prefilled automatically.'}</p>
            </div>
            <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors flex-shrink-0" aria-label="Close modal">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Search */}
          <div className="p-3 sm:p-4 border-b border-border/50 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search by name, phone, or service..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-muted/50 border border-border/50 rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              />
            </div>
          </div>

          {/* Lead list */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain" data-scroll-lock-allow style={{ WebkitOverflowScrolling: 'touch' }}>
            {isLoading ? (
              <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground dark:text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Loading customers...</span>
              </div>
            ) : error ? (
              <div className="py-8 text-center">
                <p className="text-sm text-red-500 dark:text-red-400 mb-3">{error}</p>
                <button onClick={fetchLeads} className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">
                  Retry
                </button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-10 text-center px-6">
                {query ? (
                  <>
                    <p className="text-sm text-slate-500 dark:text-slate-400">No customers match <span className="font-medium">"{query}"</span></p>
                    <button onClick={() => setQuery('')} className="mt-2 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">
                      Clear search
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No customers yet</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 leading-relaxed">
                      ReplyFlow customers will appear here once customers call or text your business number.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="divide-y divide-border/10">
                {filtered.map(lead => {
                  const intake = getIntake(lead)
                  const name = getPickerCustomerName(lead, intake.customerName) || lead.name || 'Unknown Caller'
                  const service = getLeadRequestTitle(lead) || intake.serviceRequested
                  const phone = fmtPhone(intake.customerPhone || lead.caller_phone)
                  const location = intake.serviceAddress || ''
                  const tertiary = [phone, location].filter(Boolean).join(' • ')

                  return (
                    <PickerListRow
                      key={lead.id}
                      primary={name}
                      secondary={service || 'No service requested'}
                      tertiary={tertiary || undefined}
                      onClick={() => handleSelect(lead)}
                      role="option"
                    />
                  )
                })}
              </div>
            )}
          </div>

          {/* Footer count + create new lead */}
          {!isLoading && !error && (
            <div className="px-4 sm:px-5 py-2 pb-2 sm:pb-2 border-t border-border/50 flex-shrink-0 space-y-2">
              {onAddNew && (
                <button
                  onClick={() => {
                    // Modal→modal handoff: suppress the picker's history.back()
                    // cleanup so its popstate can't close the incoming
                    // Add Customer modal (same race as lead → form handoffs).
                    suppressNextHistoryBackCleanup()
                    onClose()
                    onAddNew()
                  }}
                  className="w-full text-left text-sm font-medium text-primary hover:text-primary/80 py-2 px-1 rounded-lg hover:bg-primary/10 transition-colors"
                >
                  + Create New Customer
                </button>
              )}
              {filtered.length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  {query ? `${filtered.length} of ${leads.length} customers` : `${leads.length} customer${leads.length !== 1 ? 's' : ''}`}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
