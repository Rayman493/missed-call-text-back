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

  useEffect(() => {
    fetchPayments()
  }, [])

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

  const copyPaymentLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      // You could add a toast notification here
    } catch (err) {
      console.error('Failed to copy link:', err)
    }
  }

  const getCustomerName = (lead: PaymentRequest['leads']) => {
    return lead.raw_metadata?.extracted_info?.callerName || 'Customer'
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
            onClick={() => router.push('/dashboard/leads')}
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
              <div className="overflow-x-auto">
                <table className="w-full">
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
      </main>
    </div>
  )
}
