'use client'

import React, { useState, useEffect } from 'react'
import { Business } from '@/lib/types'
import { createBrowserClient } from '@/lib/supabase/browser'
import { MessageSquare, AlertTriangle, User, Settings, Calendar, Phone, Clock, CreditCard, Check, ChevronRight } from 'lucide-react'
import Link from 'next/link'

interface AttentionItem {
  id: string
  label: string
  subtitle?: string
  count: number
  priority: 'high' | 'medium' | 'low'
  group: 'High Priority' | 'Recommended' | 'Account'
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

        // Helper to get lead display name
        const getLeadDisplayName = (lead: any) => {
          if (lead.name) return lead.name
          if (lead.caller_name) return lead.caller_name
          if (lead.contact_name) return lead.contact_name
          if (lead.raw_metadata?.name) return lead.raw_metadata.name
          if (lead.raw_metadata?.caller_name) return lead.raw_metadata.caller_name
          if (lead.phone) return lead.phone
          if (lead.caller_phone) return lead.caller_phone
          if (lead.phone_number) return lead.phone_number
          return 'Unknown Caller'
        }

        // Fetch leads from last 7 days
        const { data: leads } = await supabase
          .from('leads')
          .select('id, name, caller_name, contact_name, phone, caller_phone, phone_number, raw_metadata, created_at')
          .eq('business_id', business.id)
          .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())

        // High Priority Items - Individual lead items
        
        // 1. Unread customer replies - individual items for each lead
        leads?.filter((lead: any) => 
          lead.raw_metadata?.last_customer_reply_at && 
          !lead.raw_metadata?.replied_after_ai_call
        ).forEach((lead: any) => {
          attentionItems.push({
            id: `unread-${lead.id}`,
            label: 'Customer reply needs review',
            subtitle: getLeadDisplayName(lead),
            count: 1,
            priority: 'high',
            group: 'High Priority',
            icon: MessageSquare,
            color: 'text-red-600 dark:text-red-400',
            bgColor: 'bg-red-100 dark:bg-red-900/20',
            actionUrl: `/dashboard/leads/${lead.id}`
          })
        })

        // 2. Customer corrections detected - individual items for each lead
        leads?.filter((lead: any) => 
          lead.raw_metadata?.corrections_count > 0 || lead.raw_metadata?.corrected_fields
        ).forEach((lead: any) => {
          attentionItems.push({
            id: `correction-${lead.id}`,
            label: 'Customer updated intake information',
            subtitle: 'Review corrected details',
            count: 1,
            priority: 'high',
            group: 'High Priority',
            icon: AlertTriangle,
            color: 'text-red-600 dark:text-red-400',
            bgColor: 'bg-red-100 dark:bg-red-900/20',
            actionUrl: `/dashboard/leads/${lead.id}`
          })
        })

        // 3. Urgent leads - individual items
        leads?.filter((lead: any) => {
          const extractedInfo = lead.raw_metadata?.extracted_info || lead.raw_metadata?.ai_extracted_info
          const urgency = extractedInfo?.urgencyLevel || extractedInfo?.urgency
          return urgency?.toLowerCase() === 'urgent' || urgency?.toLowerCase() === 'high'
        }).forEach((lead: any) => {
          attentionItems.push({
            id: `urgent-${lead.id}`,
            label: 'Urgent lead',
            subtitle: getLeadDisplayName(lead),
            count: 1,
            priority: 'high',
            group: 'High Priority',
            icon: AlertTriangle,
            color: 'text-red-600 dark:text-red-400',
            bgColor: 'bg-red-100 dark:bg-red-900/20',
            actionUrl: `/dashboard/leads/${lead.id}`
          })
        })

        // 4. New leads awaiting review (created in last 24 hours)
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        const recentLeads = leads?.filter((lead: any) => lead.created_at >= twentyFourHoursAgo) || []
        
        if (recentLeads.length > 0) {
          recentLeads.slice(0, 3).forEach((lead: any) => {
            attentionItems.push({
              id: `new-${lead.id}`,
              label: 'New lead awaiting review',
              subtitle: getLeadDisplayName(lead),
              count: 1,
              priority: 'high',
              group: 'High Priority',
              icon: User,
              color: 'text-red-600 dark:text-red-400',
              bgColor: 'bg-red-100 dark:bg-red-900/20',
              actionUrl: `/dashboard/leads/${lead.id}`
            })
          })
        }

        // Recommended Items
        
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
            group: 'Recommended',
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
            group: 'Recommended',
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
            group: 'Recommended',
            icon: Phone,
            color: 'text-amber-600 dark:text-amber-400',
            bgColor: 'bg-amber-100 dark:bg-amber-900/20',
            actionUrl: '/setup/forwarding'
          })
        }

        // Account Items
        
        // 8. Trial ending soon (if on trial)
        if (business.trial_ends_at) {
          const daysLeft = Math.ceil((new Date(business.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          if (daysLeft <= 7) {
            attentionItems.push({
              id: 'trial-ending',
              label: `Trial ending in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`,
              count: 1,
              priority: 'low',
              group: 'Account',
              icon: Clock,
              color: 'text-blue-600 dark:text-blue-400',
              bgColor: 'bg-blue-100 dark:bg-blue-900/20',
              actionUrl: '/pricing'
            })
          }
        }

        // Sort by group (High Priority > Recommended > Account) then by priority
        const groupOrder = { 'High Priority': 0, 'Recommended': 1, 'Account': 2 }
        const priorityOrder = { high: 0, medium: 1, low: 2 }
        attentionItems.sort((a, b) => {
          if (groupOrder[a.group] !== groupOrder[b.group]) {
            return groupOrder[a.group] - groupOrder[b.group]
          }
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

  // Group items by group name
  const groupedItems = visibleItems.reduce((acc, item) => {
    if (!acc[item.group]) {
      acc[item.group] = []
    }
    acc[item.group].push(item)
    return acc
  }, {} as Record<string, AttentionItem[]>)

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
        <div className="space-y-4">
          {Object.entries(groupedItems).map(([groupName, groupItems]) => (
            <div key={groupName} className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                {groupName}
              </p>
              {groupItems.map((item) => {
                const Icon = item.icon
                return (
                  <Link key={item.id} href={item.actionUrl}>
                    <div className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer group">
                      <div className="flex items-center gap-3 flex-1">
                        <div className={`w-8 h-8 ${item.bgColor} rounded-lg flex items-center justify-center flex-shrink-0`}>
                          <Icon className={`w-4 h-4 ${item.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-foreground truncate">{item.label}</p>
                          {item.subtitle && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{item.subtitle}</p>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors flex-shrink-0" />
                    </div>
                  </Link>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
