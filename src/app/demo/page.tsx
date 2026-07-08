'use client'

import SSRSafeNavbar from '@/components/SSRSafeNavbar'
import Footer from '@/components/Footer'
import InteractiveDemoWalkthrough from '@/components/InteractiveDemoWalkthrough'
import Link from 'next/link'
import { MessageCircle, Phone, CheckCircle2, Sparkles } from 'lucide-react'

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 relative overflow-hidden">
      {/* Subtle background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-blue-500/5 dark:bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-purple-500/5 dark:bg-purple-500/10 rounded-full blur-3xl" />
      </div>

      <SSRSafeNavbar forceDark={true} />

      {/* Back to Home Navigation */}
      <div className="relative bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm border-b border-slate-200/50 dark:border-slate-800/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-200 group"
          >
            <svg
              className="w-4 h-4 transition-transform duration-200 group-hover:-translate-x-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Home
          </Link>
        </div>
      </div>

      {/* Hero Section */}
      <div className="relative bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm border-b border-slate-200/50 dark:border-slate-800/50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <div className="text-center space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-full border border-blue-200 dark:border-blue-800 mb-4">
              <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Interactive Demo</span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-900 dark:text-white tracking-tight">
              See How ReplyFlow Helps Recover Missed Leads
            </h1>
            <p className="text-lg sm:text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
              AI Voice answers forwarded missed calls, collects customer information, and sends text responses quickly.
            </p>
            <div className="pt-6">
              <Link
                href="/auth?mode=signup"
                className="inline-flex items-center justify-center h-14 px-8 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl hover:-translate-y-[2px] text-base"
              >
                Start Your 14-Day Free Trial
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Walkthrough */}
      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <InteractiveDemoWalkthrough />
      </div>

      {/* Supporting Cards - Product Highlights */}
      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 p-6 hover:shadow-xl transition-shadow">
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-xl flex items-center justify-center">
                <Phone className="w-6 h-6 text-orange-600 dark:text-orange-400" />
              </div>
            </div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white text-center mb-2">Missed Call Detected</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 text-center leading-relaxed">ReplyFlow activates when you can't answer</p>
          </div>
          <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 p-6 hover:shadow-xl transition-shadow">
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                <MessageCircle className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white text-center mb-2">Automated Text Sent</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 text-center leading-relaxed">Quick text-back to continue the conversation</p>
          </div>
          <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 p-6 hover:shadow-xl transition-shadow">
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white text-center mb-2">Lead Updates</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 text-center leading-relaxed">Customer corrections update lead details</p>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="relative bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm border-t border-slate-200/50 dark:border-slate-800/50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <div className="text-center space-y-6">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white tracking-tight">
              Ready to stop missing leads?
            </h2>
            <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
              Start your 14-day free trial and respond to missed customer calls automatically.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
              <Link
                href="/auth?mode=signup"
                className="inline-flex items-center h-14 px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl hover:-translate-y-[2px] text-base"
              >
                Start Your 14-Day Free Trial
              </Link>
              <Link
                href="/"
                className="inline-flex items-center h-14 px-8 py-2.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-semibold rounded-xl transition-all shadow-md hover:shadow-lg text-base"
              >
                Back to Home
              </Link>
            </div>
            <div className="space-y-2 pt-4">
              <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">14-Day Free Trial</p>
              <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">$59/month after trial</p>
              <p className="text-xs text-slate-500 dark:text-slate-500">No contracts • Cancel anytime</p>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  )
}
