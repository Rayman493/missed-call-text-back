'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'
import { CreditCard, Copy, ExternalLink, User } from 'lucide-react'
import AppHeader from '@/components/AppHeader'
import MobileMenu from '@/components/MobileMenu'
import { formatCurrency, formatPhoneNumber } from '@/lib/utils'
import { createBrowserClient } from '@/lib/supabase/browser'

interface PaymentRequest {
  id: string
  amount_cents: number
  description: string
  status: string
  created_at: string
  paid_at: string | null
  checkout_url: string | null
  expires_at: string | null
  leads: {
    id: string
    caller_phone: string
    raw_metadata: any
  }
}

interface PaymentStats {
  pendingAmount: number
  paidThisMonth: number
  pendingRequests: number
  collectionRate: number
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'pending':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
    case 'paid':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
    case 'cancelled':
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    case 'expired':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    case 'failed':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return 'Pending'
    case 'paid':
      return 'Paid'
    case 'cancelled':
      return 'Cancelled'
    case 'expired':
      return 'Expired'
    case 'failed':
      return 'Failed'
    default:
      return status
  }
}

export default function PaymentsPage() {
  const router = useRouter()
  const { business } = useBusiness()
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequest[]>([])
  const [stats, setStats] = useState<PaymentStats>({
    pendingAmount: 0,
    paidThisMonth: 0,
    pendingRequests: 0,
    collectionRate: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [leads, setLeads] = useState<any[]>([])
  const [recipientType, setRecipientType] = useState<'lead' | 'manual'>('lead')
  const [selectedLeadId, setSelectedLeadId] = useState('')
  const [manualPhone, setManualPhone] = useState('')
  const [manualName, setManualName] = useState('')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentDescription, setPaymentDescription] = useState('')
  const [isCreatingPayment, setIsCreatingPayment] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    fetchPayments()
  }, [])

  const fetchLeads = async () => {
    try {
      const supabase = createBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      const response = await fetch('/api/leads', { headers })
      if (!response.ok) return
      const data = await response.json()
      setLeads(data.leads || [])
    } catch (err) {
      console.error('Error fetching leads:', err)
    }
  }

  useEffect(() => {
    if (showPaymentModal) {
      fetchLeads()
    }
  }, [showPaymentModal])

  const fetchPayments = async () => {
    try {
      const supabase = createBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      const response = await fetch('/api/payments', { headers })
      if (!response.ok) {
        throw new Error('Failed to fetch payments')
      }
      const data = await response.json()
      setPaymentRequests(data.paymentRequests || [])
      setStats(data.stats || {
        pendingAmount: 0,
        paidThisMonth: 0,
        pendingRequests: 0,
        collectionRate: 0,
      })
    } catch (err) {
      console.error('Error fetching payments:', err)
      setError('Failed to load payments')
    } finally {
      setLoading(false)
    }
  }

  const handleCreatePayment = async () => {
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
      setError('Please enter a valid amount')
      return
    }

    if (recipientType === 'lead' && !selectedLeadId) {
      setError('Please select a lead')
      return
    }

    if (recipientType === 'manual' && !manualPhone) {
      setError('Please enter a phone number')
      return
    }

    setIsCreatingPayment(true)
    setError('')
    setSuccessMessage('')

    try {
      const supabase = createBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        throw new Error('Not authenticated')
      }

      let leadId: string
      let conversationId: string

      if (recipientType === 'manual') {
        // Create lead/conversation for manual phone number
        console.log('[PAYMENT MODAL] Creating lead for manual phone:', manualPhone)
        
        const createResponse = await fetch('/api/leads', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            phone: manualPhone,
            name: manualName || undefined,
          }),
        })

        console.log('[PAYMENT MODAL] Lead creation response status:', createResponse.status)

        if (!createResponse.ok) {
          const contentType = createResponse.headers.get('content-type')
          let errorMessage = 'Failed to create lead'
          
          if (contentType && contentType.includes('application/json')) {
            try {
              const error = await createResponse.json()
              errorMessage = error.error || errorMessage
            } catch (e) {
              console.error('[PAYMENT MODAL] Failed to parse error JSON:', e)
            }
          } else {
            const text = await createResponse.text()
            console.error('[PAYMENT MODAL] Non-JSON error response:', text)
            errorMessage = 'Server error creating lead'
          }
          
          throw new Error(errorMessage)
        }

        const contentType = createResponse.headers.get('content-type')
        if (!contentType || !contentType.includes('application/json')) {
          const text = await createResponse.text()
          console.error('[PAYMENT MODAL] Non-JSON response:', text)
          throw new Error('Invalid response from server')
        }

        const createData = await createResponse.json()
        console.log('[PAYMENT MODAL] Lead created:', createData.lead?.id)
        
        leadId = createData.lead.id
        conversationId = createData.conversation?.id
      } else {
        // Use existing lead
        const selectedLead = leads.find(l => l.id === selectedLeadId)
        if (!selectedLead) {
          throw new Error('Lead not found')
        }
        leadId = selectedLead.id
        conversationId = selectedLead.conversation?.id
      }

      const payload = {
        business_id: business?.id,
        lead_id: leadId,
        conversation_id: conversationId,
        amount_cents: Math.round(parseFloat(paymentAmount) * 100),
        description: paymentDescription || undefined,
      }

      const response = await fetch('/api/payments/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create payment request')
      }

      setShowPaymentModal(false)
      setSelectedLeadId('')
      setManualPhone('')
      setManualName('')
      setPaymentAmount('')
      setPaymentDescription('')
      setSuccessMessage('Payment request sent successfully')
      
      // Refresh payments
      await fetchPayments()
    } catch (err) {
      console.error('Error creating payment request:', err)
      setError(err instanceof Error ? err.message : 'Failed to create payment request')
    } finally {
      setIsCreatingPayment(false)
    }
  }

  const getCustomerName = (lead: PaymentRequest['leads']) => {
    return lead.raw_metadata?.extracted_info?.callerName || 'Customer'
  }

  const copyPaymentLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
    } catch (err) {
      console.error('Failed to copy link:', err)
    }
  }

  return (
    <div className="min-h-screen bg-[#0b1220] dark:bg-[#0b1220]">
      <AppHeader showNavigation={true} />
      <MobileMenu />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Payments</h1>
            <p className="text-gray-400">Request and track customer payments.</p>
          </div>
          <button
            onClick={() => setShowPaymentModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors"
          >
            <CreditCard className="h-5 w-5" />
            New Payment Request
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
          </div>
        ) : error ? (
          <div className="bg-red-900/20 border border-red-800 text-red-400 px-4 py-3 rounded-md">
            {error}
          </div>
        ) : (
          <>
            {/* Overview Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <div className="bg-[#1e293b] dark:bg-[#1e293b] rounded-lg p-6 border border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-400 text-sm font-medium">Pending Amount</span>
                  <CreditCard className="h-5 w-5 text-blue-400" />
                </div>
                <div className="text-2xl font-bold text-white">
                  {formatCurrency(stats.pendingAmount / 100)}
                </div>
              </div>

              <div className="bg-[#1e293b] dark:bg-[#1e293b] rounded-lg p-6 border border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-400 text-sm font-medium">Paid This Month</span>
                  <CreditCard className="h-5 w-5 text-green-400" />
                </div>
                <div className="text-2xl font-bold text-white">
                  {formatCurrency(stats.paidThisMonth / 100)}
                </div>
              </div>

              <div className="bg-[#1e293b] dark:bg-[#1e293b] rounded-lg p-6 border border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-400 text-sm font-medium">Pending Requests</span>
                  <CreditCard className="h-5 w-5 text-yellow-400" />
                </div>
                <div className="text-2xl font-bold text-white">
                  {stats.pendingRequests}
                </div>
              </div>

              <div className="bg-[#1e293b] dark:bg-[#1e293b] rounded-lg p-6 border border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-400 text-sm font-medium">Collection Rate</span>
                  <CreditCard className="h-5 w-5 text-purple-400" />
                </div>
                <div className="text-2xl font-bold text-white">
                  {stats.collectionRate}%
                </div>
              </div>
            </div>

            {/* Payment Requests Table */}
            <div className="bg-[#1e293b] dark:bg-[#1e293b] rounded-lg border border-slate-700 overflow-hidden">
              <div className="overflow-x-auto -mx-4 px-4">
                  <table className="w-full min-w-[800px]">
                  <thead className="bg-[#0f172a] dark:bg-[#0f172a]">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Customer
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Phone Number
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Description
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Requested
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Paid
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {paymentRequests.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-6 py-12 text-center text-gray-400">
                          <div className="flex flex-col items-center gap-3">
                            <CreditCard className="h-12 w-12 text-gray-600" />
                            <p>No payment requests yet</p>
                            <button
                              onClick={() => router.push('/dashboard/leads')}
                              className="text-blue-400 hover:text-blue-300 font-medium"
                            >
                              Create your first payment request
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      paymentRequests.map((payment) => (
                        <tr key={payment.id} className="hover:bg-[#0f172a] dark:hover:bg-[#0f172a]">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <User className="h-5 w-5 text-gray-400 mr-2" />
                              <span className="text-white font-medium">
                                {getCustomerName(payment.leads)}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-gray-400">
                            {formatPhoneNumber(payment.leads.caller_phone)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-white font-medium">
                            {formatCurrency(payment.amount_cents / 100)}
                          </td>
                          <td className="px-6 py-4 text-gray-400">
                            {payment.description}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(payment.status)}`}>
                              {getStatusLabel(payment.status)}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-gray-400 text-sm">
                            {new Date(payment.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-gray-400 text-sm">
                            {payment.paid_at ? new Date(payment.paid_at).toLocaleDateString() : '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => router.push(`/dashboard/leads/${payment.leads.id}`)}
                                className="text-gray-400 hover:text-white text-sm font-medium"
                              >
                                View Lead
                              </button>
                              {payment.status === 'pending' && payment.checkout_url && (
                                <>
                                  <button
                                    onClick={() => copyPaymentLink(payment.checkout_url!)}
                                    className="text-blue-400 hover:text-blue-300 p-1"
                                    title="Copy payment link"
                                  >
                                    <Copy className="h-4 w-4" />
                                  </button>
                                  <a
                                    href={payment.checkout_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-400 hover:text-blue-300 p-1"
                                    title="Open payment link"
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                  </a>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* New Payment Request Modal */}
        {showPaymentModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-[#1e293b] dark:bg-[#1e293b] rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-700">
              <h3 className="text-lg font-semibold text-white mb-2">
                New Payment Request
              </h3>
              <p className="text-sm text-gray-400 mb-6">
                Send a secure payment link by text message.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Recipient
                  </label>
                  <select
                    value={recipientType}
                    onChange={(e) => setRecipientType(e.target.value as 'lead' | 'manual')}
                    className="w-full px-3 py-2 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-[#0f172a] text-white"
                  >
                    <option value="lead">Select existing lead</option>
                    <option value="manual">Enter phone number</option>
                  </select>
                </div>

                {recipientType === 'lead' ? (
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Select Lead
                    </label>
                    <select
                      value={selectedLeadId}
                      onChange={(e) => setSelectedLeadId(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-[#0f172a] text-white"
                    >
                      <option value="">Select a lead</option>
                      {leads.map((lead) => {
                        const displayName = lead.raw_metadata?.customerName || 
                                            lead.raw_metadata?.callerName || 
                                            lead.raw_metadata?.name || 
                                            'Customer'
                        return (
                          <option key={lead.id} value={lead.id}>
                            {formatPhoneNumber(lead.caller_phone)} - {displayName}
                          </option>
                        )
                      })}
                    </select>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-white mb-2">
                        Phone Number
                      </label>
                      <input
                        type="tel"
                        value={manualPhone}
                        onChange={(e) => setManualPhone(e.target.value)}
                        placeholder="(555) 123-4567"
                        className="w-full px-3 py-2 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-[#0f172a] text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-white mb-2">
                        Customer Name (Optional)
                      </label>
                      <input
                        type="text"
                        value={manualName}
                        onChange={(e) => setManualName(e.target.value)}
                        placeholder="John Doe"
                        className="w-full px-3 py-2 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-[#0f172a] text-white"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Amount (USD)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                    <input
                      type="number"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      placeholder="0.00"
                      step="0.01"
                      min="0.01"
                      className="w-full pl-8 pr-3 py-2 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-[#0f172a] text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Description
                  </label>
                  <textarea
                    value={paymentDescription}
                    onChange={(e) => setPaymentDescription(e.target.value)}
                    placeholder="Service payment"
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-[#0f172a] text-white resize-none"
                  />
                </div>
              </div>

              <div className="flex gap-3 justify-end mt-6">
                <button
                  onClick={() => {
                    setShowPaymentModal(false)
                    setSelectedLeadId('')
                    setManualPhone('')
                    setManualName('')
                    setPaymentAmount('')
                    setPaymentDescription('')
                    setError('')
                  }}
                  disabled={isCreatingPayment}
                  className="px-4 py-2 text-sm font-medium text-gray-300 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreatePayment}
                  disabled={isCreatingPayment || !paymentAmount || parseFloat(paymentAmount) <= 0 || (recipientType === 'lead' && !selectedLeadId) || (recipientType === 'manual' && !manualPhone)}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCreatingPayment ? 'Creating...' : 'Send Payment Request'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
