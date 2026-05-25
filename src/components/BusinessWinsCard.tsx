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
            title: 'First Lead Recovered',
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
            title: '5 Leads Recovered',
            description: 'Successfully captured 5 missed calls',
            icon: 'trophy',
            earned: false
          },
          {
            id: 'ten_leads',
            title: '10 Leads Recovered',
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
            title: '25 Leads Recovered',
            description: 'Successfully captured 25 missed calls',
            icon: 'trophy',
            earned: false
          },
          {
            id: 'fifty_leads',
            title: '50 Leads Recovered',
            description: 'Successfully captured 50 missed calls',
            icon: 'trophy',
            earned: false
          },
          {
            id: 'hundred_leads',
            title: '100 Leads Recovered',
            description: 'Successfully captured 100 missed calls',
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
          .single()

        if (firstLead) {
          earnedAchievements.push({
            ...allAchievements.find(a => a.id === 'first_lead')!,
            earned: true,
            earnedAt: firstLead.created_at
          })
        }

        // Check for first customer reply
        const { data: firstReply } = await supabase
          .from('messages')
          .select('created_at')
          .eq('business_id', business.id)
          .eq('direction', 'inbound')
          .order('created_at', { ascending: true })
          .limit(1)
          .single()

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

        // Check for first follow-up
        const { data: firstFollowUp } = await supabase
          .from('follow_up_jobs')
          .select('created_at')
          .eq('business_id', business.id)
          .eq('status', 'completed')
          .order('created_at', { ascending: true })
          .limit(1)
          .single()

        if (firstFollowUp) {
          earnedAchievements.push({
            ...allAchievements.find(a => a.id === 'first_followup')!,
            earned: true,
            earnedAt: firstFollowUp.created_at
          })
        }

        // Check for 5 customer replies
        const { count: replyCount } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', business.id)
          .eq('direction', 'inbound')

        if (replyCount && replyCount >= 5) {
          earnedAchievements.push({
            ...allAchievements.find(a => a.id === 'five_replies')!,
            earned: true
          })
        }

        // Check for 25 leads
        if (leadCount && leadCount >= 25) {
          earnedAchievements.push({
            ...allAchievements.find(a => a.id === 'twenty_five_leads')!,
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
      <div className="bg-card dark:bg-slate-900/60 backdrop-blur-sm border border-border rounded-xl p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">Business Wins</h3>
          <div className="text-xs text-muted-foreground">Loading...</div>
        </div>
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-muted rounded-full"></div>
                <div className="flex-1">
                  <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
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
    return null // Don't show the card if no achievements earned yet
  }

  return (
    <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-semibold text-foreground">Business Wins</h3>
        <div className="text-xs text-muted-foreground">
          {achievements.length} achievement{achievements.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div className="space-y-4">
        {achievements.slice(0, 3).map((achievement, index) => (
          <div key={achievement.id} className="flex items-start gap-4">
            <div className="flex-shrink-0 w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center shadow-sm">
              <span className="text-amber-600 dark:text-amber-400 text-lg">
                🎉
              </span>
            </div>
            <div className="flex-1 min-w-0 pt-1">
              <p className="text-base font-semibold text-foreground mb-1">{achievement.title}</p>
              <p className="text-sm text-muted-foreground mb-2">{achievement.description}</p>
              {achievement.earnedAt && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Earned {formatRelativeTime(achievement.earnedAt)}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {achievements.length > 3 && (
        <div className="mt-4 text-center">
          <p className="text-xs text-muted-foreground">
            +{achievements.length - 3} more achievement{achievements.length - 3 !== 1 ? 's' : ''}
          </p>
        </div>
      )}
    </div>
  )
}
