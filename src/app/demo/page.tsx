'use client'

import { useState } from 'react'
import SSRSafeNavbar from '@/components/SSRSafeNavbar'
import Footer from '@/components/Footer'
import Link from 'next/link'
import { MessageCircle, Users, Phone, CheckCircle2 } from 'lucide-react'

export default function DemoPage() {
  const [activeTab, setActiveTab] = useState<'ai' | 'sms'>('ai')

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
          <div className="text-center space-y-4">
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white">
              See How ReplyFlow Recovers Missed Leads
            </h1>
            <p className="text-base sm:text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
              AI voicemail intake and automated SMS follow-up help ensure missed calls become opportunities.
            </p>
            <div className="pt-4">
              <Link
                href="/auth?mode=signup"
                className="inline-flex items-center justify-center h-12 px-8 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors shadow-sm hover:shadow-md hover:-translate-y-[1px] transition-all"
              >
                Start Your 14-Day Free Trial
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-center">
          <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-1 inline-flex">
            <button
              onClick={() => setActiveTab('ai')}
              className={`px-6 py-3 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'ai'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              AI Voicemail Intake
            </button>
            <button
              onClick={() => setActiveTab('sms')}
              className={`px-6 py-3 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'sms'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              SMS Recovery
            </button>
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'ai' ? (
          <div className="max-w-2xl mx-auto">
            <div className="bg-slate-100 dark:bg-slate-900/50 rounded-2xl p-6 sm:p-10 shadow-lg border border-slate-200 dark:border-slate-800">
              <div className="space-y-6">
                {/* Step 1: Incoming Call */}
                <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-sm font-bold">1</span>
                    </div>
                    <h3 className="font-semibold text-slate-900 dark:text-foreground">Incoming Call</h3>
                  </div>
                  <div className="pl-11">
                    <p className="text-slate-600 dark:text-slate-400 font-medium">Arctic Air HVAC</p>
                    <p className="text-slate-500 dark:text-slate-500 text-sm mt-1">Ringing...</p>
                    <p className="text-slate-500 dark:text-slate-500 text-sm">Ringing...</p>
                    <p className="text-slate-500 dark:text-slate-500 text-sm">Ringing...</p>
                  </div>
                </div>

                {/* Step 2: No Answer */}
                <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 bg-orange-600 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-sm font-bold">2</span>
                    </div>
                    <h3 className="font-semibold text-slate-900 dark:text-foreground">No Answer</h3>
                  </div>
                  <div className="pl-11">
                    <p className="text-slate-600 dark:text-slate-400">Call forwarded to ReplyFlow</p>
                  </div>
                </div>

                {/* Step 3: AI Voicemail Intake */}
                <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 bg-emerald-600 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-sm font-bold">3</span>
                    </div>
                    <h3 className="font-semibold text-slate-900 dark:text-foreground">AI Voicemail Intake</h3>
                  </div>
                  <div className="pl-11">
                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
                      <p className="text-blue-900 dark:text-blue-100 text-sm italic">
                        "Hi, you've reached Arctic Air HVAC. Sorry we missed your call. Please leave your name, phone number, and what you need help with."
                      </p>
                    </div>
                  </div>
                </div>

                {/* Step 4: Caller Details Captured */}
                <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-sm font-bold">4</span>
                    </div>
                    <h3 className="font-semibold text-slate-900 dark:text-foreground">Caller Details Captured</h3>
                  </div>
                  <div className="pl-11 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500 dark:text-slate-500">Name:</span>
                      <span className="text-slate-900 dark:text-foreground font-medium">John Smith</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500 dark:text-slate-500">Phone:</span>
                      <span className="text-slate-900 dark:text-foreground font-medium">(412) 555-0123</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500 dark:text-slate-500">Issue:</span>
                      <span className="text-slate-900 dark:text-foreground font-medium">AC not cooling</span>
                    </div>
                  </div>
                </div>

                {/* Step 5: Lead Created */}
                <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 border border-green-200 dark:border-green-800">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-sm font-bold">5</span>
                    </div>
                    <h3 className="font-semibold text-green-900 dark:text-green-100">Lead Created</h3>
                  </div>
                  <div className="pl-11">
                    <div className="flex gap-6 text-sm">
                      <div>
                        <span className="text-green-700 dark:text-green-300">Status:</span>
                        <span className="text-green-900 dark:text-green-100 font-medium ml-2">New Lead</span>
                      </div>
                      <div>
                        <span className="text-green-700 dark:text-green-300">Priority:</span>
                        <span className="text-green-900 dark:text-green-100 font-medium ml-2">High</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto">
            <div className="bg-slate-100 dark:bg-slate-900/50 rounded-2xl p-6 sm:p-8 shadow-lg">
              {/* Missed Call Event */}
              <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl p-4 mb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">Arctic Air HVAC</p>
                    <p className="text-sm text-orange-700 dark:text-orange-300 font-medium">Missed Call</p>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">2:33 PM</p>
                </div>
              </div>

              {/* Automated Text Sent */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">Automated Text Sent</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">2:34 PM</p>
                </div>
              </div>

              <div className="bg-slate-100 dark:bg-slate-900/50 rounded-2xl p-6 sm:p-8 shadow-lg">
                {/* Business Message 1 */}
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

              {/* Lead Card */}
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 mt-4">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                  <p className="font-semibold text-green-900 dark:text-green-100">Lead Created</p>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-green-700 dark:text-green-300">Phone:</span>
                    <span className="text-green-900 dark:text-green-100 font-medium">(412) 555-0123</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-green-700 dark:text-green-300">Issue:</span>
                    <span className="text-green-900 dark:text-green-100 font-medium">AC not cooling</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-green-700 dark:text-green-300">Location:</span>
                    <span className="text-green-900 dark:text-green-100 font-medium">Pittsburgh</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-green-700 dark:text-green-300">Status:</span>
                    <span className="text-green-900 dark:text-green-100 font-medium">New Lead</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-green-700 dark:text-green-300">Source:</span>
                    <span className="text-green-900 dark:text-green-100 font-medium">Missed Call</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Supporting Cards */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-4 text-center">
            <div className="flex justify-center mb-2">
              <Phone className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            </div>
            <p className="text-sm font-medium text-slate-900 dark:text-white">Missed Call Detected</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">ReplyFlow activates when you can't answer</p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-4 text-center">
            <div className="flex justify-center mb-2">
              <MessageCircle className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <p className="text-sm font-medium text-slate-900 dark:text-white">Automated Text Sent</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Instant text-back to recover the opportunity</p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-4 text-center">
            <div className="flex justify-center mb-2">
              <Users className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <p className="text-sm font-medium text-slate-900 dark:text-white">Lead Captured</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Conversation saved in your dashboard</p>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <div className="text-center space-y-4">
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-2">
              Ready to stop missing leads?
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              Start your 14-day free trial and never miss another customer call.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
              <Link
                href="/auth?mode=signup"
                className="inline-flex items-center h-11 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors shadow-sm hover:shadow-md hover:-translate-y-[1px] transition-all"
              >
                Start Your 14-Day Free Trial
              </Link>
              <Link
                href="/"
                className="inline-flex items-center h-11 px-6 py-2.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-semibold rounded-lg transition-colors shadow-sm hover:shadow-md"
              >
                Back to Home
              </Link>
            </div>
            <div className="space-y-1 mt-4">
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
