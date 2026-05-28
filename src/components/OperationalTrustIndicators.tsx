'use client'

import { useBusiness } from '@/contexts/BusinessContext'
import { CheckCircle, AlertCircle, Clock, Calendar, MessageSquare, Phone } from 'lucide-react'
import { createBrowserClient } from '@/lib/supabase/browser'
import { useEffect, useState } from 'react'

interface TrustIndicator {
  id: string
  label: string
  status: 'active' | 'pending' | 'inactive'
  icon: React.ReactNode
}

export default function OperationalTrustIndicators() {
  const { business } = useBusiness()
  const [calendarConnected, setCalendarConnected] = useState(false)
  const [smsActive, setSmsActive] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!business?.id) {
      setLoading(false)
      return
    }

    const checkOperationalStatus = async () => {
      try {
        const supabase = createBrowserClient()

        // Check calendar connection
        const { data: calendarData } = await supabase
          .from('calendar_integrations')
          .select('id')
          .eq('business_id', business.id)
          .eq('provider', 'google')
          .single()
        
        setCalendarConnected(!!calendarData)

        // Check SMS active (has sent SMS successfully recently)
        const { count: recentSmsCount } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', business.id)
          .eq('direction', 'outbound')
          .in('status', ['sent', 'delivered'])
          .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) // Last 7 days

        setSmsActive((recentSmsCount || 0) > 0)
      } catch (error) {
        console.error('[OperationalTrust] Error checking status:', error)
      } finally {
        setLoading(false)
      }
    }

    checkOperationalStatus()
  }, [business?.id])

  if (loading || !business) {
    return null
  }

  const forwardingVerified = business.forwarding_verified

  const indicators: TrustIndicator[] = [
    {
      id: 'sms',
      label: 'SMS Active',
      status: smsActive ? 'active' : 'pending',
      icon: <MessageSquare className="w-4 h-4" />
    },
    {
      id: 'calendar',
      label: 'Calendar Connected',
      status: calendarConnected ? 'active' : 'inactive',
      icon: <Calendar className="w-4 h-4" />
    },
    {
      id: 'forwarding',
      label: 'Forwarding Verified',
      status: forwardingVerified ? 'active' : 'pending',
      icon: <Phone className="w-4 h-4" />
    }
  ]

  const getStatusColor = (status: TrustIndicator['status']) => {
    switch (status) {
      case 'active':
        return 'text-green-600 dark:text-green-400 bg-green-900/20 dark:bg-green-900/30 border-green-900/30 dark:border-green-800/30'
      case 'pending':
        return 'text-amber-600 dark:text-amber-400 bg-amber-900/20 dark:bg-amber-900/30 border-amber-900/30 dark:border-amber-800/30'
      case 'inactive':
        return 'text-slate-500 dark:text-slate-400 bg-slate-900/20 dark:bg-slate-800/30 border-slate-800/30 dark:border-slate-700/30'
    }
  }

  const getStatusIcon = (status: TrustIndicator['status']) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="w-3.5 h-3.5" />
      case 'pending':
        return <Clock className="w-3.5 h-3.5" />
      case 'inactive':
        return <AlertCircle className="w-3.5 h-3.5" />
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {indicators.map((indicator) => (
        <div
          key={indicator.id}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-medium ${getStatusColor(indicator.status)}`}
          title={indicator.label}
        >
          {getStatusIcon(indicator.status)}
          {indicator.icon}
          <span className="hidden sm:inline">{indicator.label}</span>
        </div>
      ))}
    </div>
  )
}
