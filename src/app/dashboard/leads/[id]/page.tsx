'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { formatPhoneNumber, formatRelativeTime, getLeadStatusColor } from '@/lib/utils'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Lead, Message, Conversation } from '@/lib/types'

function getErrorMessage(errorCode?: string | null): string | null {
  if (!errorCode) return null
  if (errorCode === '30007') {
    return 'Carrier filtering detected. This may happen while toll-free verification is pending.'
  }
  return `Twilio error code: ${errorCode}`
}

async function getLeadDetails(leadId: string) {
  const response = await fetch(`/api/lead-details?leadId=${leadId}`)
  if (!response.ok) return null
  return response.json()
}

export default function LeadDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [leadData, setLeadData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  // Fetch lead data on mount
  useEffect(() => {
    getLeadDetails(params.id).then(data => {
      setLeadData(data)
      setLoading(false)
    })
  }, [params.id])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim()) return

    setSending(true)
    setError('')

    try {
      const response = await fetch('/api/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: params.id, message: message.trim() })
      })

      const result = await response.json()

      if (!response.ok) {
        setError(result.error || 'Failed to send message')
        return
      }

      setMessage('')
      router.refresh()
      // Refetch data
      const data = await getLeadDetails(params.id)
      setLeadData(data)
    } catch (err) {
      setError('Failed to send message')
    } finally {
      setSending(false)
    }
  }

  const handleRetry = async (messageBody: string) => {
    setSending(true)
    setError('')

    try {
      const response = await fetch('/api/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: params.id, message: messageBody })
      })

      const result = await response.json()

      if (!response.ok) {
        setError(result.error || 'Failed to send message')
        return
      }

      router.refresh()
      const data = await getLeadDetails(params.id)
      setLeadData(data)
    } catch (err) {
      setError('Failed to send message')
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 sm:p-8">
        <div className="max-w-4xl mx-auto">
          <p className="text-gray-500 dark:text-gray-400">Loading...</p>
        </div>
      </main>
    )
  }

  if (!leadData) {
    notFound()
  }

  const { lead, messages, source } = leadData

  // Get latest message status
  const latestMessage = messages.length > 0 ? messages[messages.length - 1] : null
  const latestMessageStatus = latestMessage?.status || 'No messages'

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 sm:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/dashboard"
            className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm font-medium transition-colors"
          >
            ← Back to dashboard
          </Link>
        </div>

        {/* Lead Summary */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
            Lead Summary
          </h2>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                {formatPhoneNumber(lead.caller_phone)}
              </h1>
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getLeadStatusColor(lead.status)}`}>
                  {lead.status}
                </span>
                {source && (
                  <span className="px-3 py-1 rounded-full text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                    {source}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500 dark:text-gray-400">Latest Message</p>
              <p className="text-gray-900 dark:text-gray-100 font-medium capitalize">{latestMessageStatus}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Created</p>
              <p className="text-sm text-gray-900 dark:text-gray-100 font-medium">{formatRelativeTime(lead.created_at)}</p>
            </div>
            {lead.first_contact_at && (
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">First Contact</p>
                <p className="text-sm text-gray-900 dark:text-gray-100 font-medium">{formatRelativeTime(lead.first_contact_at)}</p>
              </div>
            )}
            {lead.last_message_at && (
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Last Message</p>
                <p className="text-sm text-gray-900 dark:text-gray-100 font-medium">{formatRelativeTime(lead.last_message_at)}</p>
              </div>
            )}
            {lead.last_reply_at && (
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Last Reply</p>
                <p className="text-sm text-gray-900 dark:text-gray-100 font-medium">{formatRelativeTime(lead.last_reply_at)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Send Message */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Send Message
          </h2>
          <form onSubmit={handleSendMessage}>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message..."
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={3}
              disabled={sending}
            />
            {error && (
              <p className="text-red-600 dark:text-red-400 text-sm mt-2">{error}</p>
            )}
            <button
              type="submit"
              disabled={sending || !message.trim()}
              className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
            >
              {sending ? 'Sending...' : 'Send SMS'}
            </button>
          </form>
        </div>

        {/* Messages Timeline */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Message History ({messages.length})
            </h2>
          </div>

          <div className="p-6">
            {messages.length === 0 ? (
              <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                No messages found yet.
              </p>
            ) : (
              <div className="space-y-4">
                {messages.map((msg: any) => {
                  const errorMessage = getErrorMessage(msg.error_code)
                  const hasError = msg.status === 'undelivered' || msg.status === 'failed'

                  return (
                    <div
                      key={msg.id}
                      className={`flex ${msg.direction === 'inbound' ? 'justify-start' : 'justify-end'}`}
                    >
                      <div className="max-w-[80%]">
                        <div
                          className={`rounded-lg p-4 ${
                            msg.direction === 'inbound'
                              ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                              : 'bg-blue-600 text-white'
                          }`}
                        >
                          <p className="text-sm break-words">{msg.body || 'No content'}</p>
                          <div className="flex items-center justify-between gap-2 mt-2">
                            <span className="text-xs opacity-70">
                              {formatRelativeTime(msg.created_at)}
                            </span>
                            {msg.status && (
                              <span className="text-xs opacity-70 capitalize">
                                {msg.status}
                              </span>
                            )}
                          </div>
                        </div>
                        {hasError && errorMessage && (
                          <div className="mt-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                            <p className="text-xs text-amber-800 dark:text-amber-300">
                              {errorMessage}
                            </p>
                            <button
                              onClick={() => handleRetry(msg.body)}
                              disabled={sending}
                              className="mt-2 text-xs px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded transition-colors disabled:bg-gray-400"
                            >
                              {sending ? 'Retrying...' : 'Retry'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
