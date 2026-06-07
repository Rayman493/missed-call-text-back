'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function TabbedDemoSection() {
  const [activeTab, setActiveTab] = useState<'ai' | 'sms'>('ai')

  return (
    <section className="bg-gradient-to-b from-slate-50 to-white dark:from-muted dark:to-background py-24 border-t border-slate-200 dark:border-border">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-foreground mb-4">
            See ReplyFlow In Action
          </h2>
          <p className="text-lg text-slate-600 dark:text-muted-foreground max-w-2xl mx-auto">
            Watch how ReplyFlow recovers missed opportunities
          </p>
        </div>
        
        <div className="max-w-4xl mx-auto">
          {/* Tab Navigation */}
          <div className="flex justify-center mb-8">
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
          
          {/* Tab Content */}
          {activeTab === 'ai' ? (
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
                    <p className="text-slate-600 dark:text-slate-400 font-medium">Wolfie Plumbing</p>
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
                        "Hi, you've reached Wolfie Plumbing. Sorry we missed your call. Please leave your name, phone number, and what you need help with."
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
                      <span className="text-slate-900 dark:text-foreground font-medium">(555) 123-4567</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500 dark:text-slate-500">Issue:</span>
                      <span className="text-slate-900 dark:text-foreground font-medium">Water heater leaking</span>
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
          ) : (
            <div className="bg-slate-100 dark:bg-slate-900/50 rounded-2xl p-6 sm:p-10 shadow-lg border border-slate-200 dark:border-slate-800">
              <div className="space-y-6">
                {/* Step 1: Missed Call */}
                <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 bg-orange-600 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-sm font-bold">1</span>
                    </div>
                    <h3 className="font-semibold text-slate-900 dark:text-foreground">Missed Call</h3>
                  </div>
                  <div className="pl-11">
                    <p className="text-slate-600 dark:text-slate-400">John Smith called Wolfie Plumbing</p>
                  </div>
                </div>

                {/* Step 2: Automated Text Sent */}
                <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-sm font-bold">2</span>
                    </div>
                    <h3 className="font-semibold text-slate-900 dark:text-foreground">Automated Text Sent</h3>
                  </div>
                  <div className="pl-11">
                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border-l-4 border-blue-600">
                      <p className="text-blue-900 dark:text-blue-100 text-sm">
                        "Hi, this is Wolfie Plumbing. Sorry we missed your call. How can we help?"
                      </p>
                    </div>
                  </div>
                </div>

                {/* Step 3: Customer Replies */}
                <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 bg-emerald-600 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-sm font-bold">3</span>
                    </div>
                    <h3 className="font-semibold text-slate-900 dark:text-foreground">Customer Replies</h3>
                  </div>
                  <div className="pl-11">
                    <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-3 border-l-4 border-emerald-600">
                      <p className="text-emerald-900 dark:text-emerald-100 text-sm">
                        "My water heater is leaking."
                      </p>
                    </div>
                  </div>
                </div>

                {/* Step 4: Lead Captured */}
                <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 border border-green-200 dark:border-green-800">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-sm font-bold">4</span>
                    </div>
                    <h3 className="font-semibold text-green-900 dark:text-green-100">Lead Captured</h3>
                  </div>
                  <div className="pl-11">
                    <p className="text-green-700 dark:text-green-300 text-sm">Conversation saved in dashboard</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* CTA Section */}
          <div className="mt-12 text-center space-y-4">
            <Link
              href="/auth?mode=signup"
              className="inline-flex items-center justify-center h-12 px-8 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors shadow-sm hover:shadow-md hover:-translate-y-[1px] transition-all"
            >
              Start Your 14-Day Free Trial
            </Link>
            <div className="space-y-1">
              <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">$59/month after trial</p>
              <p className="text-xs text-slate-500 dark:text-slate-500">No contracts • Cancel anytime</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
