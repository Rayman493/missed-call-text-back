'use client'

import { useState, useEffect } from 'react'
import { Check, X, CreditCard, Loader2 } from 'lucide-react'
import DocumentRenderer from '@/components/billing/DocumentRenderer'
import { DocumentPresentation, effectiveStatus } from '@/lib/billing/document-presentation'

interface HostedDocumentPageProps {
  token: string
}

export default function HostedDocumentPage({ token }: HostedDocumentPageProps) {
  const [doc, setDoc] = useState<DocumentPresentation | null>(null)
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [actionMessage, setActionMessage] = useState('')

  useEffect(() => {
    const fetchDoc = async () => {
      try {
        const res = await fetch(`/api/public/document/${token}`)
        if (!res.ok) {
          if (res.status === 404) setError('Document not found or no longer available')
          else setError('Failed to load document')
          return
        }
        const json = await res.json()
        setDoc(json.document)
        setPaymentUrl(json.payment_url)
      } catch {
        setError('Failed to load document')
      } finally {
        setLoading(false)
      }
    }
    fetchDoc()
  }, [token])

  const handleRespond = async (action: 'accept' | 'decline') => {
    if (actionLoading) return // prevent double-click duplicate
    setActionLoading(true)
    setActionMessage('')
    try {
      const res = await fetch(`/api/public/document/${token}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const json = await res.json()
      if (!res.ok) {
        setActionMessage(json.error || 'Failed to respond')
        return
      }
      // Update local state
      if (doc) {
        setDoc({ ...doc, status: json.status })
      }
      setActionMessage(action === 'accept' ? 'Quote accepted. Thank you!' : 'Quote declined.')
    } catch {
      setActionMessage('Failed to respond. Please try again.')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md text-center">
          <p className="text-lg font-semibold text-slate-700 mb-2">{error}</p>
          <p className="text-sm text-slate-500">If you believe this is an error, please contact the business that sent you this document.</p>
        </div>
      </div>
    )
  }

  if (!doc) return null

  const status = effectiveStatus(doc)
  const isQuote = doc.document_type === 'quote'
  const isCancelled = status === 'cancelled'
  const isPaid = status === 'paid'
  const isExpired = status === 'expired'
  const isOverdue = status === 'overdue'
  const canRespond = isQuote && (status === 'sent')
  const hasResponded = isQuote && (status === 'accepted' || status === 'declined')

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Status banner for non-draft states */}
      {(isCancelled || isPaid || hasResponded || isExpired || isOverdue) && (
        <div className={`px-4 py-3 text-center text-sm font-medium ${
          isPaid ? 'bg-green-100 text-green-800' :
          isCancelled ? 'bg-red-100 text-red-800' :
          isExpired ? 'bg-amber-100 text-amber-800' :
          isOverdue ? 'bg-red-100 text-red-800' :
          status === 'accepted' ? 'bg-green-100 text-green-800' :
          'bg-red-100 text-red-800'
        }`}>
          {isPaid && 'This invoice has been paid. Thank you!'}
          {isCancelled && 'This document has been cancelled.'}
          {isExpired && 'This quote has expired.'}
          {isOverdue && 'This invoice is overdue.'}
          {status === 'accepted' && 'You have accepted this quote.'}
          {status === 'declined' && 'You have declined this quote.'}
        </div>
      )}

      {/* Document */}
      <div className="py-6">
        <DocumentRenderer doc={doc} showStatusBadge />
      </div>

      {/* Action bar */}
      <div className="sticky bottom-0 bg-white border-t border-slate-200 shadow-lg">
        <div className="max-w-2xl mx-auto px-4 py-4">
          {actionMessage && (
            <p className="text-sm text-center mb-3 text-slate-700">{actionMessage}</p>
          )}

          {canRespond && (
            <div className="flex gap-3">
              <button
                onClick={() => handleRespond('accept')}
                disabled={actionLoading}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-xl transition-colors shadow-sm disabled:opacity-50"
              >
                {actionLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                Accept Quote
              </button>
              <button
                onClick={() => handleRespond('decline')}
                disabled={actionLoading}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-colors border border-red-200 disabled:opacity-50"
              >
                {actionLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <X className="w-5 h-5" />}
                Decline
              </button>
            </div>
          )}

          {!isQuote && !isPaid && !isCancelled && paymentUrl && (
            <a
              href={paymentUrl}
              className={`w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-white rounded-xl transition-colors shadow-sm ${
                isOverdue ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              <CreditCard className="w-5 h-5" />
              {isOverdue ? 'Pay Overdue Invoice' : 'Pay Invoice'}
            </a>
          )}

          {!isQuote && !isPaid && !isCancelled && !paymentUrl && (
            <p className="text-sm text-center text-slate-500">Payment is being prepared. Please check back shortly.</p>
          )}
        </div>
      </div>
    </div>
  )
}
