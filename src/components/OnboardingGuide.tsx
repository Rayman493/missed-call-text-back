'use client'

import { CheckCircle, Phone, MessageSquare, Zap, CheckCircle2 } from 'lucide-react'

interface OnboardingGuideProps {
  isTrialActive?: boolean
}

export default function OnboardingGuide({ isTrialActive = false }: OnboardingGuideProps) {
  return (
    <div className="bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900/50 dark:to-blue-900/20 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 sm:p-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
          <Zap className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        </div>
        <h2 className="text-base sm:text-lg font-semibold text-foreground">Get started in minutes</h2>
      </div>

      <div className="space-y-3 sm:space-y-4">
        {/* Combined setup card - success/completed state */}
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-2 border-green-200 dark:border-green-700/50 rounded-2xl p-4 sm:p-5 shadow-sm animate-in fade-in slide-in-from-top-2 duration-500">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-base sm:text-lg font-semibold text-green-700 dark:text-green-300">
                  ReplyFlow is ready
                </h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/30 rounded-full">
                  Completed automatically
                </span>
              </div>
              <p className="text-sm text-green-600/80 dark:text-green-400/80 leading-relaxed mb-2">
                Your free trial is active and your dedicated ReplyFlow number has been prepared automatically.
              </p>
              <p className="text-xs text-green-600/60 dark:text-green-400/60">
                No setup required for this step.
              </p>
            </div>
          </div>
        </div>

        {/* Connect your business line */}
        <div
          className={`flex gap-3 sm:gap-4 p-4 sm:p-5 rounded-xl border transition-all relative ${
            isTrialActive
              ? 'bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/40 border-2 border-blue-400 dark:border-blue-500 shadow-lg shadow-blue-200/50 dark:shadow-blue-900/30'
              : 'bg-slate-50/50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-700/50'
          }`}
        >
          <div
            className={`flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center ${
              isTrialActive
                ? 'bg-blue-500 dark:bg-blue-600 shadow-md'
                : 'bg-slate-200 dark:bg-slate-700'
            }`}
          >
            <Phone className={`w-5 h-5 sm:w-6 sm:h-6 ${isTrialActive ? 'text-white' : 'text-slate-400 dark:text-slate-500'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className={`text-sm sm:text-base font-bold ${isTrialActive ? 'text-blue-900 dark:text-blue-100' : 'text-muted-foreground'}`}>
                Connect your business line
              </h3>
              {isTrialActive && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white bg-blue-600 dark:bg-blue-500 rounded-full shadow-sm">
                  NEXT STEP
                </span>
              )}
            </div>
            <p className={`text-xs sm:text-sm leading-relaxed ${isTrialActive ? 'text-blue-800/80 dark:text-blue-200/80' : 'text-muted-foreground'}`}>
              Missed calls from your business number are routed to ReplyFlow.
            </p>
          </div>
        </div>

        {/* Capture missed callers automatically */}
        <div
          className={`flex gap-3 sm:gap-4 p-4 sm:p-5 rounded-xl border transition-all ${
            isTrialActive
              ? 'bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-2 border-amber-300 dark:border-amber-600/50 shadow-sm'
              : 'bg-slate-50/50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-700/50'
          }`}
        >
          <div
            className={`flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center ${
              isTrialActive
                ? 'bg-amber-500 dark:bg-amber-600 shadow-md'
                : 'bg-slate-200 dark:bg-slate-700'
            }`}
          >
            <MessageSquare className={`w-5 h-5 sm:w-6 sm:h-6 ${isTrialActive ? 'text-white' : 'text-slate-400 dark:text-slate-500'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className={`text-sm sm:text-base font-bold ${isTrialActive ? 'text-amber-900 dark:text-amber-100' : 'text-muted-foreground'}`}>
                Capture missed callers automatically
              </h3>
              {isTrialActive && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30 rounded-full shadow-sm">
                  REQUIRED
                </span>
              )}
            </div>
            <p className={`text-xs sm:text-sm leading-relaxed ${isTrialActive ? 'text-amber-800/80 dark:text-amber-200/80' : 'text-muted-foreground'}`}>
              ReplyFlow texts missed callers and recovers leads for you.
            </p>
            {isTrialActive && (
              <p className="text-xs text-amber-700/70 dark:text-amber-300/70 mt-2 font-medium">
                Complete this step to start capturing leads automatically.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 sm:mt-5 pt-4 border-t border-slate-200 dark:border-slate-700">
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

      {/* What Happens Next - Expectation Setting */}
      {isTrialActive && (
        <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-foreground mb-3">What happens next?</h3>
          <div className="space-y-2 text-xs text-muted-foreground">
            <div className="flex items-start gap-2">
              <div className="w-4 h-4 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-blue-600 dark:text-blue-400 text-[10px] font-bold">1</span>
              </div>
              <p>Missed calls from your business number automatically become leads in your dashboard</p>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-4 h-4 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-blue-600 dark:text-blue-400 text-[10px] font-bold">2</span>
              </div>
              <p>Customers receive automated text replies with your custom message</p>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-4 h-4 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-blue-600 dark:text-blue-400 text-[10px] font-bold">3</span>
              </div>
              <p>Customer replies and photos appear in your conversation threads</p>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-4 h-4 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-blue-600 dark:text-blue-400 text-[10px] font-bold">4</span>
              </div>
              <p>Follow-up messages run automatically to re-engage leads</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
