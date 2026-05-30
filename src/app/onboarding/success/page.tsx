'use client'

import Link from 'next/link'
import Footer from '@/components/Footer'
import { CheckCircle, ArrowRight, Sparkles } from 'lucide-react'

export default function OnboardingSuccessPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 flex items-center justify-center min-h-[calc(100vh-200px)]">
        <div className="text-center w-full">
          {/* Success Icon */}
          <div className="mb-8 flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 bg-blue-500/30 rounded-full animate-ping opacity-20"></div>
              <div className="relative w-24 h-24 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center shadow-2xl shadow-blue-500/30">
                <CheckCircle className="w-12 h-12 text-white" />
              </div>
            </div>
          </div>

          {/* Decorative Sparkles */}
          <div className="absolute top-1/4 left-1/4 opacity-20">
            <Sparkles className="w-8 h-8 text-blue-400" />
          </div>
          <div className="absolute top-1/3 right-1/4 opacity-20">
            <Sparkles className="w-6 h-6 text-purple-400" />
          </div>

          {/* Header */}
          <h1 className="text-5xl sm:text-6xl font-bold text-white mb-4 tracking-tight">
            Setup Complete!
          </h1>
          <p className="text-xl text-slate-300 mb-6 max-w-2xl mx-auto leading-relaxed">
            Your ReplyFlow account has been successfully set up and is ready to capture leads.
          </p>

          {/* Success Message */}
          <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-2xl p-6 mb-8 max-w-xl mx-auto">
            <div className="flex items-center justify-center gap-3 text-slate-300">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium">System Status: Healthy</span>
            </div>
          </div>

          {/* What's Next */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10 max-w-3xl mx-auto">
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-white mb-1">Phone Connected</h3>
              <p className="text-xs text-slate-400">Your business number is ready</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-white mb-1">Auto-Reply Active</h3>
              <p className="text-xs text-slate-400">Missed calls will be answered</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-white mb-1">Lead Capture Ready</h3>
              <p className="text-xs text-slate-400">Start collecting leads now</p>
            </div>
          </div>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/dashboard"
              className="group inline-flex items-center px-8 py-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-xl shadow-lg shadow-blue-600/30 hover:shadow-blue-600/40 transition-all duration-200 hover:scale-105"
            >
              Go to Dashboard
              <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              href="/dashboard/settings"
              className="inline-flex items-center px-8 py-4 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl border border-slate-700 hover:border-slate-600 transition-all duration-200"
            >
              Configure Settings
            </Link>
          </div>

          {/* Trust Copy */}
          <p className="mt-8 text-sm text-slate-500">
            You can always adjust your settings from the dashboard
          </p>
        </div>
      </div>
      <Footer />
    </div>
  )
}
