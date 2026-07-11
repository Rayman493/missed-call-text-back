'use client'

import React from 'react'
import Link from 'next/link'
import { Phone, MessageSquare, CheckCircle, ArrowRight, Settings } from 'lucide-react'

interface EmptyStateGuidanceProps {
  type?: 'leads' | 'activity' | 'general'
  onTestSetup?: () => void
}

export default function EmptyStateGuidance({ 
  type = 'general', 
  onTestSetup 
}: EmptyStateGuidanceProps) {
  const getContent = () => {
    switch (type) {
      case 'leads':
        return {
          title: 'No customers captured yet',
          description: 'Enable call forwarding to start capturing missed calls',
          steps: [
            {
              icon: Phone,
              title: 'Enable call forwarding',
              description: 'Forward missed calls to your ReplyFlow number'
            },
            {
              icon: Phone,
              title: 'Place a test call',
              description: 'Call your business line and let it go to voicemail'
            },
            {
              icon: MessageSquare,
              title: 'Watch ReplyFlow respond',
              description: 'See the automatic text message sent to your test call'
            }
          ]
        }
      
      case 'activity':
        return {
          title: 'No recent activity',
          description: 'Activity will appear as ReplyFlow protects your business',
          steps: [
            {
              icon: Phone,
              title: 'Missed calls trigger activity',
              description: 'Each missed call creates a new customer'
            },
            {
              icon: MessageSquare,
              title: 'Automated messages are sent',
              description: 'Instant texts engage your customers'
            },
            {
              icon: CheckCircle,
              title: 'Follow-ups are scheduled',
              description: 'Automated outreach keeps conversations going'
            }
          ]
        }
      
      default:
        return {
          title: 'Welcome to ReplyFlow',
          description: 'Start capturing missed calls and turning them into business opportunities',
          steps: [
            {
              icon: Phone,
              title: 'Set up call forwarding',
              description: 'Configure your business phone to forward missed calls'
            },
            {
              icon: MessageSquare,
              title: 'Customize your message',
              description: 'Personalize the automated text your customers receive'
            },
            {
              icon: CheckCircle,
              title: 'Test your setup',
              description: 'Verify everything works with a quick test call'
            }
          ]
        }
    }
  }

  const content = getContent()

  return (
    <div className="bg-gradient-to-br from-blue-900/20 to-indigo-900/20 border border-blue-800/50 rounded-xl p-6 sm:p-8">
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
          <Phone className="w-8 h-8 text-blue-400" />
        </div>
        <h3 className="text-xl font-semibold text-foreground mb-2">{content.title}</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">{content.description}</p>
      </div>

      <div className="space-y-4 mb-6">
        {content.steps.map((step, index) => (
          <div key={index} className="flex items-start gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-slate-800 rounded-full flex items-center justify-center border border-blue-800/50">
              <step.icon className="w-4 h-4 text-blue-400" />
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-medium text-foreground mb-1">{step.title}</h4>
              <p className="text-xs text-muted-foreground">{step.description}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        {onTestSetup ? (
          <button
            onClick={onTestSetup}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors duration-150"
          >
            <Phone className="w-4 h-4" />
            Test Setup
          </button>
        ) : (
          <Link
            href="/dashboard/test-setup"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors duration-150"
          >
            <Phone className="w-4 h-4" />
            Test Setup
          </Link>
        )}
        
        <Link
          href="/dashboard/settings"
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-foreground text-sm font-medium rounded-lg border border-border transition-colors duration-150"
        >
          <Settings className="w-4 h-4" />
          Configure Settings
        </Link>
      </div>

      {type === 'leads' && (
        <div className="mt-6 p-4 bg-amber-900/20 border border-amber-800/50 rounded-lg">
          <p className="text-xs text-amber-300 text-center">
            <strong>Pro tip:</strong> Most businesses capture their first lead within 24 hours of setup
          </p>
        </div>
      )}
    </div>
  )
}
