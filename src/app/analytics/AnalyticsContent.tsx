'use client'

import React, { useEffect, useState } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import AppHeader from '@/components/AppHeader'
import Navigation from '@/components/Navigation'
import UserDropdown from '@/components/UserDropdown'
import Footer from '@/components/Footer'
import {
  Phone,
  MessageSquare,
  Send,
  Users,
  CheckCircle,
  Clock,
  TrendingUp,
  BarChart3,
  Calendar
} from 'lucide-react'
import AuthGuard from '@/components/AuthGuard'
import BusinessGuard from '@/components/BusinessGuard'

interface AnalyticsMetrics {
  missedCallsCaptured: number
  leadsCreated: number
  customerReplies: number
  activeLeads: number
  completedLeads: number
  aiIntakesCompleted: number
  aiIntakesIncomplete: number
  voicemailsCaptured: number
  aiCompletionRate: number
  followUpsSent: number
  followUpsCancelled: number
  followUpResponseRate: number
  totalConversations: number
  customerReplyRate: number
  averageMessagesPerConversation: number
  estimatedLeadsSaved: number
  recoveryRate: number
  messagesSent: number
}

interface TrendData {
  date: string
  value: number
}

export default function AnalyticsContent() {
  const { business } = useBusiness()
  const [metrics, setMetrics] = useState<AnalyticsMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [leadTrend, setLeadTrend] = useState<TrendData[]>([])
  const [replyTrend, setReplyTrend] = useState<TrendData[]>([])

  useEffect(() => {
    const fetchAnalytics = async () => {
      if (!business) return

      try {
        const supabase = createBrowserClient()

        // Get date range for analytics (last 30 days)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

        // Fetch leads in the last 30 days
        const { data: leads, error: leadsError } = await supabase
          .from('leads')
          .select('id, status, created_at, business_id')
          .eq('business_id', business.id)
          .gte('created_at', thirtyDaysAgo)

        if (leadsError) {
          console.error('[Analytics] Failed to fetch leads:', leadsError.message)
        }

        // Normalize to array - Supabase may return null or object in some cases
        const leadsArray = Array.isArray(leads) ? leads : []

        // Fetch messages for reply rate calculation - query by lead_id to match DashboardMetrics
        // IMPORTANT: Must select from_phone and to_phone for dual filter to work
        const leadIds = leadsArray.map((l: any) => l.id) || []
        let messages = []
        if (leadIds.length > 0) {
          const { data: messagesData, error: messagesError } = await supabase
            .from('messages')
            .select('id, direction, created_at, conversation_id, lead_id, from_phone, to_phone')
            .in('lead_id', leadIds)
            .gte('created_at', thirtyDaysAgo)
          messages = Array.isArray(messagesData) ? messagesData : []
          if (messagesError) {
            console.error('[Analytics] Failed to fetch messages:', messagesError.message)
          }
        }

        // Fetch AI call records
        const { data: aiCalls, error: aiCallsError } = await supabase
          .from('ai_call_records')
          .select('id, outcome, created_at, lead_id')
          .eq('business_id', business.id)
          .gte('created_at', thirtyDaysAgo)

        if (aiCallsError) {
          console.error('[Analytics] Failed to fetch AI call records:', aiCallsError.message)
        }

        // Normalize to array
        const aiCallsArray = Array.isArray(aiCalls) ? aiCalls : []

        // Fetch follow-ups from follow_up_jobs table (not follow_ups)
        const { data: followUps, error: followUpsError } = await supabase
          .from('follow_up_jobs')
          .select('id, status, cancelled_reason, created_at, lead_id')
          .eq('business_id', business.id)
          .gte('created_at', thirtyDaysAgo)

        if (followUpsError) {
          console.error('[Analytics] Failed to fetch follow-ups:', followUpsError.message)
        }

        // Normalize to array
        const followUpsArray = Array.isArray(followUps) ? followUps : []

        // Fetch conversations for accurate conversation count
        const { data: conversations, error: conversationsError } = await supabase
          .from('conversations')
          .select('id, status, created_at')
          .eq('business_id', business.id)
          .gte('created_at', thirtyDaysAgo)

        if (conversationsError) {
          console.error('[Analytics] Failed to fetch conversations:', conversationsError.message)
        }

        // Normalize to array
        const conversationsArray = Array.isArray(conversations) ? conversations : []

        // Calculate metrics
        const leadCount = leadsArray.length
        const activeLeads = leadsArray.filter((l: any) => l.status === 'active' || l.status === 'new').length || 0
        const completedLeads = leadsArray.filter((l: any) => l.status === 'completed' || l.status === 'won').length || 0

        // Filter messages using dual filter (direction + phone number) to match DashboardMetrics
        const businessPhone = business.twilio_phone_number || ''
        const inboundMessagesArray = messages?.filter((m: any) => {
          const isDirectionInbound = m.direction === 'inbound' || m.direction?.startsWith?.('inbound')
          const isToBusinessPhone = m.to_phone === businessPhone
          return isDirectionInbound || isToBusinessPhone
        }) || []
        const outboundMessagesArray = messages?.filter((m: any) => {
          const isDirectionOutbound = m.direction === 'outbound' || m.direction?.startsWith?.('outbound')
          const isFromBusinessPhone = m.from_phone === businessPhone
          return isDirectionOutbound || isFromBusinessPhone
        }) || []
        const inboundMessages = inboundMessagesArray.length
        const outboundMessages = outboundMessagesArray.length
        const totalMessages = messages?.length || 0

        const aiIntakesCompleted = aiCallsArray.filter((c: any) => c.outcome === 'completed_intake' || c.outcome === 'completed').length || 0
        const aiIntakesIncomplete = aiCallsArray.filter((c: any) => c.outcome === 'partial_intake' || c.outcome === 'incomplete').length || 0
        const totalAiCalls = aiCallsArray.length
        const aiCompletionRate = totalAiCalls > 0 ? (aiIntakesCompleted / totalAiCalls) * 100 : 0

        const followUpsSent = followUpsArray.filter((f: any) => f.status === 'sent').length || 0
        const followUpsCancelled = followUpsArray.filter((f: any) => f.status === 'cancelled' && f.cancelled_reason === 'customer_replied').length || 0

        // Calculate follow-up response rate: customer replies / (sent + customer replies)
        const followUpResponseRate = (followUpsSent + followUpsCancelled) > 0 
          ? Math.round((followUpsCancelled / (followUpsSent + followUpsCancelled)) * 100) 
          : 0

        const totalConversations = conversationsArray.length
        const customerReplyRate = totalMessages > 0 ? (inboundMessages / totalMessages) * 100 : 0
        const averageMessagesPerConversation = totalConversations > 0 ? totalMessages / totalConversations : 0

        // Calculate Recovery Rate to match Dashboard: leads with customer replies / total leads
        // A lead is recovered if it has at least one inbound customer message
        const recoveredLeadsSet = new Set(inboundMessagesArray.map((m: any) => m.lead_id))
        const recoveredLeadsCount = recoveredLeadsSet.size
        const recoveryRate = leadCount > 0 ? Math.min(100, Math.max(0, Math.round((recoveredLeadsCount / leadCount) * 100))) : 0

        const estimatedLeadsSaved = inboundMessages + aiIntakesCompleted

        // Calculate daily trends for the last 7 days
        const sevenDaysAgoForTrends = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        const dailyLeads: Record<string, number> = {}
        const dailyReplies: Record<string, number> = {}

        for (let i = 6; i >= 0; i--) {
          const date = new Date()
          date.setDate(date.getDate() - i)
          const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          dailyLeads[dateStr] = 0
          dailyReplies[dateStr] = 0
        }

        leadsArray.forEach((lead: any) => {
          const date = new Date(lead.created_at)
          if (date >= sevenDaysAgoForTrends) {
            const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            dailyLeads[dateStr] = (dailyLeads[dateStr] || 0) + 1
          }
        })

        messages.forEach((message: any) => {
          // Use dual filter for consistency with other metrics
          const isDirectionInbound = message.direction === 'inbound' || message.direction?.startsWith?.('inbound')
          const isToBusinessPhone = message.to_phone === businessPhone
          if (isDirectionInbound || isToBusinessPhone) {
            const date = new Date(message.created_at)
            if (date >= sevenDaysAgoForTrends) {
              const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              dailyReplies[dateStr] = (dailyReplies[dateStr] || 0) + 1
            }
          }
        })

        const leadTrendData = Object.entries(dailyLeads).map(([date, value]) => ({ date, value }))
        const replyTrendData = Object.entries(dailyReplies).map(([date, value]) => ({ date, value }))

        const finalMetrics = {
          missedCallsCaptured: leadCount,
          leadsCreated: leadCount,
          customerReplies: inboundMessages,
          activeLeads,
          completedLeads,
          aiIntakesCompleted,
          aiIntakesIncomplete,
          voicemailsCaptured: aiCallsArray.filter((c: any) => c.outcome === 'no_speech').length || 0,
          aiCompletionRate,
          followUpsSent,
          followUpsCancelled,
          followUpResponseRate,
          totalConversations,
          customerReplyRate,
          averageMessagesPerConversation,
          estimatedLeadsSaved,
          recoveryRate,
          messagesSent: outboundMessages
        }

        setMetrics(finalMetrics)

        setLeadTrend(leadTrendData)
        setReplyTrend(replyTrendData)
      } catch (error) {
        console.error('[Analytics] Error fetching analytics:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchAnalytics()
  }, [business])

  const hasData = metrics && (
    metrics.missedCallsCaptured > 0 ||
    metrics.customerReplies > 0 ||
    metrics.aiIntakesCompleted > 0 ||
    metrics.leadsCreated > 0 ||
    metrics.messagesSent > 0
  )

  // Generate business impact text based on actual metrics
  const getBusinessImpactText = (m: AnalyticsMetrics) => {
    if (m.customerReplies > 0) {
      return `Recovered ${m.customerReplies} customer conversation${m.customerReplies === 1 ? '' : 's'}`
    }
    if (m.missedCallsCaptured > 0) {
      return `Captured ${m.missedCallsCaptured} missed call${m.missedCallsCaptured === 1 ? '' : 's'}`
    }
    if (m.leadsCreated > 0) {
      return `Created ${m.leadsCreated} lead${m.leadsCreated === 1 ? '' : 's'} from missed calls`
    }
    if (m.aiIntakesCompleted > 0) {
      return `Completed ${m.aiIntakesCompleted} AI intake${m.aiIntakesCompleted === 1 ? '' : 's'}`
    }
    return 'No activity yet'
  }

  return (
    <AuthGuard>
      <BusinessGuard>
        <div className="min-h-screen bg-[#f5f7fb] dark:bg-background flex flex-col">
          <AppHeader showNavigation={true} />
          
          <div className="flex-1 pt-2 sm:pt-3 lg:pt-4 px-3 sm:px-4 lg:px-6 pb-8 relative z-10">
            <div className="max-w-[1400px] mx-auto">
              {/* Header */}
              <div className="mb-5">
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-foreground">
                    Analytics
                  </h1>
                  <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">
                    Last 30 Days
                  </span>
                </div>
                <p className="text-sm text-slate-600 dark:text-muted-foreground">
                  Track your ReplyFlow performance and lead recovery metrics
                </p>
              </div>

              {/* Loading Skeleton */}
              {loading && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-6">
                        <div className="animate-pulse">
                          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/2 mb-2"></div>
                          <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-3/4"></div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-6">
                    <div className="animate-pulse">
                      <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-1/3 mb-4"></div>
                      <div className="h-48 bg-slate-200 dark:bg-slate-700 rounded"></div>
                    </div>
                  </div>
                </div>
              )}

              {!loading && !hasData ? (
                /* Empty State */
                <div className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-8 sm:p-12 text-center">
                  <BarChart3 className="w-16 h-16 text-slate-400 dark:text-slate-600 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-2">
                    No analytics data yet
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-muted-foreground max-w-md mx-auto">
                    As ReplyFlow captures missed calls and conversations, performance insights will appear here.
                  </p>
                </div>
              ) : metrics && (
                <>
                  {/* Business Impact - Top Highlight */}
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200/60 dark:border-blue-800/50 rounded-xl p-4 sm:p-5 mb-3 shadow-sm">
                    <div className="flex items-start gap-4">
                      <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                        <TrendingUp className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-foreground mb-1">
                          Business Impact
                        </h3>
                        <p className="text-sm text-slate-600 dark:text-muted-foreground">
                          <span className="font-bold text-blue-600 dark:text-blue-400">{getBusinessImpactText(metrics)}</span>
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Lead Recovery Overview */}
                  <div className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-4 sm:p-5 mb-3">
                    <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-foreground mb-3 flex items-center gap-2">
                      <Phone className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                      Lead Recovery Overview
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                      <MetricCard
                        label="Missed Calls Captured"
                        value={metrics.missedCallsCaptured}
                        icon={Phone}
                      />
                      <MetricCard
                        label="Leads Created"
                        value={metrics.leadsCreated}
                        icon={Users}
                      />
                      <MetricCard
                        label="Customer Replies"
                        value={metrics.customerReplies}
                        icon={MessageSquare}
                      />
                      <MetricCard
                        label="Active Leads"
                        value={metrics.activeLeads}
                        icon={Clock}
                      />
                      <MetricCard
                        label="Completed Leads"
                        value={metrics.completedLeads}
                        icon={CheckCircle}
                      />
                    </div>
                    {metrics.missedCallsCaptured === 0 && metrics.leadsCreated === 0 && metrics.customerReplies === 0 && metrics.activeLeads === 0 && metrics.completedLeads === 0 && (
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-3 text-center">
                        No lead activity yet
                      </p>
                    )}
                  </div>

                  {/* AI Performance */}
                  <div className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-4 sm:p-5 mb-3">
                    <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-foreground mb-3 flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                      AI Performance
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <MetricCard
                        label="AI Intakes Completed"
                        value={metrics.aiIntakesCompleted}
                        icon={CheckCircle}
                      />
                      <MetricCard
                        label="AI Intakes Incomplete"
                        value={metrics.aiIntakesIncomplete}
                        icon={Clock}
                      />
                      <MetricCard
                        label="Voicemails Captured"
                        value={metrics.voicemailsCaptured}
                        icon={MessageSquare}
                      />
                      <PercentageCard
                        label="AI Completion Rate"
                        value={metrics.aiCompletionRate}
                      />
                    </div>
                    {metrics.aiIntakesCompleted === 0 && metrics.aiIntakesIncomplete === 0 && metrics.voicemailsCaptured === 0 && (
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-3 text-center">
                        No AI activity yet
                      </p>
                    )}
                  </div>

                  {/* Follow-Up Performance */}
                  <div className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-4 sm:p-5 mb-3">
                    <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-foreground mb-3 flex items-center gap-2">
                      <Send className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                      Follow-Up Performance
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      <MetricCard
                        label="Follow-Ups Sent"
                        value={metrics.followUpsSent}
                        icon={Send}
                      />
                      <MetricCard
                        label="Follow-Ups Canceled"
                        value={metrics.followUpsCancelled}
                        icon={Clock}
                      />
                      <PercentageCard
                        label="Follow-Up Response Rate"
                        value={metrics.followUpResponseRate}
                      />
                    </div>
                    {metrics.followUpsSent === 0 && metrics.followUpsCancelled === 0 && (
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-3 text-center">
                        No follow-up activity yet
                      </p>
                    )}
                  </div>

                  {/* Customer Engagement */}
                  <div className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-4 sm:p-5 mb-3">
                    <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-foreground mb-3 flex items-center gap-2">
                      <MessageSquare className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                      Customer Engagement
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      <MetricCard
                        label="Total Conversations"
                        value={metrics.totalConversations}
                        icon={MessageSquare}
                      />
                      <PercentageCard
                        label="Customer Reply Rate"
                        value={metrics.customerReplyRate}
                      />
                      <MetricCard
                        label="Avg Messages/Conversation"
                        value={Math.round(metrics.averageMessagesPerConversation * 10) / 10}
                        icon={MessageSquare}
                        isDecimal
                      />
                    </div>
                    {metrics.totalConversations === 0 && (
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-3 text-center">
                        No conversation activity yet
                      </p>
                    )}
                  </div>

                  {/* Charts */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Lead Activity Trend */}
                    <div className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-4 sm:p-5">
                      <h3 className="text-base font-semibold text-slate-900 dark:text-foreground mb-3 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                        Lead Activity Trend (7 Days)
                      </h3>
                      <SimpleBarChart data={leadTrend} color="blue" />
                    </div>

                    {/* Customer Reply Trend */}
                    <div className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-4 sm:p-5">
                      <h3 className="text-base font-semibold text-slate-900 dark:text-foreground mb-3 flex items-center gap-2">
                        <MessageSquare className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                        Customer Reply Trend (7 Days)
                      </h3>
                      <SimpleBarChart data={replyTrend} color="green" />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <Footer />
        </div>
      </BusinessGuard>
    </AuthGuard>
  )
}

function MetricCard({ label, value, icon: Icon }: { label: string; value: number; icon: any; isDecimal?: boolean }) {
  return (
    <div className="bg-slate-50 dark:bg-slate-800/40 rounded-lg p-3 sm:p-4 border border-slate-200/60 dark:border-slate-700/40">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-slate-600 dark:text-slate-400" />
        <span className="text-xs sm:text-sm text-slate-600 dark:text-muted-foreground">{label}</span>
      </div>
      <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-foreground">
        {value.toLocaleString()}
      </p>
    </div>
  )
}

function PercentageCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-slate-50 dark:bg-slate-800/40 rounded-lg p-3 sm:p-4 border border-slate-200/60 dark:border-slate-700/40">
      <div className="flex items-center gap-2 mb-2">
        <TrendingUp className="w-4 h-4 text-slate-600 dark:text-slate-400" />
        <span className="text-xs sm:text-sm text-slate-600 dark:text-muted-foreground">{label}</span>
      </div>
      <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-foreground">
        {value.toFixed(1)}%
      </p>
    </div>
  )
}

function SimpleBarChart({ data, color }: { data: TrendData[]; color: 'blue' | 'green' }) {
  const hasData = data.some(d => d.value > 0)
  
  if (!hasData) {
    return (
      <div className="flex items-center justify-center h-32 sm:h-40 text-center">
        <div className="px-4">
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
            No activity during the last 7 days
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            Activity will appear here as customers call, text, and reply
          </p>
        </div>
      </div>
    )
  }

  const maxValue = Math.max(...data.map(d => d.value), 1)
  
  const colorClass = color === 'blue' 
    ? 'bg-blue-500 dark:bg-blue-400' 
    : 'bg-green-500 dark:bg-green-400'

  return (
    <div className="flex items-end gap-2 h-32 sm:h-40">
      {data.map((item: TrendData, index: number) => {
        const height = (item.value / maxValue) * 100
        return (
          <div key={index} className="flex-1 flex flex-col items-center gap-1">
            <div 
              className={`w-full rounded-t-sm ${colorClass} transition-all duration-300`}
              style={{ height: `${Math.max(height, 5)}%` }}
            />
            <span className="text-[9px] sm:text-[10px] text-slate-600 dark:text-muted-foreground text-center">
              {item.date}
            </span>
          </div>
        )
      })}
    </div>
  )
}
