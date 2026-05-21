'use client'

import SSRSafeNavbar from '@/components/SSRSafeNavbar'
import Footer from '@/components/Footer'
import Link from 'next/link'
import { MessageCircle, Users, Clock } from 'lucide-react'

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <SSRSafeNavbar forceDark={true} />
      
      {/* Back to Home Navigation */}
      <div className="bg-white dark:bg-slate-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-200 group"
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
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <div className="text-center">
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white mb-3">
              See ReplyFlow in action
            </h1>
            <p className="text-base sm:text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
              Watch how a missed call becomes a text conversation and a captured lead.
            </p>
          </div>
        </div>
      </div>

      {/* Conversation Demo Card */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="max-w-2xl mx-auto">
          <div className="bg-slate-100 dark:bg-slate-900/50 rounded-2xl p-6 sm:p-8 shadow-lg">
            {/* Business Message 1 - ReplyFlow sends first text after missed call */}
            <div className="flex justify-end mb-4">
              <div className="bg-blue-600 rounded-2xl rounded-br-none px-4 py-3 shadow-sm max-w-[85%]">
                <p className="text-sm text-white">Sorry we missed your call — this is Arctic Air HVAC. What issue are you experiencing?</p>
                <p className="text-xs text-blue-200 mt-1">2:34 PM</p>
              </div>
            </div>
            
            {/* Customer Message 1 */}
            <div className="flex justify-start mb-4">
              <div className="bg-white dark:bg-slate-800 rounded-2xl rounded-bl-none px-4 py-3 shadow-sm max-w-[85%]">
                <p className="text-sm text-slate-800 dark:text-slate-200">My upstairs AC isn't cooling.</p>
                <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">2:35 PM</p>
              </div>
            </div>
            
            {/* Business Message 2 */}
            <div className="flex justify-end mb-4">
              <div className="bg-blue-600 rounded-2xl rounded-br-none px-4 py-3 shadow-sm max-w-[85%]">
                <p className="text-sm text-white">We can help with that. What city are you located in?</p>
                <p className="text-xs text-blue-200 mt-1">2:36 PM</p>
              </div>
            </div>
            
            {/* Customer Message 2 */}
            <div className="flex justify-start mb-4">
              <div className="bg-white dark:bg-slate-800 rounded-2xl rounded-bl-none px-4 py-3 shadow-sm max-w-[85%]">
                <p className="text-sm text-slate-800 dark:text-slate-200">Pittsburgh</p>
                <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">2:37 PM</p>
              </div>
            </div>
            
            {/* Business Message 3 */}
            <div className="flex justify-end mb-4">
              <div className="bg-blue-600 rounded-2xl rounded-br-none px-4 py-3 shadow-sm max-w-[85%]">
                <p className="text-sm text-white">Thanks — a technician can reach out shortly to schedule service.</p>
                <p className="text-xs text-blue-200 mt-1">2:38 PM</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Supporting Cards */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-4 text-center">
            <div className="flex justify-center mb-2">
              <MessageCircle className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <p className="text-sm font-medium text-slate-900 dark:text-white">Instant text-back</p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-4 text-center">
            <div className="flex justify-center mb-2">
              <Users className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <p className="text-sm font-medium text-slate-900 dark:text-white">Lead captured</p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-4 text-center">
            <div className="flex justify-center mb-2">
              <Clock className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <p className="text-sm font-medium text-slate-900 dark:text-white">Follow-up ready</p>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <div className="text-center space-y-4">
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-2">
              Ready to capture your missed calls?
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              Start your 14-day free trial and never miss another customer call.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
              <Link
                href="/onboarding"
                className="inline-flex items-center h-11 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors shadow-sm hover:shadow-md hover:-translate-y-[1px] transition-all"
              >
                Start Your Free Trial
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex items-center h-11 px-6 py-2.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-semibold rounded-lg transition-colors shadow-sm hover:shadow-md"
              >
                Back to Dashboard
              </Link>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-4">
              Setup takes just a few minutes • No contracts • 14-day free trial
            </p>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  )
}
