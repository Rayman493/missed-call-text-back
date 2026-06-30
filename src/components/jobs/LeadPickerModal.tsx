'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Search, User, Phone, Briefcase, Loader2, ChevronRight } from 'lucide-react'
import { createBrowserClient } from '@/lib/supabase/browser'
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
}

// Extract display name from lead — mirrors getLeadDisplayName in utils.ts
function extractName(lead: LeadRecord): string {
  if (lead.name?.trim()) return lead.name.trim()
  const ei = lead.raw_metadata?.extracted_info
  if (ei?.callerName?.trim()) return ei.callerName.trim()
  if (ei?.caller_name?.trim()) return ei.caller_name.trim()
  if (lead.raw_metadata?.callerName?.trim()) return lead.raw_metadata.callerName.trim()
  if (lead.caller_phone) {
    const d = lead.caller_phone.replace(/\D/g, '')
    if (d.length === 11 && d.startsWith('1')) return `+1 (${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`
    if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`
    return lead.caller_phone
  }
  return 'Unknown Caller'
}

// Extract service/reason from lead
function extractService(lead: LeadRecord): string | null {
  const ei = lead.raw_metadata?.extracted_info
  return ei?.reasonForCalling || ei?.serviceRequested || ei?.reason || null
}

// Extract address from lead
function extractAddress(lead: LeadRecord): string | null {
  const ei = lead.raw_metadata?.extracted_info
  return ei?.addressOrLocation || ei?.address || ei?.location || null
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

export default function LeadPickerModal({ isOpen, onClose, onSelect }: LeadPickerModalProps) {
  const [leads, setLeads] = useState<LeadRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen) return
    setQuery('')
    setError('')
    fetchLeads()
    // Focus search after mount
    setTimeout(() => searchRef.current?.focus(), 100)
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
      setError('Could not load leads. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // Client-side search filter
  const filtered = leads.filter(lead => {
    if (!query.trim()) return true
    const q = query.toLowerCase()
    const name = extractName(lead).toLowerCase()
    const phone = (lead.caller_phone || '').replace(/\D/g, '')
    const service = (extractService(lead) || '').toLowerCase()
    return name.includes(q) || phone.includes(q.replace(/\D/g, '')) || service.includes(q)
  })

  const handleSelect = (lead: LeadRecord) => {
    const name = extractName(lead)
    const service = extractService(lead)
    const address = extractAddress(lead)

    const prefill: JobPrefill = {
      customer_name: name !== 'Unknown Caller' ? name : undefined,
      customer_phone: lead.caller_phone || undefined,
      service_address: address || undefined,
      title: service || undefined,
      lead_id: lead.id,
      conversation_id: lead.conversation_id || undefined,
    }
    onSelect(prefill)
  }

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md flex flex-col max-h-[85vh]">

          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-foreground">Select a Lead</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Customer info will be prefilled automatically.</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
              <X className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            </button>
          </div>

          {/* Search */}
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search by name, phone, or service..."
                className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-foreground placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Lead list */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-10 gap-2 text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Loading leads...</span>
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
                    <p className="text-sm text-slate-500 dark:text-slate-400">No leads match <span className="font-medium">"{query}"</span></p>
                    <button onClick={() => setQuery('')} className="mt-2 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">
                      Clear search
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No leads yet</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 leading-relaxed">
                      ReplyFlow leads will appear here once customers call or text your business number.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map(lead => {
                  const name = extractName(lead)
                  const service = extractService(lead)
                  const phone = fmtPhone(lead.caller_phone)
                  const activity = lead.last_activity_at || lead.created_at

                  return (
                    <button
                      key={lead.id}
                      onClick={() => handleSelect(lead)}
                      className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-left group"
                    >
                      {/* Avatar */}
                      <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-900 dark:text-foreground truncate">{name}</p>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 flex-shrink-0">{timeAgo(activity)}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {service && (
                            <span className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              <Briefcase className="w-2.5 h-2.5 flex-shrink-0" />
                              <span className="truncate">{service}</span>
                            </span>
                          )}
                          {phone && (
                            <span className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500 flex-shrink-0">
                              <Phone className="w-2.5 h-2.5 flex-shrink-0" />
                              {phone}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Chevron */}
                      <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-slate-400 dark:group-hover:text-slate-400 flex-shrink-0 transition-colors" />
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Footer count */}
          {!isLoading && !error && filtered.length > 0 && (
            <div className="px-5 py-2.5 border-t border-slate-100 dark:border-slate-800 flex-shrink-0">
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                {query ? `${filtered.length} of ${leads.length} leads` : `${leads.length} lead${leads.length !== 1 ? 's' : ''}`}
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
