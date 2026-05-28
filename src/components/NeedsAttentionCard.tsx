'use client'

import React, { useState, useEffect } from 'react'
import { Business } from '@/lib/types'
import { createBrowserClient } from '@/lib/supabase/browser'
import { AlertTriangle, CheckCircle, MessageSquare, Phone, Clock, X } from 'lucide-react'
import Link from 'next/link'
import { useSetupHealth } from '@/hooks/useSetupHealth'

interface AttentionItem {
  type: 'lead_awaiting' | 'customer_replied' | 'forwarding_issue' | 'followup_failed' | 'healthy'
  title: string
  description: string
  priority: 'high' | 'medium' | 'low'
  link?: string
  linkText?: string
}

interface NeedsAttentionCardProps {
  business: Business | null
}

export default function NeedsAttentionCard({ business }: NeedsAttentionCardProps) {
  const [attentionItems, setAttentionItems] = useState<AttentionItem[]>([])
  const [loading, setLoading] = useState(true)
  const { requiredIssues } = useSetupHealth()

  useEffect(() => {
    if (!business) return

    const fetchAttentionItems = async () => {
      try {
        const supabase = createBrowserClient()
        const items: AttentionItem[] = []

        // Check for leads awaiting response
        const { data: awaitingLeads } = await supabase
          .from('leads')
          .select('id, caller_phone, created_at, messages')
          .eq('business_id', business.id)
          .is('last_message_at', null)

        if (awaitingLeads && awaitingLeads.length > 0) {
          items.push({
            type: 'lead_awaiting',
            title: `${awaitingLeads.length} Lead${awaitingLeads.length !== 1 ? 's' : ''} Awaiting Response`,
            description: awaitingLeads.length === 1 
              ? `Customer replied ${formatRelativeTime(awaitingLeads[0].created_at)}`
              : `${awaitingLeads.length} customers waiting for response`,
            priority: 'high',
            link: '/dashboard/leads',
            linkText: 'View Leads'
          })
        }

        // Check for recent customer replies
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        const { data: recentReplies } = await supabase
          .from('messages')
          .select('lead_id, created_at, leads!inner(caller_phone)')
          .eq('business_id', business.id)
          .eq('direction', 'inbound')
          .gte('created_at', twentyFourHoursAgo)
          .order('created_at', { ascending: false })
          .limit(1)

        if (recentReplies && recentReplies.length > 0) {
          const reply = recentReplies[0]
          items.push({
            type: 'customer_replied',
            title: 'Customer Replied',
            description: `${formatRelativeTime(reply.created_at)} from ${formatPhoneNumber(reply.leads.caller_phone)}`,
            priority: 'medium',
            link: `/dashboard/leads/${reply.lead_id}`,
            linkText: 'View Conversation'
          })
        }

        // Check call forwarding status using persistent business field
        const forwardingVerified = business.forwarding_verified === true

        console.log('[FORWARDING UI STATE]', {
          forwarding_verified: business.forwarding_verified,
          component: 'NeedsAttentionCard'
        })
        
        if (!forwardingVerified) {
          items.push({
            type: 'forwarding_issue',
            title: 'Call Forwarding Setup Pending',
            description: 'Awaiting first successful missed-call test',
            priority: 'high',
            link: '/dashboard/settings',
            linkText: 'Configure Settings'
          })
        }

        // Check for failed follow-ups
        const { data: failedFollowUps } = await supabase
          .from('follow_up_jobs')
          .select('id, lead_id, created_at')
          .eq('business_id', business.id)
          .eq('status', 'failed')
          .gte('created_at', twentyFourHoursAgo)

        if (failedFollowUps && failedFollowUps.length > 0) {
          items.push({
            type: 'followup_failed',
            title: 'Follow-Ups Require Review',
            description: `${failedFollowUps.length} follow-up${failedFollowUps.length !== 1 ? 's' : ''} failed in the last 24 hours`,
            priority: 'medium',
            link: '/dashboard/leads',
            linkText: 'View Leads'
          })
        }

        // Add top required health issue if any
        if (requiredIssues.length > 0) {
          const topIssue = requiredIssues[0]
          items.push({
            type: 'forwarding_issue',
            title: topIssue.name,
            description: topIssue.description,
            priority: 'high',
            link: topIssue.actionUrl,
            linkText: topIssue.actionText
          })
        }

        // Sort by priority
        const priorityOrder = { high: 0, medium: 1, low: 2 }
        items.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])

        // If no issues, show healthy status
        if (items.length === 0) {
          items.push({
            type: 'healthy',
            title: 'Nothing Needs Attention',
            description: 'All systems operating normally',
            priority: 'low'
          })
        }

        setAttentionItems(items)
      } catch (error) {
        console.error('Error fetching attention items:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchAttentionItems()
  }, [business, requiredIssues])

  const formatRelativeTime = (timestamp: string) => {
    const now = new Date()
    const eventTime = new Date(timestamp)
    const diffInMinutes = Math.floor((now.getTime() - eventTime.getTime()) / (1000 * 60))
    
    if (diffInMinutes < 1) return 'just now'
    if (diffInMinutes < 60) return `${diffInMinutes} minute${diffInMinutes !== 1 ? 's' : ''} ago`
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)} hour${Math.floor(diffInMinutes / 60) !== 1 ? 's' : ''} ago`
    return `${Math.floor(diffInMinutes / 1440)} day${Math.floor(diffInMinutes / 1440) !== 1 ? 's' : ''} ago`
  }

  const formatPhoneNumber = (phone: string) => {
    if (!phone) return 'Unknown'
    if (phone.length === 10) {
      return `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`
    }
    return phone
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
      case 'medium':
        return 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'
      case 'low':
        return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
      default:
        return 'bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300'
    }
  }

  const getPriorityIcon = (type: string) => {
    switch (type) {
      case 'lead_awaiting':
        return <MessageSquare className="w-4 h-4" />
      case 'customer_replied':
        return <MessageSquare className="w-4 h-4" />
      case 'forwarding_issue':
        return <Phone className="w-4 h-4" />
      case 'followup_failed':
        return <AlertTriangle className="w-4 h-4" />
      case 'healthy':
        return <CheckCircle className="w-4 h-4" />
      default:
        return <Clock className="w-4 h-4" />
    }
  }

  if (loading) {
    return (
      <div className="bg-card dark:bg-slate-900/60 backdrop-blur-sm border border-border rounded-xl p-3 sm:p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-foreground">Needs Attention</h3>
          <div className="text-xs text-muted-foreground">Loading...</div>
        </div>
        <div className="animate-pulse">
          <div className="h-3 bg-muted rounded w-3/4 mb-2"></div>
          <div className="h-2 bg-muted rounded w-1/2"></div>
        </div>
      </div>
    )
  }

  const topItem = attentionItems[0]

  return (
    <div className="bg-card dark:bg-slate-900/60 backdrop-blur-sm border border-slate-300 dark:border-slate-700/60 rounded-xl p-2 sm:p-3 min-h-[130px] shadow-sm dark:shadow-md hover:shadow-md dark:hover:shadow-lg transition-all duration-300">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-foreground">Needs Attention</h3>
        <div className="text-xs text-muted-foreground">
          {attentionItems.length > 1 ? `${attentionItems.length} items` : 'Top priority'}
        </div>
      </div>

      {topItem ? (
        <div className={`flex items-start gap-3 p-2.5 rounded-lg border hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors ${getPriorityColor(topItem.priority)}`}>
          <div className="flex-shrink-0 mt-0.5">
            {getPriorityIcon(topItem.type)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{topItem.title}</p>
            <p className="text-xs opacity-75 mt-0.5">{topItem.description}</p>
            {topItem.link && (
              <Link
                href={topItem.link}
                className="inline-flex items-center gap-1 text-xs font-medium mt-1.5 hover:opacity-80 transition-opacity"
              >
                {topItem.linkText}
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 p-2.5 rounded-lg border bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
          <div className="flex-shrink-0">
            <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-green-700 dark:text-green-300">Everything is running normally</p>
            <p className="text-xs opacity-75 mt-0.5 text-green-600 dark:text-green-400">
              ReplyFlow is actively monitoring and engaging missed callers
            </p>
          </div>
        </div>
      )}

      {attentionItems.length > 1 && (
        <div className="mt-2 text-center">
          <p className="text-xs text-muted-foreground">
            {attentionItems.length - 1} additional item{attentionItems.length - 1 !== 1 ? 's' : ''} need attention
          </p>
        </div>
      )}
    </div>
  )
}
