'use client'

import React, { useState, useEffect } from 'react'
import { Business } from '@/lib/types'
import { createBrowserClient } from '@/lib/supabase/browser'
import { getLeadAIIntake } from '@/lib/ai-field-mapping'
import { isBusinessOutOfOffice, getOutOfOfficeStatus } from '@/lib/out-of-office'
import { MessageSquare, AlertTriangle, User, Settings, Calendar, Phone, Clock, CreditCard, Check, ChevronRight, CalendarOff } from 'lucide-react'
import Link from 'next/link'

interface AttentionItem {
  id: string
  label: string
  subtitle?: string
  actionLabel: string
  count: number
  priority: 'high' | 'medium' | 'low'
  group: 'High Priority' | 'Recommended'
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
          const intake = getLeadAIIntake(lead)
          if (intake.customerName) return intake.customerName
          if (lead.phone) return lead.phone
          return 'Unknown Caller'
        }

        // Fetch leads from last 7 days
        // Use only valid columns from the leads table
        let leads: any[] | null = null
        let leadsError: any = null
        
        try {
          const result = await supabase
            .from('leads')
            .select('id, business_id, caller_phone, status, raw_metadata, created_at')
            .eq('business_id', business.id)
            .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          
          leads = result.data
          leadsError = result.error
          
          if (!leadsError && result.data) {
            // Normalize caller_phone to phone field for downstream code
            leads = result.data.map((lead: any) => ({
              ...lead,
              phone: lead.caller_phone
            }))
          }
        } catch (e) {
          leadsError = e
        }

        if (leadsError) {
          console.error('[NeedsAttention] Failed to fetch leads:', {
            code: leadsError.code,
            message: leadsError.message,
            details: leadsError.details,
            hint: leadsError.hint,
            fullError: JSON.stringify(leadsError, null, 2)
          })
          
          // Try minimal query with only safe columns
          try {
            const result = await supabase
              .from('leads')
              .select('id, business_id, status, created_at')
              .eq('business_id', business.id)
              .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
            
            leads = result.data
            leadsError = result.error
            
            if (!leadsError) {
              console.log('[NeedsAttention] Minimal query succeeded')
            }
          } catch (e) {
            leadsError = e
          }
        }

        if (leadsError) {
          console.error('[NeedsAttention] All lead queries failed, suppressing warning card', {
            code: leadsError.code,
            message: leadsError.message,
            details: leadsError.details,
            hint: leadsError.hint,
            fullError: JSON.stringify(leadsError, null, 2)
          })
          // Suppress the warning card by returning early
          setLoading(false)
          return
        }

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
            actionLabel: 'Open',
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
            actionLabel: 'Review',
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
          const intake = getLeadAIIntake(lead)
          const urgency = intake.desiredCompletion
          return urgency?.toLowerCase() === 'urgent' || urgency?.toLowerCase() === 'high'
        }).forEach((lead: any) => {
          attentionItems.push({
            id: `urgent-${lead.id}`,
            label: 'Urgent lead',
            subtitle: getLeadDisplayName(lead),
            actionLabel: 'View',
            count: 1,
            priority: 'high',
            group: 'High Priority',
            icon: AlertTriangle,
            color: 'text-red-600 dark:text-red-400',
            bgColor: 'bg-red-100 dark:bg-red-900/20',
            actionUrl: `/dashboard/leads/${lead.id}`
          })
        })

        // Recommended Items

        // Out of Office Mode - only show when active
        const outOfOfficeStatus = getOutOfOfficeStatus(business)
        if (outOfOfficeStatus.status === 'active') {
          const endDate = outOfOfficeStatus.endDate
          const daysRemaining = outOfOfficeStatus.daysRemaining
          const subtitle = endDate
            ? `Returning ${endDate.toLocaleDateString()}${daysRemaining !== undefined ? ` (${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} remaining)` : ''}`
            : 'Out of Office Mode is active'

          attentionItems.push({
            id: 'out-of-office',
            label: 'Out of Office Mode Active',
            subtitle,
            actionLabel: 'Settings',
            count: 1,
            priority: 'medium',
            group: 'Recommended',
            icon: CalendarOff,
            color: 'text-blue-600 dark:text-blue-400',
            bgColor: 'bg-blue-100 dark:bg-blue-900/20',
            actionUrl: '/dashboard/settings#out-of-office'
          })
        }

        // Forwarding not verified - only show if business is actively using the system (has leads)
        // This avoids showing onboarding-style warnings to businesses still in setup
        const hasLeads = leads && leads.length > 0
        const isActivelyUsing = hasLeads || business?.forwarding_verified_at

        if (!business.forwarding_verified && isActivelyUsing) {
          attentionItems.push({
            id: 'forwarding-verify',
            label: 'Forwarding not verified',
            actionLabel: 'Verify',
            count: 1,
            priority: 'medium',
            group: 'Recommended',
            icon: Phone,
            color: 'text-amber-600 dark:text-amber-400',
            bgColor: 'bg-amber-100 dark:bg-amber-900/20',
            actionUrl: '/setup/forwarding'
          })
        }

        // Sort by group (High Priority > Recommended) then by priority
        const groupOrder = { 'High Priority': 0, 'Recommended': 1 }
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
      <div className="bg-white dark:bg-card border border-slate-200 dark:border-slate-700 rounded-xl p-3 sm:p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-slate-900 dark:text-foreground">Needs Attention</h3>
          <div className="text-xs text-slate-500 dark:text-slate-400">Loading...</div>
        </div>
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
    <div className="bg-white dark:bg-card border border-slate-200 dark:border-slate-700 rounded-xl p-3 sm:p-4 shadow-sm hover:shadow-md transition-all duration-200">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-slate-900 dark:text-foreground">Needs Attention</h3>
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
        <div className="text-center py-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">Everything looks good. No action needed right now.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(groupedItems).map(([groupName, groupItems]) => (
            <div key={groupName} className="space-y-1.5">
              <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                {groupName}
              </p>
              {groupItems.map((item) => {
                const Icon = item.icon
                return (
                  <Link key={item.id} href={item.actionUrl}>
                    <div className="p-2 sm:p-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer group border border-transparent hover:border-slate-200 dark:hover:border-slate-700">
                      <div className="flex items-center gap-2.5 mb-0.5">
                        <div className={`w-7 h-7 ${item.bgColor} rounded-lg flex items-center justify-center flex-shrink-0`}>
                          <Icon className={`w-3.5 h-3.5 ${item.color}`} />
                        </div>
                        <p className="text-xs sm:text-sm font-medium text-slate-900 dark:text-foreground flex-1">{item.label}</p>
                      </div>
                      {item.subtitle && (
                        <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 ml-9.5 mb-1">{item.subtitle}</p>
                      )}
                      <div className="flex items-center justify-between ml-9.5">
                        <span className="text-[10px] sm:text-xs font-semibold text-blue-600 dark:text-blue-400 group-hover:text-blue-700 dark:group-hover:text-blue-300 transition-colors">
                          {item.actionLabel}
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors flex-shrink-0" />
                      </div>
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
