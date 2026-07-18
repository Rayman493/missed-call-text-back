'use client'

import React, { useState, useEffect } from 'react'
import { Business } from '@/lib/types'
import { createBrowserClient } from '@/lib/supabase/browser'
import { Trophy, Star, Target, Zap } from 'lucide-react'
import AchievementsModal, { AchievementItem } from '@/components/AchievementsModal'

interface BusinessWinsCardProps {
  business: Business | null
}

export default function BusinessWinsCard({ business }: BusinessWinsCardProps) {
  const [allAchievements, setAllAchievements] = useState<AchievementItem[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)

  useEffect(() => {
    if (!business) return

    const fetchAchievements = async () => {
      try {
        const supabase = createBrowserClient()
        const businessPhone = business.twilio_phone_number || ''

        const [firstLeadRes, leadCountRes, firstReplyRes, replyCountRes, firstFollowUpRes, followUpsCountRes, jobsCompletedCountRes, tasksCompletedCountRes] = await Promise.all([
          supabase.from('leads').select('created_at').eq('business_id', business.id).order('created_at', { ascending: true }).limit(1).maybeSingle(),
          supabase.from('leads').select('*', { count: 'exact', head: true }).eq('business_id', business.id),
          supabase.from('messages').select('created_at').eq('to_phone', businessPhone).eq('direction', 'inbound').order('created_at', { ascending: true }).limit(1).maybeSingle(),
          supabase.from('messages').select('*', { count: 'exact', head: true }).eq('to_phone', businessPhone).eq('direction', 'inbound'),
          supabase.from('follow_up_jobs').select('created_at').eq('business_id', business.id).eq('status', 'sent').order('created_at', { ascending: true }).limit(1).maybeSingle(),
          supabase.from('follow_up_jobs').select('*', { count: 'exact', head: true }).eq('business_id', business.id).eq('status', 'sent'),
          supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('business_id', business.id).eq('status', 'completed'),
          supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('business_id', business.id).eq('completed', true),
        ])

        const firstLeadAt = (firstLeadRes as any)?.data?.created_at as string | undefined
        const leadCount = (leadCountRes as any)?.count as number | null
        const firstReplyAt = (firstReplyRes as any)?.data?.created_at as string | undefined
        const replyCount = (replyCountRes as any)?.count as number | null
        const firstFollowUpAt = (firstFollowUpRes as any)?.data?.created_at as string | undefined
        const followUpsSentCount = (followUpsCountRes as any)?.count as number | null
        const jobsCompletedCount = (jobsCompletedCountRes as any)?.count as number | null
        const tasksCompletedCount = (tasksCompletedCountRes as any)?.count as number | null

        const daysSinceCreation = business?.created_at
          ? Math.floor((new Date().getTime() - new Date(business.created_at).getTime()) / (1000 * 60 * 60 * 24))
          : 0

        const defs: (Omit<AchievementItem, 'earned' | 'earnedAt' | 'progressCurrent' | 'progressTarget'> & {
          target?: number
          metric?: 'leads' | 'replies' | 'followups' | 'jobsCompleted' | 'tasksCompleted' | 'days'
        })[] = [
          { id: 'first_lead', title: 'First Customer Recovered', description: 'Captured your first missed call', icon: 'star', category: 'Getting Started' },
          { id: 'first_reply', title: 'First Customer Reply', description: 'Customer responded to your instant text', icon: 'star', category: 'Getting Started' },
          { id: 'first_followup', title: 'First Follow-Up Sent', description: 'Automated follow-up message delivered', icon: 'zap', category: 'Getting Started' },

          { id: 'leads_5', title: '5 Customers Recovered', description: 'Successfully captured 5 missed calls', icon: 'trophy', category: 'Customer Growth', target: 5, metric: 'leads' },
          { id: 'leads_10', title: '10 Customers Recovered', description: 'Successfully captured 10 missed calls', icon: 'trophy', category: 'Customer Growth', target: 10, metric: 'leads' },
          { id: 'leads_25', title: '25 Customers Recovered', description: 'Successfully captured 25 missed calls', icon: 'trophy', category: 'Customer Growth', target: 25, metric: 'leads' },
          { id: 'leads_50', title: '50 Customers Recovered', description: 'Successfully captured 50 missed calls', icon: 'trophy', category: 'Customer Growth', target: 50, metric: 'leads' },
          { id: 'leads_100', title: '100 Customers Recovered', description: 'Successfully captured 100 missed calls', icon: 'trophy', category: 'Customer Growth', target: 100, metric: 'leads' },

          { id: 'replies_10', title: '10 Customer Replies', description: '10 customers have responded to your messages', icon: 'target', category: 'Communication', target: 10, metric: 'replies' },
          { id: 'replies_50', title: '50 Customer Replies', description: '50 customers have responded to your messages', icon: 'target', category: 'Communication', target: 50, metric: 'replies' },

          { id: 'job_completed_1', title: 'First Job Completed', description: 'Mark your first job as completed', icon: 'trophy', category: 'Jobs & Revenue', target: 1, metric: 'jobsCompleted' },
          { id: 'jobs_completed_10', title: '10 Jobs Completed', description: 'Complete 10 jobs', icon: 'trophy', category: 'Jobs & Revenue', target: 10, metric: 'jobsCompleted' },

          { id: 'task_completed_1', title: 'First Task Completed', description: 'Complete your first task', icon: 'star', category: 'Organization', target: 1, metric: 'tasksCompleted' },

          { id: 'one_week_active', title: '1 Week Active', description: 'ReplyFlow has been protecting your business for a week', icon: 'star', category: 'Milestones', target: 7, metric: 'days' },
          { id: 'one_month_active', title: '1 Month Active', description: 'ReplyFlow has been protecting your business for a month', icon: 'trophy', category: 'Milestones', target: 30, metric: 'days' },
        ]

        const built: AchievementItem[] = defs.map(def => {
          let current = 0
          if (def.metric === 'leads') current = leadCount || 0
          if (def.metric === 'replies') current = replyCount || 0
          if (def.metric === 'followups') current = followUpsSentCount || 0
          if (def.metric === 'jobsCompleted') current = jobsCompletedCount || 0
          if (def.metric === 'tasksCompleted') current = tasksCompletedCount || 0
          if (def.metric === 'days') current = daysSinceCreation

          const earned = (() => {
            if (!def.metric) {
              if (def.id === 'first_lead') return Boolean(firstLeadAt)
              if (def.id === 'first_reply') return Boolean(firstReplyAt)
              if (def.id === 'first_followup') return Boolean(firstFollowUpAt)
              return false
            }
            const target = def.target || 0
            return current >= target
          })()

          const earnedAt = (() => {
            if (def.id === 'first_lead') return firstLeadAt
            if (def.id === 'first_reply') return firstReplyAt
            if (def.id === 'first_followup') return firstFollowUpAt
            return undefined
          })()

        return {
            id: def.id,
            title: def.title,
            description: def.description,
            icon: def.icon,
            category: def.category,
            earned,
            earnedAt,
            progressCurrent: def.metric ? current : undefined,
            progressTarget: def.metric ? def.target : undefined,
          }
        })

        setAllAchievements(built)
      } catch (error) {
        console.error('Error fetching achievements:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchAchievements()
  }, [business])

  const getAchievementIcon = (icon: string) => {
    switch (icon) {
      case 'trophy':
        return <Trophy className="w-5 h-5" />
      case 'star':
        return <Star className="w-5 h-5" />
      case 'target':
        return <Target className="w-5 h-5" />
      case 'zap':
        return <Zap className="w-5 h-5" />
      default:
        return <Trophy className="w-5 h-5" />
    }
  }

  const formatRelativeTime = (timestamp: string) => {
    const now = new Date()
    const eventTime = new Date(timestamp)
    const diffInDays = Math.floor((now.getTime() - eventTime.getTime()) / (1000 * 60 * 60 * 24))
    
    if (diffInDays === 0) return 'Earned today'
    if (diffInDays === 1) return 'Earned yesterday'
    if (diffInDays < 7) return `Earned ${diffInDays} days ago`
    if (diffInDays < 30) return `Earned ${Math.floor(diffInDays / 7)} week${Math.floor(diffInDays / 7) > 1 ? 's' : ''} ago`
    return eventTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  if (loading) {
    return (
      <div className="bg-card text-card-foreground rounded-xl border border-border/50 shadow-sm p-3 sm:p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm sm:text-base font-semibold text-foreground">Achievements</h3>
          <div className="text-xs text-muted-foreground">Loading...</div>
        </div>
        <div className="space-y-2">
          {[1, 2].map(i => (
            <div key={i} className="animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-muted rounded-lg"></div>
                <div className="flex-1">
                  <div className="h-3.5 bg-muted rounded w-3/4 mb-1.5"></div>
                  <div className="h-3 bg-muted rounded w-1/2"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const unlocked = allAchievements.filter(a => a.earned)
  const total = allAchievements.length

  return (
    <div className="bg-card text-card-foreground rounded-xl border border-border/50 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 p-3 sm:p-4">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 sm:w-8 sm:h-8 bg-amber-500/10 dark:bg-amber-500/15 rounded-lg flex items-center justify-center">
            <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-600 dark:text-amber-500" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-semibold text-foreground">Achievements</h3>
            <p className="text-[10px] text-muted-foreground">{unlocked.length} of {total} unlocked</p>
          </div>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="text-xs text-blue-500 hover:text-blue-400 font-medium"
        >
          View All Achievements →
        </button>
      </div>

      <div className="space-y-1.5">
        {unlocked
          .slice()
          .sort((a, b) => {
            if (a.earnedAt && b.earnedAt) return new Date(b.earnedAt).getTime() - new Date(a.earnedAt).getTime()
            if (a.earnedAt) return -1
            if (b.earnedAt) return 1
            return a.title.localeCompare(b.title)
          })
          .slice(0, 5)
          .map((achievement) => (
          <div 
            key={achievement.id} 
            className="flex items-start gap-2.5 bg-muted/30 dark:bg-muted/20 border border-border/40 rounded-lg p-2 sm:p-2.5 hover:bg-muted/50 dark:hover:bg-muted/30 transition-colors"
          >
            <div className="flex-shrink-0 w-6 h-6 bg-emerald-500/15 dark:bg-emerald-500/20 rounded-md flex items-center justify-center mt-0.5">
              <svg className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs sm:text-sm font-medium text-foreground truncate leading-tight">
                {achievement.title}
              </p>
              <p className="text-[10px] sm:text-xs text-muted-foreground truncate mt-0.5 leading-tight">
                {achievement.description}
              </p>
              {achievement.earnedAt && (
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 font-medium leading-tight">
                  {formatRelativeTime(achievement.earnedAt)}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {unlocked.length > 5 && (
        <div className="mt-2 text-center">
          <p className="text-[10px] sm:text-xs text-muted-foreground font-medium">
            +{unlocked.length - 5} more milestone{unlocked.length - 5 > 1 ? 's' : ''}
          </p>
        </div>
      )}

      <AchievementsModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        achievements={allAchievements}
      />
    </div>
  )
}
