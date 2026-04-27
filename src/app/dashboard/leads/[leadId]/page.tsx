'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { formatPhoneNumber, formatRelativeTime } from '@/lib/utils'
import Link from 'next/link'
import AuthGuard from '@/components/AuthGuard'
import BusinessGuard from '@/components/BusinessGuard'
import ThemeToggle from '@/components/ThemeToggle'

interface Message {
  id: string
  direction: 'inbound' | 'outbound'
  body: string
  created_at: string
  status?: string
  error_code?: string | null
}

interface Lead {
  id: string
  caller_phone: string
  status: string
  created_at: string
  messages?: Message[]
}

export default function LeadDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { business } = useBusiness()
  const [lead, setLead] = useState<Lead | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const supabase = createBrowserClient()

  useEffect(() => {
    if (!business || !params.leadId || !supabase) return

    const fetchLead = async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from('leads')
          .select(`
            *,
            messages (
              id,
              direction,
              body,
              created_at,
              status,
              error_code
            )
          `)
          .eq('id', params.leadId as string)
          .eq('business_id', business.id)
          .single()

        if (fetchError) throw fetchError
        if (!data) {
          setError('Lead not found')
          return
        }

        setLead(data as Lead)
      } catch (err: any) {
        setError(err.message || 'Failed to load lead')
      } finally {
        setLoading(false)
      }
    }

    fetchLead()
  }, [business, params.leadId, supabase])

  if (loading) {
    return (
      <AuthGuard>
        <BusinessGuard>
          <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
            <div className="max-w-4xl mx-auto">
              <p className="text-gray-600 dark:text-gray-400">Loading...</p>
            </div>
          </div>
        </BusinessGuard>
      </AuthGuard>
    )
  }

  if (error || !lead) {
    return (
      <AuthGuard>
        <BusinessGuard>
          <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
            <div className="max-w-4xl mx-auto">
              <Link
                href="/dashboard"
                className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 mb-4 inline-block"
              >
                ← Back to Dashboard
              </Link>
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mt-4">
                <p className="text-red-800 dark:text-red-300">{error || 'Lead not found'}</p>
              </div>
            </div>
          </div>
        </BusinessGuard>
      </AuthGuard>
    )
  }

  const sortedMessages = lead.messages?.sort((a, b) => 
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  ) || []

  return (
    <AuthGuard>
      <BusinessGuard>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
          <div className="max-w-4xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <div>
                <Link
                  href="/dashboard"
                  className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 mb-2 inline-block"
                >
                  ← Back to Dashboard
                </Link>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-2">
                  {formatPhoneNumber(lead.caller_phone)}
                </h1>
                <p className="text-gray-600 dark:text-gray-400 mt-1">
                  Status: <span className="font-medium capitalize">{lead.status}</span>
                </p>
              </div>
              <ThemeToggle />
            </div>

            {/* Message History */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
              <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Message History</h2>
              </div>
              
              {sortedMessages.length === 0 ? (
                <div className="p-6 text-center text-gray-500 dark:text-gray-400">
                  No messages yet
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                  {sortedMessages.map((message) => (
                    <div
                      key={message.id}
                      className={`p-4 ${
                        message.direction === 'outbound'
                          ? 'bg-blue-50 dark:bg-blue-900/20'
                          : 'bg-gray-50 dark:bg-gray-700'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <span className={`text-sm font-medium ${
                          message.direction === 'outbound'
                            ? 'text-blue-700 dark:text-blue-300'
                            : 'text-gray-700 dark:text-gray-300'
                        }`}>
                          {message.direction === 'outbound' ? 'Sent' : 'Received'}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {formatRelativeTime(message.created_at)}
                        </span>
                      </div>
                      <p className="text-gray-800 dark:text-gray-200">{message.body}</p>
                      {message.error_code && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                          Error: {message.error_code}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Lead Info */}
            <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Lead Information</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Lead ID:</span>
                  <span className="text-gray-900 dark:text-gray-100 font-mono">{lead.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Created:</span>
                  <span className="text-gray-900 dark:text-gray-100">{formatRelativeTime(lead.created_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Status:</span>
                  <span className="text-gray-900 dark:text-gray-100 capitalize">{lead.status}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </BusinessGuard>
    </AuthGuard>
  )
}
