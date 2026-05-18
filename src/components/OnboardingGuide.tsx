'use client'

import { CheckCircle, Phone, MessageSquare, Zap } from 'lucide-react'

interface OnboardingGuideProps {
  isTrialActive?: boolean
}

export default function OnboardingGuide({ isTrialActive = false }: OnboardingGuideProps) {
  const steps = [
    {
      icon: CheckCircle,
      title: 'Start your free trial',
      description: 'Activate ReplyFlow with no charge today. Cancel anytime.',
    },
    {
      icon: Phone,
      title: 'Get your ReplyFlow number',
      description: 'Your dedicated local number is set up automatically.',
    },
    {
      icon: MessageSquare,
      title: 'Connect your business line',
      description: 'Missed calls from your business number are routed to ReplyFlow.',
    },
    {
      icon: Zap,
      title: 'Capture missed callers automatically',
      description: 'ReplyFlow texts missed callers and recovers leads for you.',
    },
  ]

  return (
    <div className="bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900/50 dark:to-blue-900/20 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 sm:p-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
          <Zap className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        </div>
        <h2 className="text-base sm:text-lg font-semibold text-foreground">Get started in minutes</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {steps.map((step, index) => {
          const Icon = step.icon
          const isCurrentStep = isTrialActive ? index < 4 : index === 0
          
          return (
            <div
              key={index}
              className={`flex gap-3 p-3 rounded-xl border transition-all ${
                isCurrentStep
                  ? 'bg-white dark:bg-slate-800/50 border-blue-200 dark:border-blue-700/50 shadow-sm'
                  : 'bg-transparent border-slate-200 dark:border-slate-700/50'
              }`}
            >
              <div
                className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                  isCurrentStep
                    ? 'bg-blue-100 dark:bg-blue-900/30'
                    : 'bg-slate-100 dark:bg-slate-800'
                }`}
              >
                <Icon className={`w-4 h-4 ${isCurrentStep ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className={`text-sm font-semibold mb-1 ${isCurrentStep ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {step.title}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {step.description}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <CheckCircle className="w-3 h-3 text-green-500" />
            Setup takes about 5 minutes
          </span>
          <span className="inline-flex items-center gap-1">
            <CheckCircle className="w-3 h-3 text-green-500" />
            Works with your existing business number
          </span>
          <span className="inline-flex items-center gap-1">
            <CheckCircle className="w-3 h-3 text-green-500" />
            No hardware required
          </span>
          <span className="inline-flex items-center gap-1">
            <CheckCircle className="w-3 h-3 text-green-500" />
            Cancel anytime during your free trial
          </span>
        </div>
      </div>
    </div>
  )
}
