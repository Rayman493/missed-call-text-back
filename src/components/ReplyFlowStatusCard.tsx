import React from 'react'
import { getBusinessOnboardingState, BusinessData, OnboardingStateInfo } from '@/lib/onboarding-state'

interface ReplyFlowStatusCardProps {
  business: BusinessData | null | undefined
  hasLeads?: boolean
  hasConversations?: boolean
}

export default function ReplyFlowStatusCard({ business, hasLeads = false, hasConversations = false }: ReplyFlowStatusCardProps) {
  const onboardingState = getBusinessOnboardingState(business, { hasLeads, hasConversations })

  const getStatusIcon = (state: OnboardingStateInfo['state']) => {
    switch (state) {
      case 'PRE_TRIAL':
        return <div className="w-2 h-2 rounded-full bg-slate-400" />
      case 'ACTIVATING':
      case 'MESSAGING_SETUP':
        return <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
      case 'AWAITING_FORWARDING':
      case 'VERIFICATION_PENDING':
        return <div className="w-2 h-2 rounded-full bg-blue-400" />
      case 'LIVE':
        return <div className="w-2 h-2 rounded-full bg-green-500" />
      default:
        return <div className="w-2 h-2 rounded-full bg-slate-400" />
    }
  }

  const getStatusLines = (state: OnboardingStateInfo['state']) => {
    switch (state) {
      case 'PRE_TRIAL':
        return [
          'Waiting for activation',
          'Business texting inactive',
          'Missed-call monitoring will begin after setup'
        ]
      case 'ACTIVATING':
        return [
          'Preparing your ReplyFlow system',
          'Setup is starting automatically',
          'This usually takes a few minutes'
        ]
      case 'MESSAGING_SETUP':
        return [
          'Activating business texting',
          'Your ReplyFlow number is ready',
          'Carrier messaging registration in progress'
        ]
      case 'AWAITING_FORWARDING':
        return [
          'Waiting for business line connection',
          'ReplyFlow system is ready',
          'Connect your business line to begin monitoring'
        ]
      case 'VERIFICATION_PENDING':
        return [
          'Ready for test call',
          'System is configured',
          'Place one missed test call to confirm'
        ]
      case 'LIVE':
        return [
          'Monitoring missed calls',
          'Auto-replies active',
          'System is operational'
        ]
      default:
        return [
          'Waiting for activation',
          'Business texting inactive',
          'Missed-call monitoring will begin after setup'
        ]
    }
  }

  const statusLines = getStatusLines(onboardingState.state)

  return (
    <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">ReplyFlow Status</h3>
        <div className="flex items-center gap-1.5">
          {getStatusIcon(onboardingState.state)}
          <span className="text-xs text-muted-foreground">{onboardingState.label}</span>
        </div>
      </div>
      <div className="space-y-1.5">
        {statusLines.map((line, index) => (
          <div key={index} className="flex items-center gap-2">
            <div className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
            <p className="text-xs text-muted-foreground">{line}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
