'use client'

import { useState } from 'react'
import { createBrowserClient } from '@/lib/supabase/browser'

interface AppointmentSmsModalProps {
  isOpen: boolean
  onClose: () => void
  leadId: string
  initialMessage: string
  onSent?: (messageBody: string) => void
}

export default function AppointmentSmsModal({ isOpen, onClose, leadId, initialMessage, onSent }: AppointmentSmsModalProps) {
  const supabase = createBrowserClient()
  const [message, setMessage] = useState(initialMessage)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSend = async () => {
    if (!leadId || !message.trim()) return
    setSending(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Not authenticated')

      const res = await fetch('/api/send-sms', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ leadId, message: message.trim(), clientMessageId: crypto.randomUUID() })
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to send message')
      }

      try {
        onSent?.(message.trim())
      } finally {
        onClose()
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-card rounded-2xl border border-border/50 shadow-2xl w-full max-w-md flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
          <h2 className="text-base font-semibold text-foreground">Send Appointment Details</h2>
          <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg" aria-label="Close">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
          />
          {error && (
            <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-2 text-sm text-red-200">{error}</div>
          )}
        </div>
        <div className="px-5 py-4 border-t border-border/50 flex gap-2">
          <button onClick={onClose} disabled={sending} className="flex-1 px-4 py-2.5 border border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors">Cancel</button>
          <button onClick={handleSend} disabled={sending || !message.trim()} className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors disabled:opacity-50">{sending ? 'Sending...' : 'Send'}</button>
        </div>
      </div>
    </div>
  )
}
