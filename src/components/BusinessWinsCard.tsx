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
    
    if (diffInDays === 0) return 'today'
    if (diffInDays === 1) return 'yesterday'
    if (diffInDays < 7) return `${diffInDays} days ago`
    return `${Math.floor(diffInDays / 7)} weeks ago`
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-card border border-slate-200 dark:border-slate-700 rounded-xl p-3 sm:p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-slate-900 dark:text-foreground">Achievements</h3>
          <div className="text-xs text-slate-500 dark:text-slate-400">Loading...</div>
        </div>
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-200 dark:bg-slate-700 rounded-full"></div>
                <div className="flex-1">
                  <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/2"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (achievements.length < 2) {
    return null // Hide section entirely if fewer than 2 achievements
  }

  return (
    <div className="bg-white dark:bg-card border border-slate-200 dark:border-slate-700 rounded-xl p-3 sm:p-4 shadow-sm hover:shadow-md transition-all duration-200">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">🏆</span>
          <h3 className="text-base font-semibold text-slate-900 dark:text-foreground">Achievements</h3>
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
          {achievements.length} earned
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {achievements.slice(0, 4).map((achievement) => (
          <div key={achievement.id} className="flex items-start gap-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 rounded-lg p-2">
            <div className="flex-shrink-0 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center mt-0.5">
              <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] sm:text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                {achievement.title}
              </p>
              <p className="text-[9px] text-slate-500 dark:text-slate-400 truncate">
                {achievement.description}
              </p>
              {achievement.earnedAt && (
                <p className="text-[9px] text-green-600 dark:text-green-400 mt-0.5 font-medium">
                  ✓ {formatRelativeTime(achievement.earnedAt)}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {achievements.length > 4 && (
        <div className="mt-1.5 text-center">
          <p className="text-[9px] text-slate-500 dark:text-slate-400 font-medium">
            +{achievements.length - 4} more
          </p>
        </div>
      )}
    </div>
  )
}
