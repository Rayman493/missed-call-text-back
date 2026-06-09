'use client'

import React, { useState, useEffect } from 'react'
import { Business } from '@/lib/types'
import { createBrowserClient } from '@/lib/supabase/browser'
import { MessageSquare, AlertTriangle, User, Settings, Calendar, Phone, Clock, CreditCard, Check } from 'lucide-react'
import Link from 'next/link'

interface AttentionItem {
  id: string
  label: string
  count: number
  priority: 'high' | 'medium' | 'low'
  icon: React.ElementType
  color: string
  bgColor: string
  actionUrl: string
}

interface NeedsAttentionCardProps {
  business: Business | null
}

export default function NeedsAttentionCard({ business }: NeedsAttentionCardProps) {
  const [items, setItems] = useState<AttentionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)

  useEffect(() => {
    const fetchAttentionItems = async () => {
      if (!business) return

      try {
        const supabase = createBrowserClient()
        const attentionItems: AttentionItem[] = []

        // High Priority Items
        
        // 1. Unread customer replies - check for leads with unread messages
        const { data: leadsWithReplies } = await supabase
          .from('leads')
          .select('id, raw_metadata')
          .eq('business_id', business.id)
          .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())

        const unreadReplies = leadsWithReplies?.filter((lead: any) => 
          lead.raw_metadata?.last_customer_reply_at && 
          !lead.raw_metadata?.replied_after_ai_call
        ).length || 0

        if (unreadReplies > 0) {
          attentionItems.push({
            id: 'unread-replies',
            label: 'Unread customer replies',
            count: unreadReplies,
            priority: 'high',
            icon: MessageSquare,
            color: 'text-red-600 dark:text-red-400',
            bgColor: 'bg-red-100 dark:bg-red-900/20',
            actionUrl: '/dashboard/leads'
          })
        }

        // 2. Customer corrections detected
        const correctionsDetected = leadsWithReplies?.filter((lead: any) => 
          lead.raw_metadata?.corrections_count > 0
        ).length || 0

        if (correctionsDetected > 0) {
          attentionItems.push({
            id: 'corrections',
            label: 'Customer corrections detected',
            count: correctionsDetected,
            priority: 'high',
            icon: AlertTriangle,
            color: 'text-red-600 dark:text-red-400',
            bgColor: 'bg-red-100 dark:bg-red-900/20',
            actionUrl: '/dashboard/leads'
          })
        }

        // 3. Urgent leads
        const urgentLeads = leadsWithReplies?.filter((lead: any) => {
          const extractedInfo = lead.raw_metadata?.extracted_info || lead.raw_metadata?.ai_extracted_info
          const urgency = extractedInfo?.urgencyLevel || extractedInfo?.urgency
          return urgency?.toLowerCase() === 'urgent' || urgency?.toLowerCase() === 'high'
        })?.length || 0

        if (urgentLeads > 0) {
          attentionItems.push({
            id: 'urgent-leads',
            label: 'Urgent leads',
            count: urgentLeads,
            priority: 'high',
            icon: AlertTriangle,
            color: 'text-red-600 dark:text-red-400',
            bgColor: 'bg-red-100 dark:bg-red-900/20',
            actionUrl: '/dashboard/leads'
          })
        }

        // 4. New leads awaiting review (created in last 24 hours)
        const { data: recentLeads } = await supabase
          .from('leads')
          .select('id')
          .eq('business_id', business.id)
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

        if (recentLeads && recentLeads.length > 0) {
          attentionItems.push({
            id: 'new-leads',
            label: 'New leads awaiting review',
            count: recentLeads.length,
            priority: 'high',
            icon: User,
            color: 'text-red-600 dark:text-red-400',
            bgColor: 'bg-red-100 dark:bg-red-900/20',
            actionUrl: '/dashboard/leads'
          })
        }

        // Medium Priority Items
        
        // 5. Follow-ups not configured
        const { data: followUpConfig } = await supabase
          .from('follow_up_settings')
          .select('id')
          .eq('business_id', business.id)
          .single()

        if (!followUpConfig) {
          attentionItems.push({
            id: 'followups-config',
            label: 'Follow-ups not configured',
            count: 1,
            priority: 'medium',
            icon: Settings,
            color: 'text-amber-600 dark:text-amber-400',
            bgColor: 'bg-amber-100 dark:bg-amber-900/20',
            actionUrl: '/dashboard/settings/follow-ups'
          })
        }

        // 6. Google Calendar not connected
        const { data: calendarSettings } = await supabase
          .from('calendar_settings')
          .select('id')
          .eq('business_id', business.id)
          .single()

        if (!calendarSettings) {
          attentionItems.push({
            id: 'calendar-config',
            label: 'Google Calendar not connected',
            count: 1,
            priority: 'medium',
            icon: Calendar,
            color: 'text-amber-600 dark:text-amber-400',
            bgColor: 'bg-amber-100 dark:bg-amber-900/20',
            actionUrl: '/dashboard/calendar'
          })
        }

        // 7. Forwarding not verified
        if (!business.forwarding_verified) {
          attentionItems.push({
            id: 'forwarding-verify',
            label: 'Forwarding not verified',
            count: 1,
            priority: 'medium',
            icon: Phone,
            color: 'text-amber-600 dark:text-amber-400',
            bgColor: 'bg-amber-100 dark:bg-amber-900/20',
            actionUrl: '/setup/forwarding'
          })
        }

        // 8. Test call not completed - skip as business property may not exist
        // if (!business.has_completed_test_call) {
        //   attentionItems.push({
        //     id: 'test-call',
        //     label: 'Test call not completed',
        //     count: 1,
        //     priority: 'medium',
        //     icon: Phone,
        //     color: 'text-amber-600 dark:text-amber-400',
        //     bgColor: 'bg-amber-100 dark:bg-amber-900/20',
        //     actionUrl: '/dashboard/test-setup'
        //   })
        // }

        // Low Priority Items
        
        // 9. Trial ending soon (if on trial)
        if (business.trial_ends_at) {
          const daysLeft = Math.ceil((new Date(business.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          if (daysLeft <= 7) {
            attentionItems.push({
              id: 'trial-ending',
              label: `Trial ending in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`,
              count: 1,
              priority: 'low',
              icon: Clock,
              color: 'text-blue-600 dark:text-blue-400',
              bgColor: 'bg-blue-100 dark:bg-blue-900/20',
              actionUrl: '/pricing'
            })
          }
        }

        // Sort by priority (high > medium > low) then by count
        const priorityOrder = { high: 0, medium: 1, low: 2 }
        attentionItems.sort((a, b) => {
          if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
            return priorityOrder[a.priority] - priorityOrder[b.priority]
          }
          return b.count - a.count
        })

        setItems(attentionItems)
        setTotalCount(attentionItems.reduce((sum, item) => sum + item.count, 0))
      } catch (error) {
        console.error('Error fetching attention items:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchAttentionItems()
  }, [business])

  if (loading) {
    return (
      <div className="bg-white dark:bg-card border border-slate-200 dark:border-slate-700 rounded-xl p-4">
        <div className="animate-pulse space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-8 h-8 bg-slate-200 dark:bg-slate-700 rounded-lg"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-32"></div>
                <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-16"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const visibleItems = items.slice(0, 5)

  return (
    <div className="bg-white dark:bg-card border border-slate-200 dark:border-slate-700 rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground">Needs Attention</h3>
        {totalCount > 0 && (
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
            items.some(i => i.priority === 'high') 
              ? 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300'
              : items.some(i => i.priority === 'medium')
              ? 'bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
              : 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
          }`}>
            {totalCount}
          </span>
        )}
      </div>

      {visibleItems.length === 0 ? (
        <div className="text-center py-8">
          <div className="w-12 h-12 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <Check className="w-6 h-6 text-green-600 dark:text-green-400" />
          </div>
          <p className="text-sm font-semibold text-slate-900 dark:text-foreground mb-1">All caught up</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">No outstanding actions. Your account is fully configured.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visibleItems.map((item) => {
            const Icon = item.icon
            return (
              <Link key={item.id} href={item.actionUrl}>
                <div className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer group">
                  <div className="flex items-center gap-3 flex-1">
                    <div className={`w-8 h-8 ${item.bgColor} rounded-lg flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`w-4 h-4 ${item.color}`} />
                    </div>
                    <span className="text-sm text-slate-600 dark:text-slate-400 truncate">{item.label}</span>
                  </div>
                  <span className={`text-sm font-semibold ${
                    item.priority === 'high' ? 'text-red-600 dark:text-red-400' :
                    item.priority === 'medium' ? 'text-amber-600 dark:text-amber-400' :
                    'text-blue-600 dark:text-blue-400'
                  }`}>
                    {item.count}
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
