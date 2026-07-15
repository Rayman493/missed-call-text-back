'use client'

import React, { useState, useEffect } from 'react'
import { Business } from '@/lib/types'
import { createBrowserClient } from '@/lib/supabase/browser'
import { Trophy, Star, Target, Zap } from 'lucide-react'

interface Achievement {
  id: string
  title: string
  description: string
  icon: 'trophy' | 'star' | 'target' | 'zap'
  earned: boolean
  earnedAt?: string
}

interface BusinessWinsCardProps {
  business: Business | null
}

export default function BusinessWinsCard({ business }: BusinessWinsCardProps) {
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!business) return

    const fetchAchievements = async () => {
      try {
        const supabase = createBrowserClient()
        const earnedAchievements: Achievement[] = []

        // Define all possible achievements
        const allAchievements: Achievement[] = [
          {
            id: 'first_lead',
            title: 'First Customer Recovered',
            description: 'Captured your first missed call',
            icon: 'star',
            earned: false
          },
          {
            id: 'first_reply',
            title: 'First Customer Reply',
            description: 'Customer responded to your instant text',
            icon: 'star',
            earned: false
          },
          {
            id: 'five_leads',
            title: '5 Customers Recovered',
            description: 'Successfully captured 5 missed calls',
            icon: 'trophy',
            earned: false
          },
          {
            id: 'ten_leads',
            title: '10 Customers Recovered',
            description: 'Successfully captured 10 missed calls',
            icon: 'trophy',
            earned: false
          },
          {
            id: 'first_followup',
            title: 'First Follow-Up Sent',
            description: 'Automated follow-up message delivered',
            icon: 'zap',
            earned: false
          },
          {
            id: 'five_replies',
            title: '5 Customer Replies',
            description: '5 customers have responded to your messages',
            icon: 'target',
            earned: false
          },
          {
            id: 'twenty_five_leads',
            title: '25 Customers Recovered',
            description: 'Successfully captured 25 missed calls',
            icon: 'trophy',
            earned: false
          },
          {
            id: 'fifty_leads',
            title: '50 Customers Recovered',
            description: 'Successfully captured 50 missed calls',
            icon: 'trophy',
            earned: false
          },
          {
            id: 'hundred_leads',
            title: '100 Customers Recovered',
            description: 'Successfully captured 100 missed calls',
            icon: 'trophy',
            earned: false
          },
          {
            id: 'one_week_active',
            title: '1 Week Active',
            description: 'ReplyFlow has been protecting your business for a week',
            icon: 'star',
            earned: false
          },
          {
            id: 'one_month_active',
            title: '1 Month Active',
            description: 'ReplyFlow has been protecting your business for a month',
            icon: 'trophy',
            earned: false
          }
        ]

        // Check for first lead
        const { data: firstLead } = await supabase
          .from('leads')
          .select('created_at')
          .eq('business_id', business.id)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()

        if (firstLead) {
          earnedAchievements.push({
            ...allAchievements.find(a => a.id === 'first_lead')!,
            earned: true,
            earnedAt: firstLead.created_at
          })
        }

        // Check for first customer reply (messages has no business_id)
        const businessPhone = business.twilio_phone_number || ''
        const { data: firstReply } = await supabase
          .from('messages')
          .select('created_at')
          .eq('to_phone', businessPhone)
          .eq('direction', 'inbound')
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()

        if (firstReply) {
          earnedAchievements.push({
            ...allAchievements.find(a => a.id === 'first_reply')!,
            earned: true,
            earnedAt: firstReply.created_at
          })
        }

        // Check for lead milestones
        const { count: leadCount } = await supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', business.id)

        if (leadCount && leadCount >= 5) {
          earnedAchievements.push({
            ...allAchievements.find(a => a.id === 'five_leads')!,
            earned: true
          })
        }

        if (leadCount && leadCount >= 10) {
          earnedAchievements.push({
            ...allAchievements.find(a => a.id === 'ten_leads')!,
            earned: true
          })
        }

        if (leadCount && leadCount >= 25) {
          earnedAchievements.push({
            ...allAchievements.find(a => a.id === 'twenty_five_leads')!,
            earned: true
          })
        }

        if (leadCount && leadCount >= 50) {
          earnedAchievements.push({
            ...allAchievements.find(a => a.id === 'fifty_leads')!,
            earned: true
          })
        }

        if (leadCount && leadCount >= 100) {
          earnedAchievements.push({
            ...allAchievements.find(a => a.id === 'hundred_leads')!,
            earned: true
          })
        }

        // Check for time-based milestones
        if (business?.created_at) {
          const businessAge = new Date().getTime() - new Date(business.created_at).getTime()
          const daysSinceCreation = Math.floor(businessAge / (1000 * 60 * 60 * 24))
          
          if (daysSinceCreation >= 7) {
            earnedAchievements.push({
              ...allAchievements.find(a => a.id === 'one_week_active')!,
              earned: true
            })
          }
          
          if (daysSinceCreation >= 30) {
            earnedAchievements.push({
              ...allAchievements.find(a => a.id === 'one_month_active')!,
              earned: true
            })
          }
        }

        // Check for first follow-up
        const { data: firstFollowUp } = await supabase
          .from('follow_up_jobs')
          .select('created_at')
          .eq('business_id', business.id)
          .eq('status', 'sent')
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()

        if (firstFollowUp) {
          earnedAchievements.push({
            ...allAchievements.find(a => a.id === 'first_followup')!,
            earned: true,
            earnedAt: firstFollowUp.created_at
          })
        }

        // Check for 5 customer replies (messages has no business_id)
        const { count: replyCount } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('to_phone', businessPhone)
          .eq('direction', 'inbound')

        if (replyCount && replyCount >= 5) {
          earnedAchievements.push({
            ...allAchievements.find(a => a.id === 'five_replies')!,
            earned: true
          })
        }

        // Sort earned achievements by date (most recent first)
        earnedAchievements.sort((a, b) => {
          if (!a.earnedAt) return 1
          if (!b.earnedAt) return -1
          return new Date(b.earnedAt).getTime() - new Date(a.earnedAt).getTime()
        })

        setAchievements(earnedAchievements)
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

  if (achievements.length === 0) {
    return (
      <div className="bg-card text-card-foreground rounded-xl border border-border/50 shadow-sm p-3 sm:p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm sm:text-base font-semibold text-foreground">Achievements</h3>
          <div className="text-xs text-muted-foreground">0 earned</div>
        </div>
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <div className="w-12 h-12 sm:w-14 sm:h-14 bg-slate-500/10 dark:bg-slate-500/15 rounded-xl border border-slate-500/20 dark:border-slate-500/25 flex items-center justify-center mb-3">
            <Trophy className="w-6 h-6 sm:w-7 sm:h-7 text-slate-500/70 dark:text-slate-400/70" />
          </div>
          <p className="text-sm text-muted-foreground">Your first achievement is waiting</p>
          <p className="text-xs text-muted-foreground/70 mt-1 max-w-[200px]">
            Milestones will appear as you begin capturing customers
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-card text-card-foreground rounded-xl border border-border/50 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 p-3 sm:p-4">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 sm:w-8 sm:h-8 bg-amber-500/10 dark:bg-amber-500/15 rounded-lg flex items-center justify-center">
            <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-600 dark:text-amber-500" />
          </div>
          <h3 className="text-sm sm:text-base font-semibold text-foreground">Achievements</h3>
        </div>
        <div className="text-xs text-muted-foreground font-medium">
          {achievements.length} earned
        </div>
      </div>

      <div className="space-y-1.5">
        {achievements.slice(0, 5).map((achievement, index) => (
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

      {achievements.length > 5 && (
        <div className="mt-2 text-center">
          <p className="text-[10px] sm:text-xs text-muted-foreground font-medium">
            +{achievements.length - 5} more milestone{achievements.length - 5 > 1 ? 's' : ''}
          </p>
        </div>
      )}
    </div>
  )
}
